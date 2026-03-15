use chrono::Utc;
use std::fs;
use tauri::State;

use crate::config::remote::{Remote, RemoteStatus};
use crate::ssh::commands::exec_command;
use crate::ssh::probe::{run_probe, ProbeResult};
use crate::state::AppState;

/// Return the full list of configured remotes.
#[tauri::command]
pub async fn list_remotes(state: State<'_, AppState>) -> Result<Vec<Remote>, String> {
    let config = state.remote_config.lock().await;
    Ok(config.remotes.clone())
}

/// Add a new remote entry and persist to disk.
#[tauri::command]
pub async fn add_remote(
    state: State<'_, AppState>,
    name: String,
    host: String,
    user: String,
    ssh_key_path: String,
    port: Option<u16>,
    tags: Option<Vec<String>>,
    group: Option<String>,
) -> Result<Remote, String> {
    let mut remote = Remote::new(name, host, user, ssh_key_path);

    if let Some(p) = port {
        remote.port = p;
    }
    if let Some(t) = tags {
        remote.tags = t;
    }
    if let Some(g) = group {
        remote.group = g;
    }

    let result = remote.clone();

    let mut config = state.remote_config.lock().await;
    config.add(remote);

    // Persist
    let store = state.config.lock().await;
    store
        .save("remotes.json", &*config)
        .map_err(|e| format!("Failed to save remote config: {}", e))?;

    Ok(result)
}

/// Update an existing remote entry, applying only the provided fields.
///
/// If connection-relevant fields (host, port, user, ssh_key_path) change,
/// the old SSH connection is disconnected so a fresh one will be created.
#[tauri::command]
pub async fn update_remote(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    host: Option<String>,
    user: Option<String>,
    port: Option<u16>,
    ssh_key_path: Option<String>,
    tags: Option<Vec<String>>,
    group: Option<String>,
) -> Result<Remote, String> {
    // Determine whether connection-relevant fields are changing
    let needs_reconnect;
    let updated;

    {
        let mut config = state.remote_config.lock().await;
        let remote = config
            .get_mut(&id)
            .ok_or_else(|| format!("Remote '{}' not found", id))?;

        // Check if any SSH-relevant field is being changed
        needs_reconnect = host.as_ref().is_some_and(|v| *v != remote.host)
            || port.is_some_and(|v| v != remote.port)
            || user.as_ref().is_some_and(|v| *v != remote.user)
            || ssh_key_path.as_ref().is_some_and(|v| *v != remote.ssh_key_path);

        // Apply only provided fields
        if let Some(v) = name {
            remote.name = v;
        }
        if let Some(v) = host {
            remote.host = v;
        }
        if let Some(v) = user {
            remote.user = v;
        }
        if let Some(v) = port {
            remote.port = v;
        }
        if let Some(v) = ssh_key_path {
            remote.ssh_key_path = v;
        }
        if let Some(v) = tags {
            remote.tags = v;
        }
        if let Some(v) = group {
            remote.group = v;
        }

        updated = remote.clone();

        // Persist — acquire config store while still holding remote_config
        let store = state.config.lock().await;
        store
            .save("remotes.json", &*config)
            .map_err(|e| format!("Failed to save remote config: {}", e))?;
    }

    // Disconnect old SSH session if connection details changed
    if needs_reconnect {
        let _ = state.ssh_pool.disconnect(&id).await;
    }

    Ok(updated)
}

/// Remove a remote by ID and persist to disk.  Returns `true` if the entry existed.
#[tauri::command]
pub async fn remove_remote(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let mut config = state.remote_config.lock().await;
    let removed = config.remove(&id);

    if removed {
        // Disconnect any pooled SSH session for this remote
        let _ = state.ssh_pool.disconnect(&id).await;

        // Persist
        let store = state.config.lock().await;
        store
            .save("remotes.json", &*config)
            .map_err(|e| format!("Failed to save remote config: {}", e))?;
    }

    Ok(removed)
}

/// Test connectivity to a remote by SSHing in and running `echo ok`.
///
/// Updates the remote status to Online or Offline and persists the change.
#[tauri::command]
pub async fn test_remote_connection(
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    // Read connection details while holding the lock briefly
    let (host, port, user, key_path) = {
        let config = state.remote_config.lock().await;
        let remote = config
            .get(&id)
            .ok_or_else(|| format!("Remote '{}' not found", id))?;
        (
            remote.host.clone(),
            remote.port,
            remote.user.clone(),
            remote.ssh_key_path.clone(),
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
        let mut config = state.remote_config.lock().await;
        if let Some(remote) = config.get_mut(&id) {
            remote.status = if online {
                RemoteStatus::Online
            } else {
                RemoteStatus::Offline
            };
            remote.last_seen = Utc::now().to_rfc3339();
        }

        let store = state.config.lock().await;
        store
            .save("remotes.json", &*config)
            .map_err(|e| format!("Failed to save remote config: {}", e))?;
    }

    Ok(online)
}

/// Run a capability probe on the remote machine and save the result to `probes/<id>.json`.
#[tauri::command]
pub async fn probe_remote(
    state: State<'_, AppState>,
    id: String,
) -> Result<ProbeResult, String> {
    // Read connection details
    let (host, port, user, key_path) = {
        let config = state.remote_config.lock().await;
        let remote = config
            .get(&id)
            .ok_or_else(|| format!("Remote '{}' not found", id))?;
        (
            remote.host.clone(),
            remote.port,
            remote.user.clone(),
            remote.ssh_key_path.clone(),
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

        // Guard against path traversal via crafted remote ID
        if !probe_path.starts_with(&probes_dir) {
            return Err(format!(
                "Invalid remote ID '{}': results in path traversal",
                id
            ));
        }

        fs::write(&probe_path, &probe_json)
            .map_err(|e| format!("Failed to write probe file: {}", e))?;
    }

    // Mark remote as online since the probe succeeded
    {
        let mut config = state.remote_config.lock().await;
        if let Some(remote) = config.get_mut(&id) {
            remote.status = RemoteStatus::Online;
            remote.last_seen = Utc::now().to_rfc3339();
        }

        let store = state.config.lock().await;
        store
            .save("remotes.json", &*config)
            .map_err(|e| format!("Failed to save remote config: {}", e))?;
    }

    Ok(probe)
}
