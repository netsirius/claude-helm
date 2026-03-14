use chrono::Utc;
use std::fs;
use tauri::State;

use crate::config::vps::{Vps, VpsStatus};
use crate::ssh::commands::exec_command;
use crate::ssh::probe::{run_probe, ProbeResult};
use crate::state::AppState;

/// Return the full list of configured VPS servers.
#[tauri::command]
pub async fn list_vps(state: State<'_, AppState>) -> Result<Vec<Vps>, String> {
    let config = state.vps_config.lock().await;
    Ok(config.servers.clone())
}

/// Add a new VPS entry and persist to disk.
#[tauri::command]
pub async fn add_vps(
    state: State<'_, AppState>,
    name: String,
    host: String,
    user: String,
    ssh_key_path: String,
    port: Option<u16>,
    tags: Option<Vec<String>>,
    group: Option<String>,
) -> Result<Vps, String> {
    let mut vps = Vps::new(name, host, user, ssh_key_path);

    if let Some(p) = port {
        vps.port = p;
    }
    if let Some(t) = tags {
        vps.tags = t;
    }
    if let Some(g) = group {
        vps.group = g;
    }

    let result = vps.clone();

    let mut config = state.vps_config.lock().await;
    config.add(vps);

    // Persist
    let store = state.config.lock().await;
    store
        .save("vps.json", &*config)
        .map_err(|e| format!("Failed to save VPS config: {}", e))?;

    Ok(result)
}

/// Remove a VPS by ID and persist to disk.  Returns `true` if the entry existed.
#[tauri::command]
pub async fn remove_vps(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let mut config = state.vps_config.lock().await;
    let removed = config.remove(&id);

    if removed {
        // Disconnect any pooled SSH session for this VPS
        let _ = state.ssh_pool.disconnect(&id).await;

        // Persist
        let store = state.config.lock().await;
        store
            .save("vps.json", &*config)
            .map_err(|e| format!("Failed to save VPS config: {}", e))?;
    }

    Ok(removed)
}

/// Test connectivity to a VPS by SSHing in and running `echo ok`.
///
/// Updates the VPS status to Online or Offline and persists the change.
#[tauri::command]
pub async fn test_vps_connection(
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    // Read connection details while holding the lock briefly
    let (host, port, user, key_path) = {
        let config = state.vps_config.lock().await;
        let vps = config
            .get(&id)
            .ok_or_else(|| format!("VPS '{}' not found", id))?;
        (
            vps.host.clone(),
            vps.port,
            vps.user.clone(),
            vps.ssh_key_path.clone(),
        )
    };

    let handle = state
        .ssh_pool
        .get_or_connect(&id, &host, port, &user, &key_path)
        .await;

    let online = match handle {
        Ok(h) => {
            let result = exec_command(&h, "echo ok").await;
            matches!(result, Ok(r) if r.exit_code == 0 && r.stdout.trim() == "ok")
        }
        Err(_) => false,
    };

    // Update status
    {
        let mut config = state.vps_config.lock().await;
        if let Some(vps) = config.get_mut(&id) {
            vps.status = if online {
                VpsStatus::Online
            } else {
                VpsStatus::Offline
            };
            vps.last_seen = Utc::now().to_rfc3339();
        }

        let store = state.config.lock().await;
        store
            .save("vps.json", &*config)
            .map_err(|e| format!("Failed to save VPS config: {}", e))?;
    }

    Ok(online)
}

/// Run a capability probe on the remote VPS and save the result to `probes/<id>.json`.
#[tauri::command]
pub async fn probe_vps(
    state: State<'_, AppState>,
    id: String,
) -> Result<ProbeResult, String> {
    // Read connection details
    let (host, port, user, key_path) = {
        let config = state.vps_config.lock().await;
        let vps = config
            .get(&id)
            .ok_or_else(|| format!("VPS '{}' not found", id))?;
        (
            vps.host.clone(),
            vps.port,
            vps.user.clone(),
            vps.ssh_key_path.clone(),
        )
    };

    let handle = state
        .ssh_pool
        .get_or_connect(&id, &host, port, &user, &key_path)
        .await?;

    let probe = run_probe(&handle).await?;

    // Save probe result to probes/<id>.json
    {
        let store = state.config.lock().await;
        let probes_dir = store.base_dir().join("probes");
        fs::create_dir_all(&probes_dir)
            .map_err(|e| format!("Failed to create probes directory: {}", e))?;

        let probe_json = serde_json::to_string_pretty(&probe)
            .map_err(|e| format!("Failed to serialise probe result: {}", e))?;
        let probe_path = probes_dir.join(format!("{}.json", id));
        fs::write(&probe_path, &probe_json)
            .map_err(|e| format!("Failed to write probe file: {}", e))?;
    }

    // Mark VPS as online since the probe succeeded
    {
        let mut config = state.vps_config.lock().await;
        if let Some(vps) = config.get_mut(&id) {
            vps.status = VpsStatus::Online;
            vps.last_seen = Utc::now().to_rfc3339();
        }

        let store = state.config.lock().await;
        store
            .save("vps.json", &*config)
            .map_err(|e| format!("Failed to save VPS config: {}", e))?;
    }

    Ok(probe)
}
