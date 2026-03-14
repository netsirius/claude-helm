use russh::ChannelMsg;

use super::connection::SharedHandle;

/// Result of executing a remote command over SSH.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: u32,
}

/// Execute a command on the remote host via SSH.
///
/// The command is wrapped in `bash -c '...'` for consistent shell behavior.
/// Opens a session channel, executes the command, and collects stdout, stderr,
/// and exit code from the channel messages.
pub async fn exec_command(
    handle: &SharedHandle,
    command: &str,
) -> Result<CommandResult, String> {
    // Escape single quotes in the command for bash -c wrapping
    let escaped = command.replace('\'', "'\\''");
    let wrapped = format!("bash -c '{}'", escaped);

    let mut channel = {
        let handle_guard = handle.lock().await;
        handle_guard
            .channel_open_session()
            .await
            .map_err(|e| format!("Failed to open SSH session channel: {}", e))?
    };

    channel
        .exec(true, wrapped.as_bytes())
        .await
        .map_err(|e| format!("Failed to exec command: {}", e))?;

    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let mut exit_code: u32 = 0;

    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::Data { data } => {
                stdout.extend_from_slice(&data);
            }
            ChannelMsg::ExtendedData { data, ext } => {
                // ext == 1 is stderr per RFC 4254
                if ext == 1 {
                    stderr.extend_from_slice(&data);
                }
            }
            ChannelMsg::ExitStatus { exit_status } => {
                exit_code = exit_status;
            }
            ChannelMsg::Eof | ChannelMsg::Close => {
                break;
            }
            _ => {}
        }
    }

    // Ensure channel is closed
    let _ = channel.close().await;

    Ok(CommandResult {
        stdout: String::from_utf8_lossy(&stdout).into_owned(),
        stderr: String::from_utf8_lossy(&stderr).into_owned(),
        exit_code,
    })
}
