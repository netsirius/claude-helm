use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;

use chrono::Utc;
use tauri::State;
use tokio::sync::Mutex;

use crate::config::pipelines::{Pipeline, PipelineStatus, PipelineStep, StepStatus};
use crate::ssh::commands::exec_command;
use crate::ssh::sessions;
use crate::state::AppState;

// ─── ANSI / completion helpers ───────────────────────────────────────────────

/// Strip ANSI escape codes from captured terminal output.
fn strip_ansi(input: &str) -> String {
    let re = regex_lite::Regex::new(r"\x1b\[[0-9;]*[a-zA-Z]").unwrap();
    re.replace_all(input, "").to_string()
}

/// Detect whether Claude has finished processing and is idle.
///
/// Checks the last non-empty line for common prompt indicators.
fn is_claude_idle(output: &str) -> bool {
    output
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .map(|line| {
            let trimmed = line.trim();
            let rtrimmed = line.trim_start();
            trimmed.ends_with('\u{276F}') // ❯
                || trimmed.ends_with('>')
                || rtrimmed.ends_with("$ ")
        })
        .unwrap_or(false)
}

// ─── Topological sort ────────────────────────────────────────────────────────

/// Return step IDs in dependency-respecting execution order (Kahn's algorithm).
fn topological_sort(steps: &[PipelineStep]) -> Result<Vec<String>, String> {
    let ids: HashSet<&str> = steps.iter().map(|s| s.id.as_str()).collect();

    // Validate all dependency references
    for step in steps {
        for dep in &step.depends_on {
            if !ids.contains(dep.as_str()) {
                return Err(format!(
                    "Step '{}' depends on unknown step '{}'",
                    step.id, dep
                ));
            }
        }
    }

    let mut in_degree: HashMap<&str, usize> = HashMap::new();
    let mut dependents: HashMap<&str, Vec<&str>> = HashMap::new();

    for step in steps {
        in_degree.entry(step.id.as_str()).or_insert(0);
        for dep in &step.depends_on {
            *in_degree.entry(step.id.as_str()).or_insert(0) += 1;
            dependents
                .entry(dep.as_str())
                .or_default()
                .push(step.id.as_str());
        }
    }

    let mut queue: VecDeque<&str> = in_degree
        .iter()
        .filter(|(_, &deg)| deg == 0)
        .map(|(&id, _)| id)
        .collect();

    let mut order: Vec<String> = Vec::new();

    while let Some(current) = queue.pop_front() {
        order.push(current.to_string());
        if let Some(deps) = dependents.get(current) {
            for &dep in deps {
                if let Some(deg) = in_degree.get_mut(dep) {
                    *deg -= 1;
                    if *deg == 0 {
                        queue.push_back(dep);
                    }
                }
            }
        }
    }

    if order.len() != steps.len() {
        return Err("Pipeline contains a dependency cycle".to_string());
    }

    Ok(order)
}

// ─── Persist helper ──────────────────────────────────────────────────────────

/// Save the current pipelines config to disk.
///
/// Acquires both `pipelines_config` and `config` locks.  Callers must NOT hold
/// either lock when calling this.
async fn persist_pipelines(state: &AppState) -> Result<(), String> {
    let data = {
        let config = state.pipelines_config.lock().await;
        config.clone()
    };
    let store = state.config.lock().await;
    store
        .save("pipelines.json", &data)
        .map_err(|e| format!("Failed to save pipelines config: {}", e))
}

// ─── Cancellation token ──────────────────────────────────────────────────────

/// Shared flag that the cancel command sets to `true`.
type CancelFlag = Arc<Mutex<HashMap<String, bool>>>;

// Module-level static to track cancellation across commands.
static CANCEL_FLAGS: std::sync::LazyLock<CancelFlag> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

// ─── CRUD commands (unchanged) ───────────────────────────────────────────────

/// Return the full list of configured pipelines.
#[tauri::command]
pub async fn list_pipelines(state: State<'_, AppState>) -> Result<Vec<Pipeline>, String> {
    let config = state.pipelines_config.lock().await;
    Ok(config.pipelines.clone())
}

