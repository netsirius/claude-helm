use serde::{Deserialize, Serialize};

use super::commands::exec_command;
use super::connection::SharedHandle;

/// Capabilities discovered on a remote VPS by running a probe script.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub claude_path: Option<String>,
    pub claude_version: Option<String>,
    pub has_tmux: bool,
    pub has_screen: bool,
    pub has_flock: bool,
    pub config_dir: Option<String>,
    pub settings_format: String,
    pub shell: String,
}

/// The probe script that runs on the remote host and outputs JSON.
const PROBE_SCRIPT: &str = r#"
set -e

# Helper: JSON-escape a string value (handles backslashes and double quotes)
json_str() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

claude_path=$(command -v claude 2>/dev/null || echo "")
claude_version=""
if [ -n "$claude_path" ]; then
    claude_version=$($claude_path --version 2>/dev/null || echo "unknown")
fi

has_tmux=false
command -v tmux >/dev/null 2>&1 && has_tmux=true

has_screen=false
command -v screen >/dev/null 2>&1 && has_screen=true

has_flock=false
command -v flock >/dev/null 2>&1 && has_flock=true

config_dir=""
if [ -d "$HOME/.claude" ]; then
    config_dir="$HOME/.claude"
fi

settings_format="unknown"
if [ -f "$HOME/.claude/settings.json" ]; then
    settings_format="json"
elif [ -f "$HOME/.claude/settings.toml" ]; then
    settings_format="toml"
fi

current_shell=$(basename "$SHELL" 2>/dev/null || echo "unknown")

# Output as JSON
cat <<ENDJSON
{
    "claudePath": $(if [ -n "$claude_path" ]; then printf '"%s"' "$(json_str "$claude_path")"; else echo "null"; fi),
    "claudeVersion": $(if [ -n "$claude_version" ]; then printf '"%s"' "$(json_str "$claude_version")"; else echo "null"; fi),
    "hasTmux": $has_tmux,
    "hasScreen": $has_screen,
    "hasFlock": $has_flock,
    "configDir": $(if [ -n "$config_dir" ]; then printf '"%s"' "$(json_str "$config_dir")"; else echo "null"; fi),
    "settingsFormat": "$(json_str "$settings_format")",
    "shell": "$(json_str "$current_shell")"
}
ENDJSON
"#;

/// Run the capability probe on a remote VPS via SSH.
///
/// Executes a bash script that checks for Claude CLI, tmux, screen, flock,
/// and other environment details, returning the parsed result.
pub async fn run_probe(handle: &SharedHandle) -> Result<ProbeResult, String> {
    let result = exec_command(handle, PROBE_SCRIPT).await?;

    if result.exit_code != 0 {
        return Err(format!(
            "Probe script failed (exit {}): {}",
            result.exit_code,
            result.stderr.trim()
        ));
    }

    let probe: ProbeResult = serde_json::from_str(result.stdout.trim())
        .map_err(|e| format!("Failed to parse probe output: {} — raw: {}", e, result.stdout))?;

    Ok(probe)
}
