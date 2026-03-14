use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelinesConfig {
    pub schema_version: u32,
    pub pipelines: Vec<Pipeline>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pipeline {
    pub id: String,
    pub name: String,
    pub description: String,
    pub steps: Vec<PipelineStep>,
    pub status: PipelineStatus,
    pub created_at: String,
    pub last_run_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PipelineStatus {
    Idle,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStep {
    pub id: String,
    pub agent_id: String,
    pub prompt: String,
    pub depends_on: Vec<String>,
    pub status: StepStatus,
    pub output: Option<String>,
    pub timeout: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum StepStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

impl PipelinesConfig {
    pub fn new() -> Self {
        Self {
            schema_version: 1,
            pipelines: vec![],
        }
    }

    pub fn add(&mut self, pipeline: Pipeline) {
        self.pipelines.push(pipeline);
    }

    pub fn remove(&mut self, id: &str) -> bool {
        let len = self.pipelines.len();
        self.pipelines.retain(|p| p.id != id);
        self.pipelines.len() < len
    }

    pub fn get(&self, id: &str) -> Option<&Pipeline> {
        self.pipelines.iter().find(|p| p.id == id)
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut Pipeline> {
        self.pipelines.iter_mut().find(|p| p.id == id)
    }
}

impl Default for PipelinesConfig {
    fn default() -> Self {
        Self::new()
    }
}

impl Pipeline {
    pub fn new(name: String, description: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            description,
            steps: vec![],
            status: PipelineStatus::Idle,
            created_at: Utc::now().to_rfc3339(),
            last_run_at: None,
        }
    }
}

impl PipelineStep {
    pub fn new(agent_id: String, prompt: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            agent_id,
            prompt,
            depends_on: vec![],
            status: StepStatus::Pending,
            output: None,
            timeout: 300,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_and_get_pipeline() {
        let mut config = PipelinesConfig::new();
        assert_eq!(config.schema_version, 1);
        assert!(config.pipelines.is_empty());

        let pipeline = Pipeline::new(
            "deploy-pipeline".to_string(),
            "Full deployment flow".to_string(),
        );
        let id = pipeline.id.clone();
        config.add(pipeline);

        assert_eq!(config.pipelines.len(), 1);

        let found = config.get(&id).unwrap();
        assert_eq!(found.name, "deploy-pipeline");
        assert_eq!(found.description, "Full deployment flow");
        assert_eq!(found.status, PipelineStatus::Idle);
        assert!(found.last_run_at.is_none());
    }

    #[test]
    fn test_remove_pipeline() {
        let mut config = PipelinesConfig::new();
        let pipeline = Pipeline::new("temp".to_string(), "temporary".to_string());
        let id = pipeline.id.clone();
        config.add(pipeline);

        assert!(config.remove(&id));
        assert!(config.pipelines.is_empty());
        assert!(!config.remove(&id));
    }

    #[test]
    fn test_pipeline_with_steps() {
        let mut pipeline = Pipeline::new(
            "multi-step".to_string(),
            "A pipeline with steps".to_string(),
        );

        let step1 = PipelineStep::new("agent-1".to_string(), "Build the project".to_string());
        let step1_id = step1.id.clone();
        let mut step2 = PipelineStep::new("agent-2".to_string(), "Run tests".to_string());
        step2.depends_on = vec![step1_id];

        pipeline.steps.push(step1);
        pipeline.steps.push(step2);

        assert_eq!(pipeline.steps.len(), 2);
        assert_eq!(pipeline.steps[0].timeout, 300);
        assert_eq!(pipeline.steps[1].status, StepStatus::Pending);
        assert_eq!(pipeline.steps[1].depends_on.len(), 1);
    }

    #[test]
    fn test_serialization() {
        let mut config = PipelinesConfig::new();
        let mut pipeline = Pipeline::new("serial-pipe".to_string(), "test".to_string());
        let step = PipelineStep::new("agent-x".to_string(), "do something".to_string());
        pipeline.steps.push(step);
        config.add(pipeline);

        let json = serde_json::to_string_pretty(&config).unwrap();
        let deserialized: PipelinesConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.schema_version, 1);
        assert_eq!(deserialized.pipelines.len(), 1);
        assert_eq!(deserialized.pipelines[0].name, "serial-pipe");
        assert_eq!(deserialized.pipelines[0].steps.len(), 1);

        // Verify camelCase serialization
        assert!(json.contains("schemaVersion"));
        assert!(json.contains("createdAt"));
        assert!(json.contains("lastRunAt"));
        assert!(json.contains("agentId"));
        assert!(json.contains("dependsOn"));
    }
}
