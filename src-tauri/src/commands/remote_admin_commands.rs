use serde::Serialize;
use tauri::State;

use crate::ssh::commands::exec_command;
use crate::state::AppState;

use super::helpers::get_handle;

// ─── Data Types ──────────────────────────────────────────────────────────────

/// A skill discovered on the remote machine.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSkill {
    pub name: String,
    pub path: String,
}

/// A hook definition from the Claude settings.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteHook {
    pub event: String,
    pub command: String,
    pub config: serde_json::Value,
}

/// An MCP server definition from the Claude settings.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteMcp {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: serde_json::Value,
    pub enabled: bool,
    pub config: serde_json::Value,
}

/// A custom agent definition from the Claude settings.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteAgent {
    pub name: String,
    pub description: String,
    pub config: serde_json::Value,
}

// ─── Commands ────────────────────────────────────────────────────────────────

/// List skills discovered in `~/.claude/` on the remote machine.
///
/// Searches for files named `SKILL.md` or `skill.md` under `~/.claude/`.
#[tauri::command]
pub async fn list_remote_skills(
    state: State<'_, AppState>,
    remote_id: String,
) -> Result<Vec<RemoteSkill>, String> {
    let handle = get_handle(&state, &remote_id).await?;

    let result = exec_command(
        &handle,
        "find ~/.claude -maxdepth 4 \\( -name 'SKILL.md' -o -name 'skill.md' \\) 2>/dev/null | head -50",
    )
    .await?;

    let mut skills = Vec::new();
    for line in result.stdout.lines() {
        let path = line.trim();
        if path.is_empty() {
            continue;
        }
        // Extract skill name from parent directory
        // e.g. ~/.claude/skills/my-skill/SKILL.md -> my-skill
        let name = std::path::Path::new(path)
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string());

        skills.push(RemoteSkill {
            name,
            path: path.to_string(),
        });
    }

    Ok(skills)
}

/// List hooks from the Claude settings on the remote machine.
///
/// Parses the `hooks` key from `~/.claude/settings.json`.
#[tauri::command]
pub async fn list_remote_hooks(
    state: State<'_, AppState>,
    remote_id: String,
) -> Result<Vec<RemoteHook>, String> {
    let handle = get_handle(&state, &remote_id).await?;

    let result = exec_command(
        &handle,
        "cat ~/.claude/settings.json 2>/dev/null || echo '{}'",
    )
    .await?;

    let mut hooks = Vec::new();
    let settings_json = result.stdout.trim();

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(settings_json) {
        if let Some(hooks_obj) = parsed.get("hooks").and_then(|v| v.as_object()) {
            for (event, hook_config) in hooks_obj {
                // hooks can be an array of hook configs or a single config
                if let Some(arr) = hook_config.as_array() {
                    for item in arr {
                        let command = item
                            .get("command")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        hooks.push(RemoteHook {
                            event: event.clone(),
                            command,
                            config: item.clone(),
                        });
                    }
                } else if hook_config.is_object() {
                    let command = hook_config
                        .get("command")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    hooks.push(RemoteHook {
                        event: event.clone(),
                        command,
                        config: hook_config.clone(),
                    });
                }
            }
        }
    }

    Ok(hooks)
}

/// List MCP servers from the Claude settings on the remote machine.
///
/// Parses the `mcpServers` key from `~/.claude/settings.json`.
#[tauri::command]
pub async fn list_remote_mcps(
    state: State<'_, AppState>,
    remote_id: String,
) -> Result<Vec<RemoteMcp>, String> {
    let handle = get_handle(&state, &remote_id).await?;

    let result = exec_command(
        &handle,
        "cat ~/.claude/settings.json 2>/dev/null || echo '{}'",
    )
    .await?;

    let mut mcps = Vec::new();
    let settings_json = result.stdout.trim();

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(settings_json) {
        if let Some(mcp_servers) = parsed.get("mcpServers").and_then(|v| v.as_object()) {
            for (name, config) in mcp_servers {
                let command = config
                    .get("command")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let args = config
                    .get("args")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();

                let env = config
                    .get("env")
                    .cloned()
                    .unwrap_or(serde_json::Value::Null);

                let enabled = config
                    .get("disabled")
                    .and_then(|v| v.as_bool())
                    .map(|d| !d)
                    .unwrap_or(true);

                mcps.push(RemoteMcp {
                    name: name.clone(),
                    command,
                    args,
                    env,
                    enabled,
                    config: config.clone(),
                });
            }
        }
    }

    Ok(mcps)
}

