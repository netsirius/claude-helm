use tauri::State;

use crate::ssh::connection::SharedHandle;
use crate::state::AppState;

/// Look up server connection details and obtain a pooled SSH handle.
///
/// Shared helper used by session_commands and extension_commands.
pub async fn get_handle(
    state: &State<'_, AppState>,
    server_id: &str,
) -> Result<SharedHandle, String> {
    let (host, port, user, key_path) = {
        let config = state.server_config.lock().await;
        let server = config
            .get(server_id)
            .ok_or_else(|| format!("Server '{}' not found", server_id))?;
        (
            server.host.clone(),
            server.port,
            server.user.clone(),
            server.ssh_key_path.clone(),
        )
    };

    state
        .ssh_pool
        .get_or_connect(server_id, &host, port, &user, &key_path)
        .await
}
