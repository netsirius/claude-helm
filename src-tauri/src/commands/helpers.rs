use tauri::State;

use crate::ssh::connection::SharedHandle;
use crate::state::AppState;

/// Look up VPS connection details and obtain a pooled SSH handle.
///
/// Shared helper used by session_commands and extension_commands.
pub async fn get_handle(
    state: &State<'_, AppState>,
    vps_id: &str,
) -> Result<SharedHandle, String> {
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
