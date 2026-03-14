use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VpsConfig {
    pub schema_version: u32,
    pub servers: Vec<Vps>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vps {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub ssh_key_path: String,
    pub tags: Vec<String>,
    pub group: String,
    pub status: VpsStatus,
    pub last_seen: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VpsStatus {
    Online,
    Offline,
    Unknown,
}

impl VpsConfig {
    pub fn new() -> Self {
        Self {
            schema_version: 1,
            servers: vec![],
        }
    }

    pub fn add(&mut self, vps: Vps) {
        self.servers.push(vps);
    }

    pub fn remove(&mut self, id: &str) -> bool {
        let len = self.servers.len();
        self.servers.retain(|v| v.id != id);
        self.servers.len() < len
    }

    pub fn get(&self, id: &str) -> Option<&Vps> {
        self.servers.iter().find(|v| v.id == id)
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut Vps> {
        self.servers.iter_mut().find(|v| v.id == id)
    }
}

impl Default for VpsConfig {
    fn default() -> Self {
        Self::new()
    }
}

impl Vps {
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
            status: VpsStatus::Unknown,
            last_seen: Utc::now().to_rfc3339(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_and_get_vps() {
        let mut config = VpsConfig::new();
        assert_eq!(config.schema_version, 1);
        assert!(config.servers.is_empty());

        let vps = Vps::new(
            "test-server".to_string(),
            "192.168.1.1".to_string(),
            "root".to_string(),
            "/home/user/.ssh/id_rsa".to_string(),
        );
        let id = vps.id.clone();
        config.add(vps);

        assert_eq!(config.servers.len(), 1);

        let found = config.get(&id).unwrap();
        assert_eq!(found.name, "test-server");
        assert_eq!(found.host, "192.168.1.1");
        assert_eq!(found.port, 22);
        assert_eq!(found.user, "root");
        assert_eq!(found.status, VpsStatus::Unknown);
    }

    #[test]
    fn test_remove_vps() {
        let mut config = VpsConfig::new();
        let vps = Vps::new(
            "to-remove".to_string(),
            "10.0.0.1".to_string(),
            "admin".to_string(),
            "/home/admin/.ssh/id_rsa".to_string(),
        );
        let id = vps.id.clone();
        config.add(vps);

        assert!(config.remove(&id));
        assert!(config.servers.is_empty());
        assert!(!config.remove(&id)); // already removed
    }

    #[test]
    fn test_serialization() {
        let mut config = VpsConfig::new();
        let vps = Vps::new(
            "serial-test".to_string(),
            "example.com".to_string(),
            "deploy".to_string(),
            "/keys/deploy".to_string(),
        );
        config.add(vps);

        let json = serde_json::to_string_pretty(&config).unwrap();
        let deserialized: VpsConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.schema_version, 1);
        assert_eq!(deserialized.servers.len(), 1);
        assert_eq!(deserialized.servers[0].name, "serial-test");
        assert_eq!(deserialized.servers[0].status, VpsStatus::Unknown);

        // Verify camelCase serialization
        assert!(json.contains("schemaVersion"));
        assert!(json.contains("sshKeyPath"));
        assert!(json.contains("lastSeen"));
    }
}
