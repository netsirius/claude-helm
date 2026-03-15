use tauri::State;

use crate::ssh::extensions::{self, Extension};
use crate::state::AppState;

use super::helpers::get_handle;

/// List extensions discovered on a remote machine.
///
/// Parses `~/.claude/settings.json` for MCP servers and scans
/// `~/.claude/plugins/` for installed plugins.
#[tauri::command]
pub async fn list_remote_extensions(
    state: State<'_, AppState>,
    remote_id: String,
) -> Result<Vec<Extension>, String> {
    let handle = get_handle(&state, &remote_id).await?;
    extensions::list_extensions(&handle).await
}