/// Create a new pipeline and persist to disk.
#[tauri::command]
pub async fn create_pipeline(
    state: State<'_, AppState>,
    name: String,
    description: String,
) -> Result<Pipeline, String> {
    let pipeline = Pipeline::new(name, description);
    let result = pipeline.clone();

    let data = {
        let mut config = state.pipelines_config.lock().await;
        config.add(pipeline);
        config.clone()
    };

    let store = state.config.lock().await;
    store
        .save("pipelines.json", &data)
        .map_err(|e| format!("Failed to save pipelines config: {}", e))?;

    Ok(result)
}

/// Add a step to an existing pipeline and persist to disk.
#[tauri::command]
pub async fn add_pipeline_step(
    state: State<'_, AppState>,
    pipeline_id: String,
    agent_id: String,
    prompt: String,
    depends_on: Vec<String>,
    label: Option<String>,
) -> Result<PipelineStep, String> {
    let label = label.unwrap_or_default();
    let mut step = PipelineStep::new(agent_id, prompt, label);
    step.depends_on = depends_on;
    let result = step.clone();

    let data = {
        let mut config = state.pipelines_config.lock().await;
        let pipeline = config
            .get_mut(&pipeline_id)
            .ok_or_else(|| format!("Pipeline '{}' not found", pipeline_id))?;
        pipeline.steps.push(step);
        config.clone()
    };

    let store = state.config.lock().await;
    store
        .save("pipelines.json", &data)
        .map_err(|e| format!("Failed to save pipelines config: {}", e))?;

    Ok(result)
}

/// Update a step within a pipeline and persist to disk.
#[tauri::command]
pub async fn update_pipeline_step(
    state: State<'_, AppState>,
    pipeline_id: String,
    step_id: String,
    label: Option<String>,
    agent_id: Option<String>,
    prompt: Option<String>,
    depends_on: Option<Vec<String>>,
    timeout: Option<u64>,
) -> Result<(), String> {
    let data = {
        let mut config = state.pipelines_config.lock().await;
        let pipeline = config
            .get_mut(&pipeline_id)
            .ok_or_else(|| format!("Pipeline '{}' not found", pipeline_id))?;
        let step = pipeline
            .steps
            .iter_mut()
            .find(|s| s.id == step_id)
            .ok_or_else(|| format!("Step '{}' not found", step_id))?;
        if let Some(l) = label {
            step.label = l;
        }
        if let Some(a) = agent_id {
            step.agent_id = a;
        }
        if let Some(p) = prompt {
            step.prompt = p;
        }
        if let Some(d) = depends_on {
            step.depends_on = d;
        }
        if let Some(t) = timeout {
            step.timeout = t;
        }
        config.clone()
    };

    let store = state.config.lock().await;
    store
        .save("pipelines.json", &data)
        .map_err(|e| format!("Failed to save pipelines config: {}", e))
}

/// Remove a step from a pipeline, clean up dangling dependencies, and persist to disk.
#[tauri::command]
pub async fn remove_pipeline_step(
    state: State<'_, AppState>,
    pipeline_id: String,
    step_id: String,
) -> Result<(), String> {
    let data = {
        let mut config = state.pipelines_config.lock().await;
        let pipeline = config
            .get_mut(&pipeline_id)
            .ok_or_else(|| format!("Pipeline '{}' not found", pipeline_id))?;
        pipeline.steps.retain(|s| s.id != step_id);
        // Clean up dangling dependencies
        for step in &mut pipeline.steps {
            step.depends_on.retain(|d| d != &step_id);
        }
        config.clone()
    };

    let store = state.config.lock().await;
    store
        .save("pipelines.json", &data)
        .map_err(|e| format!("Failed to save pipelines config: {}", e))
}

/// Delete a pipeline by ID and persist to disk. Returns `true` if the entry existed.
#[tauri::command]
pub async fn delete_pipeline(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let (removed, data) = {
        let mut config = state.pipelines_config.lock().await;
        let removed = config.remove(&id);
        (removed, config.clone())
    };

    if removed {
        let store = state.config.lock().await;
        store
            .save("pipelines.json", &data)
            .map_err(|e| format!("Failed to save pipelines config: {}", e))?;
    }

    Ok(removed)
}

