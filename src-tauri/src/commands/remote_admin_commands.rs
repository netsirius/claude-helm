use serde::{Deserialize, Serialize};
use tauri::State;

use crate::ssh::commands::exec_command;
use crate::state::AppState;

use super::helpers::get_handle;

// ─── Data Types ──────────────────────────────────────────────────────────────

/// A skill discovered via `claude skills list` on the remote machine.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSkill {
    pub name: String,
    pub description: String,
}

/// A plugin from `~/.claude/plugins/installed_plugins.json`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePlugin {
    pub name: String,
    pub version: String,
    pub scope: String,
    pub install_path: String,
    pub installed_at: String,
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

/// Result of installing a plugin on a remote machine.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstallResult {
    pub success: bool,
    pub output: String,
}

/// A skill from the skills.sh marketplace search API.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSkill {
    pub name: String,
    pub owner_repo: String,
    pub installs: u64,
    pub description: String,
}

// ─── Commands ────────────────────────────────────────────────────────────────

/// List skills discovered via `claude skills list` on the remote machine.
///
/// Parses the human-readable output looking for lines like:
///   - **name** — description
///   /name — description
#[tauri::command]
pub async fn list_remote_skills(
    state: State<'_, AppState>,
    remote_id: String,
) -> Result<Vec<RemoteSkill>, String> {
    let handle = get_handle(&state, &remote_id).await?;

    let result = exec_command(
        &handle,
        "claude skills list 2>/dev/null || echo ''",
    )
    .await?;

    let mut skills = Vec::new();
    let output = result.stdout.trim();

    if output.is_empty() || result.exit_code != 0 {
        return Ok(skills);
    }

    for line in output.lines() {
        let line = line.trim();

        // Match patterns like:
        //   - **skill-name** — description text
        //   /skill-name — description text
        //   - skill-name — description text
        if let Some(rest) = line.strip_prefix("- **") {
            // Format: - **name** — description
            if let Some(name_end) = rest.find("**") {
                let name = rest[..name_end].trim().to_string();
                let desc_part = &rest[name_end + 2..];
                let description = desc_part
                    .trim_start_matches(|c: char| c == ' ' || c == '—' || c == '-')
                    .trim()
                    .to_string();
                skills.push(RemoteSkill { name, description });
            }
        } else if line.starts_with('/') {
            // Format: /name — description
            let without_slash = &line[1..];
            let (name, description) = if let Some(sep_pos) = without_slash.find('—') {
                (
                    without_slash[..sep_pos].trim().to_string(),
                    without_slash[sep_pos + '—'.len_utf8()..].trim().to_string(),
                )
            } else if let Some(sep_pos) = without_slash.find(" - ") {
                (
                    without_slash[..sep_pos].trim().to_string(),
                    without_slash[sep_pos + 3..].trim().to_string(),
                )
            } else {
                (without_slash.trim().to_string(), String::new())
            };
            if !name.is_empty() {
                skills.push(RemoteSkill { name, description });
            }
        } else if line.starts_with("- ") && !line.starts_with("- **") {
            // Format: - name — description
            let rest = &line[2..];
            let (name, description) = if let Some(sep_pos) = rest.find('—') {
                (
                    rest[..sep_pos].trim().to_string(),
                    rest[sep_pos + '—'.len_utf8()..].trim().to_string(),
                )
            } else if let Some(sep_pos) = rest.find(" - ") {
                (
                    rest[..sep_pos].trim().to_string(),
                    rest[sep_pos + 3..].trim().to_string(),
                )
            } else {
                (rest.trim().to_string(), String::new())
            };
            if !name.is_empty() {
                skills.push(RemoteSkill { name, description });
            }
        }
    }

    Ok(skills)
}

/// List installed plugins from `~/.claude/plugins/installed_plugins.json`.
///
/// Parses the JSON file to extract plugin name, version, scope, installPath, installedAt.
#[tauri::command]
pub async fn list_remote_plugins(
    state: State<'_, AppState>,
    remote_id: String,
) -> Result<Vec<RemotePlugin>, String> {
    let handle = get_handle(&state, &remote_id).await?;

    let result = exec_command(
        &handle,
        "cat ~/.claude/plugins/installed_plugins.json 2>/dev/null || echo '{}'",
    )
    .await?;

    let mut plugins = Vec::new();
    let json_str = result.stdout.trim();

    if json_str.is_empty() || json_str == "{}" {
        return Ok(plugins);
    }

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
        if let Some(plugins_obj) = parsed.get("plugins").and_then(|v| v.as_object()) {
            for (plugin_key, installs) in plugins_obj {
                // Each plugin key maps to an array of installations
                if let Some(install_arr) = installs.as_array() {
                    for install in install_arr {
                        let version = install
                            .get("version")
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown")
                            .to_string();

                        let scope = install
                            .get("scope")
                            .and_then(|v| v.as_str())
                            .unwrap_or("user")
                            .to_string();

                        let install_path = install
                            .get("installPath")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();

                        let installed_at = install
                            .get("installedAt")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();

                        plugins.push(RemotePlugin {
                            name: plugin_key.clone(),
                            version,
                            scope,
                            install_path,
                            installed_at,
                        });
                    }
                }
            }
        }
    }

    Ok(plugins)
}

