use tauri::State;

use crate::config::agents::Agent;
use crate::state::AppState;

/// Return the full list of configured agents.
#[tauri::command]
pub async fn list_agents(state: State<'_, AppState>) -> Result<Vec<Agent>, String> {
    let config = state.agents_config.lock().await;
    Ok(config.agents.clone())
}

/// Add a new agent and persist to disk.
#[tauri::command]
pub async fn add_agent(
    state: State<'_, AppState>,
    name: String,
    role: String,
    icon: Option<String>,
    color: Option<String>,
    default_model: Option<String>,
    assigned_remote_id: Option<String>,
    claude_md: Option<String>,
) -> Result<Agent, String> {
    let mut agent = Agent::new(name, role);

    if let Some(i) = icon {
        agent.icon = i;
    }
    if let Some(c) = color {
        agent.color = c;
    }
    if let Some(m) = default_model {
        agent.default_model = m;
    }
    if let Some(v) = assigned_remote_id {
        agent.assigned_remote_id = Some(v);
    }
    if let Some(p) = claude_md {
        agent.claude_md = p;
    }

    let result = agent.clone();

    let data = {
        let mut config = state.agents_config.lock().await;
        config.add(agent);
        config.clone()
    };

    // Persist (config lock is dropped before acquiring store lock)
    let store = state.config.lock().await;
    store
        .save("agents.json", &data)
        .map_err(|e| format!("Failed to save agents config: {}", e))?;

    Ok(result)
}

/// Remove an agent by ID and persist to disk.  Returns `true` if the entry existed.
#[tauri::command]
pub async fn remove_agent(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let (removed, data) = {
        let mut config = state.agents_config.lock().await;
        let removed = config.remove(&id);
        (removed, config.clone())
    };

    if removed {
        let store = state.config.lock().await;
        store
            .save("agents.json", &data)
            .map_err(|e| format!("Failed to save agents config: {}", e))?;
    }

    Ok(removed)
}