// ─── Execution commands ──────────────────────────────────────────────────────

/// Return the current pipeline including step statuses.
#[tauri::command]
pub async fn get_pipeline_status(
    state: State<'_, AppState>,
    pipeline_id: String,
) -> Result<Pipeline, String> {
    let config = state.pipelines_config.lock().await;
    config
        .get(&pipeline_id)
        .cloned()
        .ok_or_else(|| format!("Pipeline '{}' not found", pipeline_id))
}

/// Cancel a running pipeline. Sets its status to `failed` and signals the
/// background execution task to stop.
#[tauri::command]
pub async fn cancel_pipeline(
    state: State<'_, AppState>,
    pipeline_id: String,
) -> Result<(), String> {
    // Signal cancellation to the background task
    {
        let mut flags = CANCEL_FLAGS.lock().await;
        flags.insert(pipeline_id.clone(), true);
    }

    // Mark the pipeline as failed
    {
        let mut config = state.pipelines_config.lock().await;
        let pipeline = config
            .get_mut(&pipeline_id)
            .ok_or_else(|| format!("Pipeline '{}' not found", pipeline_id))?;

        if pipeline.status != PipelineStatus::Running {
            return Err("Pipeline is not currently running".to_string());
        }

        pipeline.status = PipelineStatus::Failed;

        // Mark any running or pending steps as failed
        for step in &mut pipeline.steps {
            if step.status == StepStatus::Running || step.status == StepStatus::Pending {
                step.status = StepStatus::Failed;
            }
        }
    }

    persist_pipelines(&state).await
}