/// Install a plugin on a remote machine via `npx skillsadd <skill_id>`.
///
/// The skill_id should be in "owner/repo" format (e.g. "anthropics/skills").
/// Returns the install output.
#[tauri::command]
pub async fn install_plugin_on_remote(
    state: State<'_, AppState>,
    remote_id: String,
    skill_id: String,
) -> Result<PluginInstallResult, String> {
    let handle = get_handle(&state, &remote_id).await?;

    // Validate the skill_id format (should be owner/repo, no shell injection)
    if skill_id.contains('\'')
        || skill_id.contains(';')
        || skill_id.contains('|')
        || skill_id.contains('&')
        || skill_id.contains('`')
        || skill_id.contains('$')
    {
        return Err("Invalid skill ID: contains disallowed characters".to_string());
    }

    let escaped_id = skill_id.replace('\'', "'\\''");
    let cmd = format!(
        "npx skillsadd '{}' 2>&1",
        escaped_id
    );

    let result = exec_command(&handle, &cmd).await?;
    let output = format!("{}{}", result.stdout, result.stderr);

    Ok(PluginInstallResult {
        success: result.exit_code == 0,
        output: output.trim().to_string(),
    })
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

/// Search the skills.sh marketplace for plugins.
///
/// Uses `curl` to fetch results from `https://skills.sh/api/search?q=<query>`
/// and parses the JSON response into `MarketplaceSkill` items.
#[tauri::command]
pub async fn search_skills_marketplace(
    query: String,
) -> Result<Vec<MarketplaceSkill>, String> {
    let trimmed = query.trim().to_string();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    // URL-encode the query for safety
    let encoded_query: String = trimmed
        .chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            ' ' => "+".to_string(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect();

    let url = format!("https://skills.sh/api/search?q={}", encoded_query);

    let output = std::process::Command::new("curl")
        .args(["-s", "-m", "10", &url])
        .output()
        .map_err(|e| format!("Failed to execute curl: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Marketplace search failed (exit {})",
            output.status.code().unwrap_or(-1)
        ));
    }

    let body = String::from_utf8_lossy(&output.stdout);
    let body = body.trim();

    if body.is_empty() {
        return Ok(Vec::new());
    }

    // Parse the response — skills.sh returns a JSON array or object with results.
    // We try several shapes to be resilient to API changes.
    let parsed: serde_json::Value = serde_json::from_str(body)
        .map_err(|e| format!("Failed to parse marketplace response: {}", e))?;

    let mut skills = Vec::new();

    // Shape 1: top-level array of result objects
    // Shape 2: { "results": [...] } or { "skills": [...] } or { "data": [...] }
    let items = if let Some(arr) = parsed.as_array() {
        arr.clone()
    } else if let Some(arr) = parsed.get("results").and_then(|v| v.as_array()) {
        arr.clone()
    } else if let Some(arr) = parsed.get("skills").and_then(|v| v.as_array()) {
        arr.clone()
    } else if let Some(arr) = parsed.get("data").and_then(|v| v.as_array()) {
        arr.clone()
    } else {
        return Ok(Vec::new());
    };

    for item in &items {
        // Extract name — try several field names
        let name = item
            .get("name")
            .or_else(|| item.get("title"))
            .or_else(|| item.get("skill_name"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // Extract owner/repo path
        let owner_repo = item
            .get("owner_repo")
            .or_else(|| item.get("ownerRepo"))
            .or_else(|| item.get("repo"))
            .or_else(|| item.get("path"))
            .or_else(|| item.get("slug"))
            .or_else(|| item.get("full_name"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // Extract install count
        let installs = item
            .get("installs")
            .or_else(|| item.get("install_count"))
            .or_else(|| item.get("installCount"))
            .or_else(|| item.get("downloads"))
            .and_then(|v| v.as_u64().or_else(|| v.as_f64().map(|f| f as u64)))
            .unwrap_or(0);

        // Extract description
        let description = item
            .get("description")
            .or_else(|| item.get("summary"))
            .or_else(|| item.get("short_description"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        if !name.is_empty() || !owner_repo.is_empty() {
            skills.push(MarketplaceSkill {
                name: if name.is_empty() {
                    owner_repo.split('/').last().unwrap_or("").to_string()
                } else {
                    name
                },
                owner_repo,
                installs,
                description,
            });
        }
    }

    Ok(skills)
}
