use std::fs;
use tauri::State;

use crate::ssh::probe::ProbeResult;
use crate::ssh::sessions::{self, RemoteSession};
use crate::state::AppState;

/// List all Claude Manager tmux sessions on a remote VPS.
#[tauri::command]
pub async fn list_sessions(
    state: State<'_, AppState>,
    vps_id: String,
) -> Result<Vec<RemoteSession>, String> {
    let handle = get_handle(&state, &vps_id).await?;
    sessions::list_sessions(&handle).await
}

/// Create a new Claude tmux session on a remote VPS.
///
/// Uses the cached probe result to find the `claude` binary path.
/// Updates the agent's `current_session_id` and `current_vps_id` in config.
#[tauri::command]
pub async fn create_session(
    state: State<'_, AppState>,
    vps_id: String,
    agent_id: String,
    working_dir: String,
    model: Option<String>,
) -> Result<String, String> {
    // Load probe cache to find claude path
    let claude_path = {
        let store = state.config.lock().await;
        let probe_path = store.base_dir().join("probes").join(format!("{}.json", vps_id));
        let probe_json = fs::read_to_string(&probe_path)
            .map_err(|_| format!("No probe cache for VPS '{}'. Run probe first.", vps_id))?;
        let probe: ProbeResult = serde_json::from_str(&probe_json)
            .map_err(|e| format!("Failed to parse probe cache: {}", e))?;
        probe
            .claude_path
            .ok_or_else(|| format!("Claude CLI not found on VPS '{}'", vps_id))?
    };

    // Build the claude command with optional model flag
    let claude_cmd = match model {
        Some(ref m) => format!("{} --model {}", claude_path, m),
        None => claude_path,
    };

    // Use agent_id as the session name suffix
    let session_name = format!("cm-{}", agent_id.chars().take(8).collect::<String>());

    let handle = get_handle(&state, &vps_id).await?;
    let created_name = sessions::create_session(&handle, &session_name, &working_dir, &claude_cmd).await?;

    // Update agent mapping
    {
        let mut agents_config = state.agents_config.lock().await;
        if let Some(agent) = agents_config.get_mut(&agent_id) {
            agent.current_session_id = Some(created_name.clone());
            agent.current_vps_id = Some(vps_id.clone());
        }

        let store = state.config.lock().await;
        store
            .save("agents.json", &*agents_config)
            .map_err(|e| format!("Failed to save agents config: {}", e))?;
    }

    Ok(created_name)
}

/// Stop (kill) a Claude tmux session on a remote VPS.
///
/// Clears the agent's `current_session_id` and `current_vps_id` if they match.
#[tauri::command]
pub async fn stop_session(
    state: State<'_, AppState>,
    vps_id: String,
    session_id: String,
) -> Result<(), String> {
    let handle = get_handle(&state, &vps_id).await?;
    sessions::stop_session(&handle, &session_id).await?;

    // Clear session mapping from any agent that references this session
    {
        let mut agents_config = state.agents_config.lock().await;
        for agent in &mut agents_config.agents {
            if agent.current_session_id.as_deref() == Some(&session_id) {
                agent.current_session_id = None;
                agent.current_vps_id = None;
            }
        }

        let store = state.config.lock().await;
        store
            .save("agents.json", &*agents_config)
            .map_err(|e| format!("Failed to save agents config: {}", e))?;
    }

    Ok(())
}

/// Capture the last 200 lines of output from a Claude tmux session.
#[tauri::command]
pub async fn capture_session_output(
    state: State<'_, AppState>,
    vps_id: String,
    session_id: String,
) -> Result<String, String> {
    let handle = get_handle(&state, &vps_id).await?;
    sessions::capture_pane(&handle, &session_id, 200).await
}

/// Helper: look up VPS connection details and obtain a pooled SSH handle.
async fn get_handle(
    state: &State<'_, AppState>,
    vps_id: &str,
) -> Result<crate::ssh::connection::SharedHandle, String> {
    let (host, port, user, key_path) = {
        let config = state.vps_config.lock().await;
        let vps = config
            .get(vps_id)
            .ok_or_else(|| format!("VPS '{}' not found", vps_id))?;
        (
            vps.host.clone(),
            vps.port,
            vps.user.clone(),
            vps.ssh_key_path.clone(),
        )
    };

    state
        .ssh_pool
        .get_or_connect(vps_id, &host, port, &user, &key_path)
        .await
}