/// Start executing a pipeline in the background.
///
/// Validates agents and remote assignments, performs a topological sort of steps,
/// then spawns a tokio task that executes each step sequentially.
#[tauri::command]
pub async fn execute_pipeline(
    state: State<'_, AppState>,
    pipeline_id: String,
) -> Result<(), String> {
    // ── 1. Load and validate ─────────────────────────────────────────────

    let (execution_order, step_map) = {
        let config = state.pipelines_config.lock().await;
        let pipeline = config
            .get(&pipeline_id)
            .ok_or_else(|| format!("Pipeline '{}' not found", pipeline_id))?;

        if pipeline.status == PipelineStatus::Running {
            return Err("Pipeline is already running".to_string());
        }

        if pipeline.steps.is_empty() {
            return Err("Pipeline has no steps".to_string());
        }

        let order = topological_sort(&pipeline.steps)?;
        let map: HashMap<String, PipelineStep> = pipeline
            .steps
            .iter()
            .map(|s| (s.id.clone(), s.clone()))
            .collect();

        (order, map)
    };

    // Validate all agents exist and have assigned remote
    let agent_remote_map: HashMap<String, (String, String)> = {
        let agents_config = state.agents_config.lock().await;

        let mut avmap = HashMap::new();
        for step in step_map.values() {
            if avmap.contains_key(&step.agent_id) {
                continue;
            }
            let agent = agents_config
                .get(&step.agent_id)
                .ok_or_else(|| format!("Agent '{}' not found", step.agent_id))?;
            let remote_id = agent
                .assigned_remote_id
                .as_ref()
                .ok_or_else(|| format!("Agent '{}' has no assigned remote", agent.name))?;
            // Store (remote_id, session_name_or_prefix)
            let session_name = agent
                .current_session_id
                .clone()
                .unwrap_or_else(|| format!("cm-{}", step.agent_id.chars().take(8).collect::<String>()));
            avmap.insert(step.agent_id.clone(), (remote_id.clone(), session_name));
        }
        avmap
    };

    // ── 2. Mark pipeline as running, reset steps ─────────────────────────
    {
        let mut config = state.pipelines_config.lock().await;
        let pipeline = config.get_mut(&pipeline_id).unwrap();
        pipeline.status = PipelineStatus::Running;
        pipeline.last_run_at = Some(Utc::now().to_rfc3339());
        for step in &mut pipeline.steps {
            step.status = StepStatus::Pending;
            step.output = None;
        }
    }
    persist_pipelines(&state).await?;

    // Clear any stale cancel flag
    {
        let mut flags = CANCEL_FLAGS.lock().await;
        flags.remove(&pipeline_id);
    }

    // ── 3. Clone state arcs for the background task ──────────────────────
    let pipelines_config = Arc::clone(&state.pipelines_config);
    let config_store = Arc::clone(&state.config);
    let remote_config = Arc::clone(&state.remote_config);
    let ssh_pool = Arc::clone(&state.ssh_pool);
    let cancel_flags = Arc::clone(&CANCEL_FLAGS);
    let pid = pipeline_id.clone();

    // ── 4. Spawn background execution task ───────────────────────────────
    tauri::async_runtime::spawn(async move {
        let mut step_outputs: HashMap<String, String> = HashMap::new();
        let mut all_ok = true;

        for step_id in &execution_order {
            // Check cancellation
            {
                let flags = cancel_flags.lock().await;
                if flags.get(&pid).copied().unwrap_or(false) {
                    all_ok = false;
                    break;
                }
            }

            let step = match step_map.get(step_id) {
                Some(s) => s.clone(),
                None => {
                    all_ok = false;
                    break;
                }
            };

            // Mark step as running
            {
                let mut config = pipelines_config.lock().await;
                if let Some(pipeline) = config.get_mut(&pid) {
                    if let Some(s) = pipeline.steps.iter_mut().find(|s| s.id == *step_id) {
                        s.status = StepStatus::Running;
                    }
                }
            }
            // Persist step status
            {
                let data = pipelines_config.lock().await.clone();
                let store = config_store.lock().await;
                let _ = store.save("pipelines.json", &data);
            }

            // Resolve prompt — replace step-specific and prev output variables
            let mut prompt = step.prompt.clone();

            // Replace step-specific references: {{step.<step_id>.output}}
            for (id, output) in &step_outputs {
                let placeholder = format!("{{{{step.{}.output}}}}", id);
                prompt = prompt.replace(&placeholder, output);
            }

            // Support {{prev.output}} as the output of the last dependency
            if let Some(last_dep) = step.depends_on.last() {
                if let Some(output) = step_outputs.get(last_dep) {
                    prompt = prompt.replace("{{prev.output}}", output);
                }
            }

            // Get SSH handle for the agent's remote
            let (remote_id, session_name) = match agent_remote_map.get(&step.agent_id) {
                Some(pair) => pair.clone(),
                None => {
                    mark_step_failed(&pipelines_config, &config_store, &pid, step_id).await;
                    all_ok = false;
                    break;
                }
            };

            let handle = {
                let (host, port, user, key_path) = {
                    let vc = remote_config.lock().await;
                    match vc.get(&remote_id) {
                        Some(srv) => (
                            srv.host.clone(),
                            srv.port,
                            srv.user.clone(),
                            srv.ssh_key_path.clone(),
                        ),
                        None => {
                            mark_step_failed(&pipelines_config, &config_store, &pid, step_id)
                                .await;
                            all_ok = false;
                            break;
                        }
                    }
                };

                match ssh_pool
                    .get_or_connect(&remote_id, &host, port, &user, &key_path)
                    .await
                {
                    Ok(h) => h,
                    Err(_) => {
                        mark_step_failed(&pipelines_config, &config_store, &pid, step_id).await;
                        all_ok = false;
                        break;
                    }
                }
            };

            // Ensure the tmux session exists — check via list, create if needed
            let session_exists = {
                let check_cmd = format!(
                    "tmux has-session -t '{}' 2>/dev/null && echo yes || echo no",
                    session_name
                );
                match exec_command(&handle, &check_cmd).await {
                    Ok(r) => r.stdout.trim() == "yes",
                    Err(_) => false,
                }
            };

            if !session_exists {
                // We cannot easily create a session without knowing the claude
                // path. Mark step as failed.
                mark_step_failed(&pipelines_config, &config_store, &pid, step_id).await;
                all_ok = false;
                break;
            }

            // Write prompt to temp file on remote then send to Claude via tmux
            let escaped_prompt = prompt.replace('\'', "'\\''");
            let write_cmd = format!(
                "printf '%s' '{}' > /tmp/cm-step-{}.txt",
                escaped_prompt, step_id
            );
            if exec_command(&handle, &write_cmd).await.is_err() {
                mark_step_failed(&pipelines_config, &config_store, &pid, step_id).await;
                all_ok = false;
                break;
            }

            // Send the prompt content to the tmux session
            let send_cmd = format!(
                "tmux send-keys -t '{}' \"$(cat /tmp/cm-step-{}.txt)\" Enter",
                session_name, step_id
            );
            if exec_command(&handle, &send_cmd).await.is_err() {
                mark_step_failed(&pipelines_config, &config_store, &pid, step_id).await;
                all_ok = false;
                break;
            }

            // Poll for completion
            let timeout_secs = if step.timeout == 0 { 300 } else { step.timeout };
            let poll_interval = std::time::Duration::from_secs(3);
            let start = std::time::Instant::now();
            let mut completed = false;
            let mut captured_output = String::new();

            // Wait a brief moment before first poll so Claude has time to start
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;

            while start.elapsed().as_secs() < timeout_secs {
                // Check cancellation
                {
                    let flags = cancel_flags.lock().await;
                    if flags.get(&pid).copied().unwrap_or(false) {
                        break;
                    }
                }

                match sessions::capture_pane(&handle, &session_name, 200).await {
                    Ok(raw_output) => {
                        let clean = strip_ansi(&raw_output);
                        if is_claude_idle(&clean) {
                            captured_output = clean;
                            completed = true;
                            break;
                        }
                    }
                    Err(_) => {
                        // Transient error; keep polling
                    }
                }

                tokio::time::sleep(poll_interval).await;
            }

            // Check if we were cancelled during polling
            {
                let flags = cancel_flags.lock().await;
                if flags.get(&pid).copied().unwrap_or(false) {
                    all_ok = false;
                    break;
                }
            }

            if completed {
                // Truncate output to 4000 chars
                let truncated = if captured_output.len() > 4000 {
                    captured_output[..4000].to_string()
                } else {
                    captured_output.clone()
                };

                step_outputs.insert(step_id.clone(), truncated.clone());

                // Mark step completed
                {
                    let mut config = pipelines_config.lock().await;
                    if let Some(pipeline) = config.get_mut(&pid) {
                        if let Some(s) = pipeline.steps.iter_mut().find(|s| s.id == *step_id) {
                            s.status = StepStatus::Completed;
                            s.output = Some(truncated);
                        }
                    }
                }
            } else {
                mark_step_failed(&pipelines_config, &config_store, &pid, step_id).await;
                all_ok = false;
                break;
            }

            // Persist after each step
            {
                let data = pipelines_config.lock().await.clone();
                let store = config_store.lock().await;
                let _ = store.save("pipelines.json", &data);
            }

            // Cleanup temp file (best-effort)
            let cleanup_cmd = format!("rm -f /tmp/cm-step-{}.txt", step_id);
            let _ = exec_command(&handle, &cleanup_cmd).await;
        }

        // ── Final pipeline status ────────────────────────────────────────
        {
            let mut config = pipelines_config.lock().await;
            if let Some(pipeline) = config.get_mut(&pid) {
                pipeline.status = if all_ok {
                    PipelineStatus::Completed
                } else {
                    PipelineStatus::Failed
                };
            }
        }
        {
            let data = pipelines_config.lock().await.clone();
            let store = config_store.lock().await;
            let _ = store.save("pipelines.json", &data);
        }

        // Cleanup cancel flag
        {
            let mut flags = cancel_flags.lock().await;
            flags.remove(&pid);
        }
    });

    Ok(())
}

