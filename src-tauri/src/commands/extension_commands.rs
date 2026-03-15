use tauri::State;

use crate::ssh::extensions::{self, Extension};
use crate::state::AppState;

/// List extensions discovered on a remote VPS.
///
/// Parses `~/.claude/settings.json` for MCP servers and scans
/// `~/.claude/plugins/` for installed plugins.
#[tauri::command]
pub async fn list_vps_extensions(
    state: State<'_, AppState>,
    vps_id: String,
) -> Result<Vec<Extension>, String> {
    let handle = get_handle(&state, &vps_id).await?;
    extensions::list_extensions(&handle).await
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
