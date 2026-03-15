use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteConfig {
    pub schema_version: u32,
    pub remotes: Vec<Remote>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Remote {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub ssh_key_path: String,
    pub tags: Vec<String>,
    pub group: String,
    pub status: RemoteStatus,
    pub last_seen: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RemoteStatus {
    Online,
    Offline,
    Unknown,
}

impl RemoteConfig {
    pub fn new() -> Self {
        Self {
            schema_version: 1,
            remotes: vec![],
        }
    }

    pub fn add(&mut self, remote: Remote) {
        self.remotes.push(remote);
    }

    pub fn remove(&mut self, id: &str) -> bool {
        let len = self.remotes.len();
        self.remotes.retain(|v| v.id != id);
        self.remotes.len() < len
    }

    pub fn get(&self, id: &str) -> Option<&Remote> {
        self.remotes.iter().find(|v| v.id == id)
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut Remote> {
        self.remotes.iter_mut().find(|v| v.id == id)
    }
}

impl Default for RemoteConfig {
    fn default() -> Self {
        Self::new()
    }
}

impl Remote {
    pub fn new(name: String, host: String, user: String, ssh_key_path: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            host,
            port: 22,
            user,
            ssh_key_path,
            tags: vec![],
            group: String::new(),
            status: RemoteStatus::Unknown,
            last_seen: Utc::now().to_rfc3339(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_and_get_remote() {
        let mut config = RemoteConfig::new();
        assert_eq!(config.schema_version, 1);
        assert!(config.remotes.is_empty());

        let remote = Remote::new(
            "test-remote".to_string(),
            "192.168.1.1".to_string(),
            "root".to_string(),
            "/home/user/.ssh/id_rsa".to_string(),
        );
        let id = remote.id.clone();
        config.add(remote);

        assert_eq!(config.remotes.len(), 1);

        let found = config.get(&id).unwrap();
        assert_eq!(found.name, "test-remote");
        assert_eq!(found.host, "192.168.1.1");
        assert_eq!(found.port, 22);
        assert_eq!(found.user, "root");
        assert_eq!(found.status, RemoteStatus::Unknown);
    }

    #[test]
    fn test_remove_remote() {
        let mut config = RemoteConfig::new();
        let remote = Remote::new(
            "to-remove".to_string(),
            "10.0.0.1".to_string(),
            "admin".to_string(),
            "/home/admin/.ssh/id_rsa".to_string(),
        );
        let id = remote.id.clone();
        config.add(remote);

        assert!(config.remove(&id));
        assert!(config.remotes.is_empty());
        assert!(!config.remove(&id)); // already removed
    }

    #[test]
    fn test_serialization() {
        let mut config = RemoteConfig::new();
        let remote = Remote::new(
            "serial-test".to_string(),
            "example.com".to_string(),
            "deploy".to_string(),
            "/keys/deploy".to_string(),
        );
        config.add(remote);

        let json = serde_json::to_string_pretty(&config).unwrap();
        let deserialized: RemoteConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.schema_version, 1);
        assert_eq!(deserialized.remotes.len(), 1);
        assert_eq!(deserialized.remotes[0].name, "serial-test");
        assert_eq!(deserialized.remotes[0].status, RemoteStatus::Unknown);

        // Verify camelCase serialization
        assert!(json.contains("schemaVersion"));
        assert!(json.contains("sshKeyPath"));
        assert!(json.contains("lastSeen"));
    }
}
