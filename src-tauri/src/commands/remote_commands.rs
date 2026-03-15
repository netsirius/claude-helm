use chrono::Utc;
use serde::Serialize;
use std::fs;
use tauri::State;

use crate::config::remote::{Remote, RemoteStatus};
use crate::ssh::commands::exec_command;
use crate::ssh::probe::{run_probe, ProbeResult};
use crate::state::AppState;

use super::helpers::get_handle;

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

// ─── Feature 1: Remote File Browser ─────────────────────────────────────────

/// A single directory entry returned by `browse_remote_dir`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub entry_type: String, // "directory", "file", "symlink"
    pub size: u64,
    pub permissions: String,
}

/// Browse a directory on a remote machine via SSH.
///
/// Returns a list of entries (files, directories, symlinks) with metadata.
/// Skips the `.` and `..` entries.
#[tauri::command]
pub async fn browse_remote_dir(
    state: State<'_, AppState>,
    remote_id: String,
    path: String,
) -> Result<Vec<DirEntry>, String> {
    let handle = get_handle(&state, &remote_id).await?;

    // Escape single quotes in the path for safe shell usage
    let escaped_path = path.replace('\'', "'\\''");
    let cmd = format!(
        "ls -la --time-style=+%s '{}' 2>/dev/null || ls -la '{}' 2>/dev/null",
        escaped_path, escaped_path
    );

    let result = exec_command(&handle, &cmd).await?;

    if result.exit_code != 0 {
        return Err(format!(
            "Failed to list directory '{}': {}",
            path,
            result.stderr.trim()
        ));
    }

    let mut entries = Vec::new();

    for line in result.stdout.lines() {
        let line = line.trim();
        // Skip the total line and empty lines
        if line.is_empty() || line.starts_with("total ") {
            continue;
        }

        let parts: Vec<&str> = line.splitn(9, char::is_whitespace).collect();
        if parts.len() < 9 {
            // On macOS ls -la (without --time-style), the format has fewer/more fields.
            // Try a simpler parse: permissions, links, owner, group, size, month, day, time/year, name
            let parts2: Vec<&str> = line.split_whitespace().collect();
            if parts2.len() < 9 {
                continue;
            }

            let permissions = parts2[0];
            let name = parts2[8..].join(" ");

            // Skip . and ..
            if name == "." || name == ".." {
                continue;
            }

            let size: u64 = parts2[4].parse().unwrap_or(0);

            let entry_type = if permissions.starts_with('d') {
                "directory"
            } else if permissions.starts_with('l') {
                "symlink"
            } else {
                "file"
            };

            entries.push(DirEntry {
                name,
                entry_type: entry_type.to_string(),
                size,
                permissions: permissions.to_string(),
            });
            continue;
        }

        let permissions = parts[0];
        // The last field is the name
        let name = parts[8..].join(" ");

        // Skip . and ..
        if name == "." || name == ".." {
            continue;
        }

        let size: u64 = parts[4].trim().parse().unwrap_or(0);

        let entry_type = if permissions.starts_with('d') {
            "directory"
        } else if permissions.starts_with('l') {
            "symlink"
        } else {
            "file"
        };

        entries.push(DirEntry {
            name,
            entry_type: entry_type.to_string(),
            size,
            permissions: permissions.to_string(),
        });
    }

    Ok(entries)
}

// ─── Feature 2: Remote Claude Settings Editor ───────────────────────────────

/// Read the Claude CLI settings JSON from a remote machine.
///
/// Returns the raw JSON string from `~/.claude/settings.json`.
#[tauri::command]
pub async fn read_remote_claude_config(
    state: State<'_, AppState>,
    remote_id: String,
) -> Result<String, String> {
    let handle = get_handle(&state, &remote_id).await?;

    let result = exec_command(&handle, "cat ~/.claude/settings.json 2>/dev/null").await?;

    if result.exit_code != 0 || result.stdout.trim().is_empty() {
        // Return an empty JSON object if the file doesn't exist yet
        return Ok("{}".to_string());
    }

    Ok(result.stdout)
}

/// Write the Claude CLI settings JSON to a remote machine.
///
/// Uses atomic write (write to temp file, then mv) with optional flock
/// to avoid corrupting the settings file.
#[tauri::command]
pub async fn write_remote_claude_config(
    state: State<'_, AppState>,
    remote_id: String,
    config: String,
) -> Result<(), String> {
    let handle = get_handle(&state, &remote_id).await?;

    // Escape single quotes in the JSON config
    let escaped_config = config.replace('\'', "'\\''");

    // Ensure the directory exists, write atomically
    let cmd = format!(
        "mkdir -p ~/.claude && printf '%s' '{}' > ~/.claude/settings.json.tmp && mv ~/.claude/settings.json.tmp ~/.claude/settings.json",
        escaped_config
    );

    let result = exec_command(&handle, &cmd).await?;

    if result.exit_code != 0 {
        return Err(format!(
            "Failed to write Claude settings: {}",
            result.stderr.trim()
        ));
    }

    Ok(())
}