/// List custom agents from the Claude settings on the remote machine.
///
/// Parses agent definitions from `~/.claude/settings.json`.
#[tauri::command]
pub async fn list_remote_agents(
    state: State<'_, AppState>,
    remote_id: String,
) -> Result<Vec<RemoteAgent>, String> {
    let handle = get_handle(&state, &remote_id).await?;

    let result = exec_command(
        &handle,
        "cat ~/.claude/settings.json 2>/dev/null || echo '{}'",
    )
    .await?;

    let mut agents = Vec::new();
    let settings_json = result.stdout.trim();

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(settings_json) {
        // Check for "agents" key (could be an object or array)
        if let Some(agents_obj) = parsed.get("agents").and_then(|v| v.as_object()) {
            for (name, config) in agents_obj {
                let description = config
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                agents.push(RemoteAgent {
                    name: name.clone(),
                    description,
                    config: config.clone(),
                });
            }
        } else if let Some(agents_arr) = parsed.get("agents").and_then(|v| v.as_array()) {
            for config in agents_arr {
                let name = config
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unnamed")
                    .to_string();
                let description = config
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                agents.push(RemoteAgent {
                    name,
                    description,
                    config: config.clone(),
                });
            }
        }

        // Also check "projects" key for project-based agents
        if let Some(projects_obj) = parsed.get("projects").and_then(|v| v.as_object()) {
            for (name, config) in projects_obj {
                if config.get("agent").is_some() || config.get("model").is_some() {
                    let description = config
                        .get("description")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Project agent")
                        .to_string();
                    agents.push(RemoteAgent {
                        name: name.clone(),
                        description,
                        config: config.clone(),
                    });
                }
            }
        }
    }

    Ok(agents)
}

