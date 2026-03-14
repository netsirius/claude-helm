pub mod vps;
pub mod agents;
pub mod pipelines;

use serde::de::DeserializeOwned;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

pub struct ConfigStore {
    base_dir: PathBuf,
}

impl ConfigStore {
    pub fn new() -> std::io::Result<Self> {
        let base_dir = dirs::home_dir()
            .expect("Could not determine home directory")
            .join(".claude-manager");
        fs::create_dir_all(&base_dir)?;
        Ok(Self { base_dir })
    }

    pub fn base_dir(&self) -> &PathBuf {
        &self.base_dir
    }

    pub fn load<T: DeserializeOwned + Default>(&self, filename: &str) -> T {
        let path = self.base_dir.join(filename);
        match fs::read_to_string(&path) {
            Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
            Err(_) => T::default(),
        }
    }

    pub fn save<T: Serialize>(&self, filename: &str, data: &T) -> std::io::Result<()> {
        let path = self.base_dir.join(filename);
        let json = serde_json::to_string_pretty(data)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        fs::write(&path, &json)?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = fs::Permissions::from_mode(0o600);
            fs::set_permissions(&path, perms)?;
        }

        Ok(())
    }
}

impl Default for ConfigStore {
    fn default() -> Self {
        Self::new().expect("Failed to initialize config store")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::vps::{Vps, VpsConfig};

    #[test]
    fn test_config_store_init() {
        let store = ConfigStore::new().unwrap();
        assert!(store.base_dir().exists());
    }

    #[test]
    fn test_load_missing_file_returns_default() {
        let store = ConfigStore::new().unwrap();
        let config: VpsConfig = store.load("nonexistent_test_file.json");
        assert_eq!(config.schema_version, 1);
        assert!(config.servers.is_empty());
    }

    #[test]
    fn test_save_and_load_roundtrip() {
        let store = ConfigStore::new().unwrap();
        let test_file = "test_roundtrip_vps.json";

        let mut config = VpsConfig::new();
        config.add(Vps::new(
            "roundtrip-server".to_string(),
            "10.0.0.1".to_string(),
            "admin".to_string(),
            "/keys/admin".to_string(),
        ));

        store.save(test_file, &config).unwrap();

        let loaded: VpsConfig = store.load(test_file);
        assert_eq!(loaded.servers.len(), 1);
        assert_eq!(loaded.servers[0].name, "roundtrip-server");

        // Cleanup
        let _ = fs::remove_file(store.base_dir().join(test_file));
    }

    #[cfg(unix)]
    #[test]
    fn test_file_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let store = ConfigStore::new().unwrap();
        let test_file = "test_permissions.json";

        let config = VpsConfig::new();
        store.save(test_file, &config).unwrap();

        let path = store.base_dir().join(test_file);
        let metadata = fs::metadata(&path).unwrap();
        let mode = metadata.permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);

        // Cleanup
        let _ = fs::remove_file(path);
    }
}
