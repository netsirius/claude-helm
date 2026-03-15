use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::State;

use crate::state::AppState;

/// PID of the running MCP server process (0 = not running).
static MCP_PID: AtomicU32 = AtomicU32::new(0);

/// Path to the MCP server entry point.
fn mcp_server_path() -> String {
    // The MCP server is bundled relative to the app, or at a known absolute path.
    // For development, use the workspace path.
    let dev_path = dirs::home_dir()
        .unwrap_or_default()
        .join("workspace/claude-manager/mcp-server/dist/index.js");
    dev_path.to_string_lossy().to_string()
}

/// Start the MCP server as a background process.
#[tauri::command]
pub async fn start_mcp_server(_state: State<'_, AppState>) -> Result<String, String> {
    let current = MCP_PID.load(Ordering::Relaxed);
    if current != 0 {
        // Check if still alive
        let alive = Command::new("kill")
            .args(["-0", &current.to_string()])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if alive {
            return Ok(format!("MCP server already running (PID {})", current));
        }
        // Stale PID
        MCP_PID.store(0, Ordering::Relaxed);
    }

    let server_path = mcp_server_path();

    // Also register in Claude Code settings if not already there
    let _ = Command::new("claude")
        .args(["mcp", "add", "claude-manager", "-s", "user", "node", &server_path])
        .output();

    let child = Command::new("node")
        .arg(&server_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start MCP server: {}", e))?;

    let pid = child.id();
    MCP_PID.store(pid, Ordering::Relaxed);

    Ok(format!("MCP server started (PID {})", pid))
}

/// Stop the running MCP server.
#[tauri::command]
pub async fn stop_mcp_server(_state: State<'_, AppState>) -> Result<String, String> {
    let pid = MCP_PID.load(Ordering::Relaxed);
    if pid == 0 {
        return Ok("MCP server is not running".to_string());
    }

    let _ = Command::new("kill")
        .arg(pid.to_string())
        .status();

    MCP_PID.store(0, Ordering::Relaxed);

    // Unregister from Claude Code settings
    let _ = Command::new("claude")
        .args(["mcp", "remove", "claude-manager", "-s", "user"])
        .output();

    Ok(format!("MCP server stopped (PID {})", pid))
}

/// Check if the MCP server is running.
#[tauri::command]
pub async fn mcp_server_status(_state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let pid = MCP_PID.load(Ordering::Relaxed);

    if pid == 0 {
        // Check if registered in Claude Code even if we didn't start it
        let output = Command::new("claude")
            .args(["mcp", "list"])
            .output();

        let registered = match output {
            Ok(o) => String::from_utf8_lossy(&o.stdout).contains("claude-manager"),
            Err(_) => false,
        };

        return Ok(serde_json::json!({
            "running": false,
            "pid": null,
            "registered": registered,
        }));
    }

    // Check if process is still alive
    let alive = Command::new("kill")
        .args(["-0", &pid.to_string()])
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    if !alive {
        MCP_PID.store(0, Ordering::Relaxed);
    }

    Ok(serde_json::json!({
        "running": alive,
        "pid": if alive { Some(pid) } else { None },
        "registered": true,
    }))
}
