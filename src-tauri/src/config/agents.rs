use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentsConfig {
    pub schema_version: u32,
    pub agents: Vec<Agent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub role: String,
    pub icon: String,
    pub color: String,
    pub default_model: String,
    pub default_dir: String,
    pub claude_md: String,
    pub assigned_vps_id: Option<String>,
    pub tags: Vec<String>,
    pub current_session_id: Option<String>,
    pub current_vps_id: Option<String>,
    pub created_at: String,
}

impl AgentsConfig {
    pub fn new() -> Self {
        Self {
            schema_version: 1,
            agents: vec![],
        }
    }

    pub fn add(&mut self, agent: Agent) {
        self.agents.push(agent);
    }

    pub fn remove(&mut self, id: &str) -> bool {
        let len = self.agents.len();
        self.agents.retain(|a| a.id != id);
        self.agents.len() < len
    }

    pub fn get(&self, id: &str) -> Option<&Agent> {
        self.agents.iter().find(|a| a.id == id)
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut Agent> {
        self.agents.iter_mut().find(|a| a.id == id)
    }
}

impl Default for AgentsConfig {
    fn default() -> Self {
        Self::new()
    }
}

impl Agent {
    pub fn new(name: String, role: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            role,
            icon: String::new(),
            color: String::new(),
            default_model: "claude-sonnet-4-20250514".to_string(),
            default_dir: String::new(),
            claude_md: String::new(),
            assigned_vps_id: None,
            tags: vec![],
            current_session_id: None,
            current_vps_id: None,
            created_at: Utc::now().to_rfc3339(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_and_get_agent() {
        let mut config = AgentsConfig::new();
        assert_eq!(config.schema_version, 1);
        assert!(config.agents.is_empty());

        let agent = Agent::new("coder-1".to_string(), "backend-dev".to_string());
        let id = agent.id.clone();
        config.add(agent);

        assert_eq!(config.agents.len(), 1);

        let found = config.get(&id).unwrap();
        assert_eq!(found.name, "coder-1");
        assert_eq!(found.role, "backend-dev");
        assert!(found.assigned_vps_id.is_none());
        assert!(found.current_session_id.is_none());
    }

    #[test]
    fn test_remove_agent() {
        let mut config = AgentsConfig::new();
        let agent = Agent::new("temp-agent".to_string(), "tester".to_string());
        let id = agent.id.clone();
        config.add(agent);

        assert!(config.remove(&id));
        assert!(config.agents.is_empty());
        assert!(!config.remove(&id));
    }

    #[test]
    fn test_agent_mutation() {
        let mut config = AgentsConfig::new();
        let agent = Agent::new("mutable".to_string(), "dev".to_string());
        let id = agent.id.clone();
        config.add(agent);

        let agent_mut = config.get_mut(&id).unwrap();
        agent_mut.assigned_vps_id = Some("vps-123".to_string());
        agent_mut.current_session_id = Some("session-456".to_string());

        let found = config.get(&id).unwrap();
        assert_eq!(found.assigned_vps_id.as_deref(), Some("vps-123"));
        assert_eq!(found.current_session_id.as_deref(), Some("session-456"));
    }

    #[test]
    fn test_serialization() {
        let mut config = AgentsConfig::new();
        let mut agent = Agent::new("serial-agent".to_string(), "ops".to_string());
        agent.color = "#ff0000".to_string();
        agent.tags = vec!["prod".to_string(), "critical".to_string()];
        config.add(agent);

        let json = serde_json::to_string_pretty(&config).unwrap();
        let deserialized: AgentsConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.schema_version, 1);
        assert_eq!(deserialized.agents.len(), 1);
        assert_eq!(deserialized.agents[0].name, "serial-agent");
        assert_eq!(deserialized.agents[0].color, "#ff0000");
        assert_eq!(deserialized.agents[0].tags.len(), 2);

        // Verify camelCase serialization
        assert!(json.contains("schemaVersion"));
        assert!(json.contains("defaultModel"));
        assert!(json.contains("claudeMd"));
        assert!(json.contains("assignedVpsId"));
        assert!(json.contains("currentSessionId"));
        assert!(json.contains("createdAt"));
    }
}