/// Remove an extension (MCP, skill, or hook) from the remote machine.
#[tauri::command]
pub async fn remove_remote_extension(
    state: State<'_, AppState>,
    remote_id: String,
    ext_type: String,
    name: String,
) -> Result<(), String> {
    let handle = get_handle(&state, &remote_id).await?;

    match ext_type.as_str() {
        "mcp" => {
            // Read settings, remove the MCP server, write back
            let result = exec_command(
                &handle,
                "cat ~/.claude/settings.json 2>/dev/null || echo '{}'",
            )
            .await?;

            let mut parsed: serde_json::Value =
                serde_json::from_str(result.stdout.trim())
                    .map_err(|e| format!("Failed to parse settings: {}", e))?;

            if let Some(mcp_servers) = parsed.get_mut("mcpServers").and_then(|v| v.as_object_mut())
            {
                mcp_servers.remove(&name);
            }

            let new_json = serde_json::to_string_pretty(&parsed)
                .map_err(|e| format!("Failed to serialise settings: {}", e))?;
            let escaped = new_json.replace('\'', "'\\''");
            let write_cmd = format!(
                "printf '%s' '{}' > ~/.claude/settings.json.tmp && mv ~/.claude/settings.json.tmp ~/.claude/settings.json",
                escaped
            );
            let write_result = exec_command(&handle, &write_cmd).await?;
            if write_result.exit_code != 0 {
                return Err(format!(
                    "Failed to write settings: {}",
                    write_result.stderr.trim()
                ));
            }
        }
        "skill" => {
            // Remove the skill directory
            // Safety: only allow removal under ~/.claude/
            let escaped_name = name.replace('\'', "'\\''");
            let cmd = format!(
                "find ~/.claude -maxdepth 4 \\( -name 'SKILL.md' -o -name 'skill.md' \\) 2>/dev/null | while read f; do d=$(dirname \"$f\"); bn=$(basename \"$d\"); if [ \"$bn\" = '{}' ]; then rm -rf \"$d\"; echo \"removed $d\"; fi; done",
                escaped_name
            );
            let result = exec_command(&handle, &cmd).await?;
            if result.exit_code != 0 {
                return Err(format!(
                    "Failed to remove skill: {}",
                    result.stderr.trim()
                ));
            }
        }
        "hook" => {
            // Read settings, remove the hook by event name, write back
            let result = exec_command(
                &handle,
                "cat ~/.claude/settings.json 2>/dev/null || echo '{}'",
            )
            .await?;

            let mut parsed: serde_json::Value =
                serde_json::from_str(result.stdout.trim())
                    .map_err(|e| format!("Failed to parse settings: {}", e))?;

            if let Some(hooks) = parsed.get_mut("hooks").and_then(|v| v.as_object_mut()) {
                hooks.remove(&name);
            }

            let new_json = serde_json::to_string_pretty(&parsed)
                .map_err(|e| format!("Failed to serialise settings: {}", e))?;
            let escaped = new_json.replace('\'', "'\\''");
            let write_cmd = format!(
                "printf '%s' '{}' > ~/.claude/settings.json.tmp && mv ~/.claude/settings.json.tmp ~/.claude/settings.json",
                escaped
            );
            let write_result = exec_command(&handle, &write_cmd).await?;
            if write_result.exit_code != 0 {
                return Err(format!(
                    "Failed to write settings: {}",
                    write_result.stderr.trim()
                ));
            }
        }
        _ => {
            return Err(format!("Unknown extension type: {}", ext_type));
        }
    }

    Ok(())
}

/// Toggle an MCP server enabled/disabled on the remote machine.
#[tauri::command]
pub async fn toggle_remote_extension(
    state: State<'_, AppState>,
    remote_id: String,
    ext_type: String,
    name: String,
    enabled: bool,
) -> Result<(), String> {
    let handle = get_handle(&state, &remote_id).await?;

    if ext_type != "mcp" {
        return Err(format!(
            "Toggle is only supported for MCP servers, not '{}'",
            ext_type
        ));
    }

    // Read settings, toggle the disabled flag, write back
    let result = exec_command(
        &handle,
        "cat ~/.claude/settings.json 2>/dev/null || echo '{}'",
    )
    .await?;

    let mut parsed: serde_json::Value =
        serde_json::from_str(result.stdout.trim())
            .map_err(|e| format!("Failed to parse settings: {}", e))?;

    if let Some(mcp_servers) = parsed.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
        if let Some(server) = mcp_servers.get_mut(&name) {
            if let Some(obj) = server.as_object_mut() {
                if enabled {
                    obj.remove("disabled");
                } else {
                    obj.insert(
                        "disabled".to_string(),
                        serde_json::Value::Bool(true),
                    );
                }
            }
        } else {
            return Err(format!("MCP server '{}' not found", name));
        }
    } else {
        return Err("No mcpServers found in settings".to_string());
    }

    let new_json = serde_json::to_string_pretty(&parsed)
        .map_err(|e| format!("Failed to serialise settings: {}", e))?;
    let escaped = new_json.replace('\'', "'\\''");
    let write_cmd = format!(
        "printf '%s' '{}' > ~/.claude/settings.json.tmp && mv ~/.claude/settings.json.tmp ~/.claude/settings.json",
        escaped
    );
    let write_result = exec_command(&handle, &write_cmd).await?;
    if write_result.exit_code != 0 {
        return Err(format!(
            "Failed to write settings: {}",
            write_result.stderr.trim()
        ));
    }

    Ok(())
}
