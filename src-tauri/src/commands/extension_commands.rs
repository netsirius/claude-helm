use tauri::State;

use crate::ssh::extensions::{self, Extension};
use crate::state::AppState;

use super::helpers::get_handle;

/// List extensions discovered on a remote server.
///
/// Parses `~/.claude/settings.json` for MCP servers and scans
/// `~/.claude/plugins/` for installed plugins.
#[tauri::command]
pub async fn list_server_extensions(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<Extension>, String> {
    let handle = get_handle(&state, &server_id).await?;
    extensions::list_extensions(&handle).await
}
