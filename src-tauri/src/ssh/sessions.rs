use serde::{Deserialize, Serialize};

use super::commands::exec_command;
use super::connection::SharedHandle;

/// A discovered remote tmux session managed by Claude Manager.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSession {
    pub session_id: String,
    pub pid: Option<u32>,
    pub status: SessionStatus,
    pub working_dir: String,
    pub created_at: String,
}

/// Whether a Claude process is actively running inside the tmux session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Running,
    Exited,
}

/// List all Claude Manager tmux sessions on the remote host.
///
/// Sessions are identified by the `cm-` prefix.  For each session we check
/// whether a `claude` process is still running inside the pane by inspecting
/// the pane PID and walking /proc.
pub async fn list_sessions(handle: &SharedHandle) -> Result<Vec<RemoteSession>, String> {
    // Get session list with pane pid and current path
    let list_cmd = concat!(
        "tmux list-sessions -F '#{session_name}|#{session_created}|#{pane_pid}|#{pane_current_path}' ",
        "2>/dev/null | grep '^cm-' || true"
    );

    let result = exec_command(handle, list_cmd).await?;
    let output = result.stdout.trim();

    if output.is_empty() {
        return Ok(vec![]);
    }

    let mut sessions = Vec::new();

    for line in output.lines() {
        let parts: Vec<&str> = line.splitn(4, '|').collect();
        if parts.len() < 4 {
            continue;
        }

        let session_name = parts[0].to_string();
        let created_ts = parts[1].to_string();
        let pane_pid: Option<u32> = parts[2].parse().ok();
        let working_dir = parts[3].to_string();

        // Check if claude is running inside this session's pane
        let status = if let Some(ppid) = pane_pid {
            let check_cmd = format!(
                "ps --ppid {} -o comm= 2>/dev/null | grep -q claude && echo running || echo exited",
                ppid
            );
            let check_result = exec_command(handle, &check_cmd).await;
            match check_result {
                Ok(r) if r.stdout.trim() == "running" => SessionStatus::Running,
                _ => SessionStatus::Exited,
            }
        } else {
            SessionStatus::Exited
        };

        sessions.push(RemoteSession {
            session_id: session_name,
            pid: pane_pid,
            status,
            working_dir,
            created_at: created_ts,
        });
    }

    Ok(sessions)
}

/// Create a new tmux session that runs the Claude CLI.
///
/// The session is named with the `cm-` prefix so `list_sessions` can discover it.
/// Returns the full session name on success.
pub async fn create_session(
    handle: &SharedHandle,
    session_name: &str,
    working_dir: &str,
    claude_path: &str,
) -> Result<String, String> {
    let prefixed = if session_name.starts_with("cm-") {
        session_name.to_string()
    } else {
        format!("cm-{}", session_name)
    };

    // Escape single quotes for the shell
    let escaped_path = claude_path.replace('\'', "'\\''");
    let escaped_dir = working_dir.replace('\'', "'\\''");

    let cmd = format!(
        "tmux new-session -d -s '{}' -c '{}' '{}'",
        prefixed, escaped_dir, escaped_path
    );

    let result = exec_command(handle, &cmd).await?;

    if result.exit_code != 0 {
        return Err(format!(
            "Failed to create tmux session '{}': {}",
            prefixed,
            result.stderr.trim()
        ));
    }

    Ok(prefixed)
}

/// Kill a tmux session by name.
pub async fn stop_session(handle: &SharedHandle, session_name: &str) -> Result<(), String> {
    let cmd = format!("tmux kill-session -t '{}'", session_name);
    let result = exec_command(handle, &cmd).await?;

    if result.exit_code != 0 {
        return Err(format!(
            "Failed to kill tmux session '{}': {}",
            session_name,
            result.stderr.trim()
        ));
    }

    Ok(())
}

/// Capture the last N lines of output from a tmux session's pane.
pub async fn capture_pane(
    handle: &SharedHandle,
    session_name: &str,
    lines: u32,
) -> Result<String, String> {
    let cmd = format!(
        "tmux capture-pane -t '{}' -p -S -{}",
        session_name, lines
    );
    let result = exec_command(handle, &cmd).await?;

    if result.exit_code != 0 {
        return Err(format!(
            "Failed to capture pane for '{}': {}",
            session_name,
            result.stderr.trim()
        ));
    }

    Ok(result.stdout)
}