/// Helper: mark a single step as failed and persist.
async fn mark_step_failed(
    pipelines_config: &Arc<Mutex<crate::config::pipelines::PipelinesConfig>>,
    config_store: &Arc<Mutex<crate::config::ConfigStore>>,
    pipeline_id: &str,
    step_id: &str,
) {
    {
        let mut config = pipelines_config.lock().await;
        if let Some(pipeline) = config.get_mut(pipeline_id) {
            if let Some(s) = pipeline.steps.iter_mut().find(|s| s.id == step_id) {
                s.status = StepStatus::Failed;
            }
        }
    }
    let data = pipelines_config.lock().await.clone();
    let store = config_store.lock().await;
    let _ = store.save("pipelines.json", &data);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_ansi() {
        let input = "\x1b[32mHello\x1b[0m \x1b[1;31mWorld\x1b[0m";
        assert_eq!(strip_ansi(input), "Hello World");
    }

    #[test]
    fn test_strip_ansi_no_codes() {
        assert_eq!(strip_ansi("plain text"), "plain text");
    }

    #[test]
    fn test_is_claude_idle_chevron() {
        assert!(is_claude_idle("some output\n\u{276F}"));
        assert!(is_claude_idle("some output\n  \u{276F}"));
    }

    #[test]
    fn test_is_claude_idle_greater_than() {
        assert!(is_claude_idle("some output\n>"));
        assert!(is_claude_idle("some output\n  >"));
    }

    #[test]
    fn test_is_claude_idle_dollar() {
        assert!(is_claude_idle("some output\nuser@host:~$ "));
    }

    #[test]
    fn test_is_claude_idle_not_idle() {
        assert!(!is_claude_idle("Processing..."));
        assert!(!is_claude_idle("Running command"));
    }

    #[test]
    fn test_is_claude_idle_empty() {
        assert!(!is_claude_idle(""));
        assert!(!is_claude_idle("   \n   \n   "));
    }

    #[test]
    fn test_topological_sort_linear() {
        let steps = vec![
            PipelineStep {
                id: "a".to_string(),
                label: "Step A".to_string(),
                agent_id: "agent-1".to_string(),
                prompt: "step a".to_string(),
                depends_on: vec![],
                status: StepStatus::Pending,
                output: None,
                timeout: 300,
            },
            PipelineStep {
                id: "b".to_string(),
                label: "Step B".to_string(),
                agent_id: "agent-1".to_string(),
                prompt: "step b".to_string(),
                depends_on: vec!["a".to_string()],
                status: StepStatus::Pending,
                output: None,
                timeout: 300,
            },
            PipelineStep {
                id: "c".to_string(),
                label: "Step C".to_string(),
                agent_id: "agent-1".to_string(),
                prompt: "step c".to_string(),
                depends_on: vec!["b".to_string()],
                status: StepStatus::Pending,
                output: None,
                timeout: 300,
            },
        ];

        let order = topological_sort(&steps).unwrap();
        let a_pos = order.iter().position(|x| x == "a").unwrap();
        let b_pos = order.iter().position(|x| x == "b").unwrap();
        let c_pos = order.iter().position(|x| x == "c").unwrap();
        assert!(a_pos < b_pos);
        assert!(b_pos < c_pos);
    }

    #[test]
    fn test_topological_sort_cycle() {
        let steps = vec![
            PipelineStep {
                id: "a".to_string(),
                label: "Step A".to_string(),
                agent_id: "agent-1".to_string(),
                prompt: "step a".to_string(),
                depends_on: vec!["b".to_string()],
                status: StepStatus::Pending,
                output: None,
                timeout: 300,
            },
            PipelineStep {
                id: "b".to_string(),
                label: "Step B".to_string(),
                agent_id: "agent-1".to_string(),
                prompt: "step b".to_string(),
                depends_on: vec!["a".to_string()],
                status: StepStatus::Pending,
                output: None,
                timeout: 300,
            },
        ];

        assert!(topological_sort(&steps).is_err());
    }

    #[test]
    fn test_topological_sort_no_deps() {
        let steps = vec![
            PipelineStep {
                id: "x".to_string(),
                label: "Step X".to_string(),
                agent_id: "agent-1".to_string(),
                prompt: "step x".to_string(),
                depends_on: vec![],
                status: StepStatus::Pending,
                output: None,
                timeout: 300,
            },
            PipelineStep {
                id: "y".to_string(),
                label: "Step Y".to_string(),
                agent_id: "agent-1".to_string(),
                prompt: "step y".to_string(),
                depends_on: vec![],
                status: StepStatus::Pending,
                output: None,
                timeout: 300,
            },
        ];

        let order = topological_sort(&steps).unwrap();
        assert_eq!(order.len(), 2);
    }
}
