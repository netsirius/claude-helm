use std::fs;
use serde::Serialize;
use tauri::State;

use crate::ssh::commands::exec_command;
use crate::ssh::probe::ProbeResult;
use crate::ssh::sessions::{self, RemoteSession};
use crate::state::AppState;

/// Activity status for a running agent session.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentActivity {
    pub status: String,
    pub detail: String,
    pub last_output: String,
}

/// List all Claude Manager tmux sessions on a remote machine.
#[tauri::command]
pub async fn list_sessions(
    state: State<'_, AppState>,
    remote_id: String,
) -> Result<Vec<RemoteSession>, String> {
    let handle = get_handle(&state, &remote_id).await?;
    sessions::list_sessions(&handle).await
}

/// Create a new Claude tmux session on a remote machine.
///
/// Uses the cached probe result to find the `claude` binary path.
/// Updates the agent's `current_session_id` and `current_remote_id` in config.
#[tauri::command]
pub async fn create_session(
    state: State<'_, AppState>,
    remote_id: String,
    agent_id: String,
    working_dir: String,
    model: Option<String>,
) -> Result<String, String> {
    // Load probe cache to find claude path
    let claude_path = {
        let store = state.config.lock().await;
        let probes_dir = store.base_dir().join("probes");
        let probe_path = probes_dir.join(format!("{}.json", remote_id));

        // Guard against path traversal via crafted remote ID
        if !probe_path.starts_with(&probes_dir) {
            return Err(format!(
                "Invalid remote ID '{}': results in path traversal",
                remote_id
            ));
        }

        let probe_json = fs::read_to_string(&probe_path)
            .map_err(|_| format!("No probe cache for remote '{}'. Run probe first.", remote_id))?;
        let probe: ProbeResult = serde_json::from_str(&probe_json)
            .map_err(|e| format!("Failed to parse probe cache: {}", e))?;
        probe
            .claude_path
            .ok_or_else(|| format!("Claude CLI not found on remote '{}'", remote_id))?
    };

    // Validate and build the claude command with optional model flag
    // Trust prompt is auto-accepted via tmux send-keys in sessions::create_session
    let claude_cmd = match model {
        Some(ref m) => {
            let model_re = regex_lite::Regex::new(r"^[a-zA-Z0-9_\-\.]+$").unwrap();
            if !model_re.is_match(m) {
                return Err(format!(
                    "Invalid model name '{}': must match [a-zA-Z0-9_\\-.]+ ",
                    m
                ));
            }
            format!("{} --model {}", claude_path, m)
        }
        None => claude_path,
    };

    // Use agent_id as the session name suffix
    let session_name = format!("cm-{}", agent_id.chars().take(8).collect::<String>());

    let handle = get_handle(&state, &remote_id).await?;
    let created_name = sessions::create_session(&handle, &session_name, &working_dir, &claude_cmd).await?;

    // Update agent mapping
    {
        let mut agents_config = state.agents_config.lock().await;
        if let Some(agent) = agents_config.get_mut(&agent_id) {
            agent.current_session_id = Some(created_name.clone());
            agent.current_remote_id = Some(remote_id.clone());
        }

        let store = state.config.lock().await;
        store
            .save("agents.json", &*agents_config)
            .map_err(|e| format!("Failed to save agents config: {}", e))?;
    }

    Ok(created_name)
}

/// Stop (kill) a Claude tmux session on a remote machine.
///
/// Clears the agent's `current_session_id` and `current_remote_id` if they match.
#[tauri::command]
pub async fn stop_session(
    state: State<'_, AppState>,
    remote_id: String,
    session_id: String,
) -> Result<(), String> {
    let handle = get_handle(&state, &remote_id).await?;
    sessions::stop_session(&handle, &session_id).await?;

    // Clear session mapping from any agent that references this session
    {
        let mut agents_config = state.agents_config.lock().await;
        for agent in &mut agents_config.agents {
            if agent.current_session_id.as_deref() == Some(&session_id) {
                agent.current_session_id = None;
                agent.current_remote_id = None;
            }
        }

        let store = state.config.lock().await;
        store
            .save("agents.json", &*agents_config)
            .map_err(|e| format!("Failed to save agents config: {}", e))?;
    }

    Ok(())
}

