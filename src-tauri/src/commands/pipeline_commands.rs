use tauri::State;

use crate::config::pipelines::{Pipeline, PipelineStep};
use crate::state::AppState;

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

    let mut config = state.pipelines_config.lock().await;
    config.add(pipeline);

    let store = state.config.lock().await;
    store
        .save("pipelines.json", &*config)
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
) -> Result<PipelineStep, String> {
    let mut step = PipelineStep::new(agent_id, prompt);
    step.depends_on = depends_on;
    let result = step.clone();

    let mut config = state.pipelines_config.lock().await;
    let pipeline = config
        .get_mut(&pipeline_id)
        .ok_or_else(|| format!("Pipeline '{}' not found", pipeline_id))?;
    pipeline.steps.push(step);

    let store = state.config.lock().await;
    store
        .save("pipelines.json", &*config)
        .map_err(|e| format!("Failed to save pipelines config: {}", e))?;

    Ok(result)
}

/// Delete a pipeline by ID and persist to disk. Returns `true` if the entry existed.
#[tauri::command]
pub async fn delete_pipeline(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let mut config = state.pipelines_config.lock().await;
    let removed = config.remove(&id);

    if removed {
        let store = state.config.lock().await;
        store
            .save("pipelines.json", &*config)
            .map_err(|e| format!("Failed to save pipelines config: {}", e))?;
    }

    Ok(removed)
}
