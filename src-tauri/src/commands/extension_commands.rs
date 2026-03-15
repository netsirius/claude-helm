use tauri::State;

use crate::ssh::extensions::{self, Extension};
use crate::state::AppState;

use super::helpers::get_handle;

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
