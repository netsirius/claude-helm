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

    // Get agent info for session configuration
    let (agent_name, agent_system_prompt) = {
        let agents = state.agents_config.lock().await;
        match agents.get(&agent_id) {
            Some(a) => (a.name.clone(), a.claude_md.clone()),
            None => (String::new(), String::new()),
        }
    };

    // Build the claude command with all flags
    let mut cmd_parts = vec![claude_path.clone()];

    // Auto-accept all permission prompts for unattended sessions
    cmd_parts.push("--permission-mode auto".to_string());

    if let Some(ref m) = model {
        let model_re = regex_lite::Regex::new(r"^[a-zA-Z0-9_\-\.]+$").unwrap();
        if !model_re.is_match(m) {
            return Err(format!(
                "Invalid model name '{}': must match [a-zA-Z0-9_\\-.]+ ",
                m
            ));
        }
        cmd_parts.push(format!("--model {}", m));
    }
    if !agent_name.is_empty() {
        let safe_name = agent_name.replace('\'', "").replace('"', "");
        cmd_parts.push(format!("--name \"{}\"", safe_name));
    }
    // Inject agent system prompt if configured
    if !agent_system_prompt.is_empty() {
        let safe_prompt = agent_system_prompt
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n");
        cmd_parts.push(format!("--system-prompt \"{}\"", safe_prompt));
    }
    let claude_cmd = cmd_parts.join(" ");

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
#[tauri::command]
pub async fn start_remote_control(
    state: State<'_, AppState>,
    remote_id: String,
    session_id: String,
) -> Result<String, String> {
    let handle = get_handle(&state, &remote_id).await?;

    // Check if URL already in pane output
    if let Some(url) = find_rc_url(&handle, &session_id).await {
        return Ok(url);
    }

    // Send /remote-control
    let send_cmd = format!("tmux send-keys -t {} /remote-control Enter", session_id);
    exec_command(&handle, &send_cmd).await?;

    // Poll for URL (up to 12s)
    for _ in 0..4 {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        if let Some(url) = find_rc_url(&handle, &session_id).await {
            // Dismiss menu if visible
            let esc = format!("tmux send-keys -t {} Escape", session_id);
            let _ = exec_command(&handle, &esc).await;
            return Ok(url);
        }
    }

    Err("Could not find remote control URL. Make sure the session is at Claude's idle prompt.".to_string())
}

/// Capture tmux pane and extract claude.ai URL using remote-side grep.
/// Avoids single-quote escaping issues by writing a temp script.
async fn find_rc_url(
    handle: &crate::ssh::connection::SharedHandle,
    session_id: &str,
) -> Option<String> {
    // Write a small script to avoid quote escaping issues with bash -c wrapping
    let script = format!(
        "tmux capture-pane -t {} -p -S -50 2>/dev/null | tr -d '\\033' | grep -o 'https://claude.ai/[^ ]*' | head -1",
        session_id
    );
    // Execute via a heredoc to avoid escaping hell
    let _cmd = format!("sh -c \"{}\"", script.replace('"', "\\\""));

    // Actually, simplest approach: just capture and let Rust find the URL
    let capture_cmd = format!("tmux capture-pane -t {} -p -S -50", session_id);
    match exec_command(handle, &capture_cmd).await {
        Ok(result) => {
            let output = result.stdout;
            // Simple byte-level search for the URL
            for line in output.lines() {
                if let Some(pos) = line.find("https://claude.ai/") {
                    let rest = &line[pos..];
                    let end = rest.find(|c: char| c.is_whitespace()).unwrap_or(rest.len());
                    let url = rest[..end].trim();
                    if !url.is_empty() {
                        return Some(url.to_string());
                    }
                }
            }
            None
        }
        Err(_) => None,
    }
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
