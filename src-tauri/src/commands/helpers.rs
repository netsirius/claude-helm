use tauri::State;

use crate::ssh::connection::SharedHandle;
use crate::state::AppState;

/// Look up remote connection details and obtain a pooled SSH handle.
///
/// Shared helper used by session_commands and extension_commands.
pub async fn get_handle(
    state: &State<'_, AppState>,
    remote_id: &str,
) -> Result<SharedHandle, String> {
    let (host, port, user, key_path) = {
        let config = state.remote_config.lock().await;
        let remote = config
            .get(remote_id)
            .ok_or_else(|| format!("Remote '{}' not found", remote_id))?;
        (
            remote.host.clone(),
            remote.port,
            remote.user.clone(),
            remote.ssh_key_path.clone(),
        )
    };

    state
        .ssh_pool
        .get_or_connect(remote_id, &host, port, &user, &key_path)
        .await
}