/// Capture the last 200 lines of output from a Claude tmux session.
#[tauri::command]
pub async fn capture_session_output(
    state: State<'_, AppState>,
    remote_id: String,
    session_id: String,
) -> Result<String, String> {
    let handle = get_handle(&state, &remote_id).await?;
    sessions::capture_pane(&handle, &session_id, 200).await
}

/// Get the current activity status of an agent session by analyzing tmux pane output.
#[tauri::command]
pub async fn get_agent_activity(
    state: State<'_, AppState>,
    remote_id: String,
    session_id: String,
) -> Result<AgentActivity, String> {
    let handle = get_handle(&state, &remote_id).await?;
    let output = sessions::capture_pane(&handle, &session_id, 10).await?;

    let lines: Vec<&str> = output.lines().collect();

    // Find last non-empty line
    let last_non_empty = lines.iter().rev().find(|l| !l.trim().is_empty());

    let (status, detail) = if let Some(line) = last_non_empty {
        let trimmed = line.trim();
        if trimmed.ends_with('❯')
            || trimmed.ends_with('>')
            || trimmed == "❯"
            || trimmed == ">"
        {
            ("waiting".to_string(), "Waiting for input".to_string())
        } else if trimmed.contains("Thinking")
            || trimmed.contains("⠋")
            || trimmed.contains("⠙")
            || trimmed.contains("⠹")
            || trimmed.contains("⠸")
            || trimmed.contains("⠼")
            || trimmed.contains("⠴")
            || trimmed.contains("⠦")
            || trimmed.contains("⠧")
            || trimmed.contains("⠇")
            || trimmed.contains("⠏")
        {
            ("thinking".to_string(), "Thinking...".to_string())
        } else {
            // Check all captured lines for tool use indicators
            let full_output = output.to_lowercase();
            let tool_patterns: &[(&str, &str)] = &[
                ("read(", "Reading"),
                ("read (", "Reading"),
                ("write(", "Writing"),
                ("write (", "Writing"),
                ("edit(", "Editing"),
                ("edit (", "Editing"),
                ("bash(", "Running command"),
                ("bash (", "Running command"),
                ("grep(", "Searching"),
                ("grep (", "Searching"),
                ("glob(", "Finding files"),
                ("glob (", "Finding files"),
            ];

            let mut found_tool: Option<(&str, String)> = None;
            for (pattern, action) in tool_patterns {
                if full_output.contains(pattern) {
                    // Try to extract the argument from the original (non-lowered) output
                    let arg = extract_tool_arg(&output, pattern);
                    let detail_str = if let Some(a) = arg {
                        format!("{} {}", action, a)
                    } else {
                        action.to_string()
                    };
                    found_tool = Some((action, detail_str));
                    break;
                }
            }

            if let Some((_action, detail_str)) = found_tool {
                ("working".to_string(), detail_str)
            } else {
                ("busy".to_string(), "Processing...".to_string())
            }
        }
    } else {
        ("busy".to_string(), "Processing...".to_string())
    };

    // Build last 2 lines preview
    let last_output = lines
        .iter()
        .rev()
        .filter(|l| !l.trim().is_empty())
        .take(2)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|l| {
            let s = l.trim();
            if s.len() > 120 {
                format!("{}...", &s[..117])
            } else {
                s.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    Ok(AgentActivity {
        status,
        detail,
        last_output,
    })
}

/// Extract a short argument from a tool invocation pattern in the output.
fn extract_tool_arg(output: &str, pattern: &str) -> Option<String> {
    // Find the pattern case-insensitively and extract the rest of the line
    let lower = output.to_lowercase();
    if let Some(pos) = lower.find(pattern) {
        let after = &output[pos + pattern.len()..];
        // Take until closing paren or end of line
        let end = after.find(')').unwrap_or_else(|| {
            after.find('\n').unwrap_or(after.len())
        });
        let arg = after[..end].trim().trim_matches('"').trim_matches('\'');
        if !arg.is_empty() && arg.len() < 80 {
            return Some(arg.to_string());
        }
    }
    None
}

/// Open a remote tmux session in Terminal.app via AppleScript.
#[tauri::command]
pub async fn open_session_terminal(
    state: State<'_, AppState>,
    remote_id: String,
    session_id: String,
) -> Result<(), String> {
    let (host, port, user, key_path) = {
        let config = state.remote_config.lock().await;
        let remote = config
            .get(&remote_id)
            .ok_or_else(|| format!("Remote '{}' not found", remote_id))?;
        (
            remote.host.clone(),
            remote.port,
            remote.user.clone(),
            remote.ssh_key_path.clone(),
        )
    };

    let ssh_cmd = format!(
        "ssh {}@{} -p {} -i {} -t 'tmux attach -t {}'",
        user, host, port, key_path, session_id
    );

    // Escape backslashes and double quotes for AppleScript string embedding
    let escaped_ssh_cmd = ssh_cmd.replace('\\', "\\\\").replace('"', "\\\"");

    let script = format!(
        "tell application \"Terminal\"\n  activate\n  do script \"{}\"\nend tell",
        escaped_ssh_cmd
    );

    std::process::Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .spawn()
        .map_err(|e| format!("Failed to open Terminal: {}", e))?;

    Ok(())
}

/// Start remote-control mode for a Claude session and return the generated URL.
///
/// Sends `/remote-control` to the tmux session, waits for Claude to generate
/// a URL, then captures the pane output and extracts the URL.
#[tauri::command]
pub async fn start_remote_control(
    state: State<'_, AppState>,
    remote_id: String,
    session_id: String,
) -> Result<String, String> {
    let handle = get_handle(&state, &remote_id).await?;

    // First check if remote-control is already active by capturing current output
    let pre_output = sessions::capture_pane(&handle, &session_id, 30).await?;
    let pre_clean = strip_ansi(&pre_output);

    if let Some(url) = extract_claude_url(&pre_clean) {
        return Ok(url);
    }

    // Send /remote-control command to the Claude session via tmux
    let send_cmd = format!(
        "tmux send-keys -t '{}' '/remote-control' Enter",
        session_id
    );
    exec_command(&handle, &send_cmd).await?;

    // Poll for the URL (up to 10 seconds)
    for _ in 0..5 {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        let output = sessions::capture_pane(&handle, &session_id, 30).await?;
        let clean = strip_ansi(&output);

        if let Some(url) = extract_claude_url(&clean) {
            // If a menu appeared (Disconnect/Continue), press Esc to dismiss it
            if clean.contains("Disconnect this session") || clean.contains("Continue") {
                let esc_cmd = format!("tmux send-keys -t '{}' Escape", session_id);
                let _ = exec_command(&handle, &esc_cmd).await;
            }
            return Ok(url);
        }
    }

    Err("Could not find remote control URL after 10 seconds. Make sure the session is at Claude's idle prompt (❯).".to_string())
}

/// Strip ANSI escape codes from a string.
fn strip_ansi(input: &str) -> String {
    let re = regex_lite::Regex::new(r"\x1b\[[0-9;]*[a-zA-Z]").unwrap();
    re.replace_all(input, "").to_string()
}

/// Extract a claude.ai URL from text.
fn extract_claude_url(text: &str) -> Option<String> {
    for line in text.lines() {
        let trimmed = line.trim();
        // Look for the URL directly
        if let Some(start) = trimmed.find("https://claude.ai/") {
            let url_part = &trimmed[start..];
            // Take until whitespace, comma, period at end, or end of line
            let end = url_part.find(|c: char| c.is_whitespace() || c == ',' || c == ')').unwrap_or(url_part.len());
            let url = url_part[..end].trim_end_matches('.');
            if url.contains("/code/") || url.contains("/remote/") || url.contains("/session") {
                return Some(url.to_string());
            }
        }
    }
    None
}

/// Helper: look up connection details for a remote and obtain a pooled SSH handle.
async fn get_handle(
    state: &State<'_, AppState>,
    remote_id: &str,
) -> Result<crate::ssh::connection::SharedHandle, String> {
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
