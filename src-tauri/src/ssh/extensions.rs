use serde::{Deserialize, Serialize};

use super::commands::exec_command;
use super::connection::SharedHandle;

/// Type of extension discovered on a remote VPS.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ExtensionType {
    Mcp,
    Skill,
    Plugin,
    Agent,
}

/// A discovered extension on a remote VPS.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Extension {
    pub ext_type: ExtensionType,
    pub name: String,
    pub version: String,
    pub enabled: bool,
    pub config: serde_json::Value,
}

/// Discover extensions installed on the remote VPS.
///
/// Checks two sources:
/// 1. `~/.claude/settings.json` — parses `mcpServers` key for MCP extensions
/// 2. `~/.claude/plugins/` — lists plugin directories
pub async fn list_extensions(handle: &SharedHandle) -> Result<Vec<Extension>, String> {
    let mut extensions = Vec::new();

    // --- MCP servers from settings.json ---
    let settings_cmd = "cat ~/.claude/settings.json 2>/dev/null || echo '{}'";
    let settings_result = exec_command(handle, settings_cmd).await?;
    let settings_json = settings_result.stdout.trim();

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(settings_json) {
        if let Some(mcp_servers) = parsed.get("mcpServers").and_then(|v| v.as_object()) {
            for (name, config) in mcp_servers {
                let enabled = config
                    .get("disabled")
                    .and_then(|v| v.as_bool())
                    .map(|d| !d)
                    .unwrap_or(true);

                extensions.push(Extension {
                    ext_type: ExtensionType::Mcp,
                    name: name.clone(),
                    version: String::from("installed"),
                    enabled,
                    config: config.clone(),
                });
            }
        }
    }

    // --- Plugins from ~/.claude/plugins/ ---
    let plugins_cmd = "ls -1 ~/.claude/plugins/ 2>/dev/null || true";
    let plugins_result = exec_command(handle, plugins_cmd).await?;
    let plugins_output = plugins_result.stdout.trim();

    if !plugins_output.is_empty() {
        for plugin_name in plugins_output.lines() {
            let trimmed = plugin_name.trim();
            if trimmed.is_empty() {
                continue;
            }

            extensions.push(Extension {
                ext_type: ExtensionType::Plugin,
                name: trimmed.to_string(),
                version: String::from("installed"),
                enabled: true,
                config: serde_json::Value::Null,
            });
        }
    }

    Ok(extensions)
}