// ─── Feature 3: Auto-Install Claude ─────────────────────────────────────────

/// Install the Claude CLI on a remote machine.
///
/// Runs the official Claude install script via curl, then re-probes
/// the remote to update the cached probe result.
#[tauri::command]
pub async fn install_claude_remote(
    state: State<'_, AppState>,
    remote_id: String,
) -> Result<String, String> {
    let handle = get_handle(&state, &remote_id).await?;

    let result = exec_command(
        &handle,
        "curl -fsSL https://claude.ai/install.sh | sh 2>&1",
    )
    .await?;

    let output = format!("{}{}", result.stdout, result.stderr);

    if result.exit_code != 0 {
        return Err(format!("Claude install failed (exit {}): {}", result.exit_code, output.trim()));
    }

    // Re-probe the remote to update cached capabilities
    let probe = run_probe(&handle).await?;

    // Save updated probe result
    {
        let store = state.config.lock().await;
        let probes_dir = store.base_dir().join("probes");
        fs::create_dir_all(&probes_dir)
            .map_err(|e| format!("Failed to create probes directory: {}", e))?;

        let probe_json = serde_json::to_string_pretty(&probe)
            .map_err(|e| format!("Failed to serialise probe result: {}", e))?;
        let probe_path = probes_dir.join(format!("{}.json", remote_id));

        if !probe_path.starts_with(&probes_dir) {
            return Err(format!(
                "Invalid remote ID '{}': results in path traversal",
                remote_id
            ));
        }

        fs::write(&probe_path, &probe_json)
            .map_err(|e| format!("Failed to write probe file: {}", e))?;
    }

    Ok(output)
}

/// Structured result returned by the Claude update command.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateResult {
    pub updated: bool,
    pub old_version: String,
    pub new_version: String,
    pub message: String,
}

/// Update (or re-install) Claude CLI on a remote machine.
///
/// Tries `claude update` first; if that fails, falls back to the
/// official install script which handles both fresh installs and updates.
/// Re-probes after the update to refresh cached capabilities.
/// Returns a structured `UpdateResult` comparing old and new versions.
#[tauri::command]
pub async fn update_claude_remote(
    state: State<'_, AppState>,
    remote_id: String,
) -> Result<UpdateResult, String> {
    let handle = get_handle(&state, &remote_id).await?;

    // Read the old version from the cached probe file (if available)
    let old_version = {
        let store = state.config.lock().await;
        let probe_path = store.base_dir().join("probes").join(format!("{}.json", remote_id));
        if probe_path.exists() {
            fs::read_to_string(&probe_path)
                .ok()
                .and_then(|json| serde_json::from_str::<ProbeResult>(&json).ok())
                .and_then(|p| p.claude_version)
                .unwrap_or_else(|| "unknown".to_string())
        } else {
            "unknown".to_string()
        }
    };

    // Try `claude update` first, fall back to the install script
    let result = exec_command(
        &handle,
        "claude update 2>&1 || curl -fsSL https://claude.ai/install.sh | sh 2>&1",
    )
    .await?;

    let output = format!("{}{}", result.stdout, result.stderr);

    if result.exit_code != 0 {
        return Err(format!(
            "Claude update failed (exit {}): {}",
            result.exit_code,
            output.trim()
        ));
    }

    // Re-probe the remote to update cached capabilities
    let probe = run_probe(&handle).await?;

    // Save updated probe result
    {
        let store = state.config.lock().await;
        let probes_dir = store.base_dir().join("probes");
        fs::create_dir_all(&probes_dir)
            .map_err(|e| format!("Failed to create probes directory: {}", e))?;

        let probe_json = serde_json::to_string_pretty(&probe)
            .map_err(|e| format!("Failed to serialise probe result: {}", e))?;
        let probe_path = probes_dir.join(format!("{}.json", remote_id));

        if !probe_path.starts_with(&probes_dir) {
            return Err(format!(
                "Invalid remote ID '{}': results in path traversal",
                remote_id
            ));
        }

        fs::write(&probe_path, &probe_json)
            .map_err(|e| format!("Failed to write probe file: {}", e))?;
    }

    let new_version = probe
        .claude_version
        .unwrap_or_else(|| "unknown".to_string());

    let updated = old_version != new_version && old_version != "unknown";
    let message = if updated {
        format!("Updated to {}", new_version)
    } else if old_version == "unknown" {
        format!("Claude is at {}", new_version)
    } else {
        format!("Already on latest version ({})", new_version)
    };

    Ok(UpdateResult {
        updated,
        old_version,
        new_version,
        message,
    })
}
