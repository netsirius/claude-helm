pub mod remote;
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
            Ok(contents) => match serde_json::from_str(&contents) {
                Ok(parsed) => parsed,
                Err(e) => {
                    eprintln!(
                        "[config] WARNING: failed to parse '{}': {} — using defaults",
                        path.display(),
                        e
                    );
                    T::default()
                }
            },
            Err(_) => T::default(),
        }
    }

    /// Load a config file with backward-compatible fallback paths.
    ///
    /// If `filename` does not exist, tries each fallback in order.
    /// This supports renaming config files (e.g. vps.json -> servers.json -> remotes.json)
    /// without losing existing data.
    pub fn load_with_fallbacks<T: DeserializeOwned + Default>(
        &self,
        filename: &str,
        fallbacks: &[&str],
    ) -> T {
        let path = self.base_dir.join(filename);
        if path.exists() {
            return self.load(filename);
        }

        for fallback in fallbacks {
            let fallback_path = self.base_dir.join(fallback);
            if fallback_path.exists() {
                return self.load(fallback);
            }
        }

        T::default()
    }

    pub fn save<T: Serialize>(&self, filename: &str, data: &T) -> std::io::Result<()> {
        let path = self.base_dir.join(filename);
        let tmp_path = self.base_dir.join(format!("{}.tmp", filename));
        let json = serde_json::to_string_pretty(data)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

        // Write to a temporary file first, then atomically rename
        fs::write(&tmp_path, &json)?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = fs::Permissions::from_mode(0o600);
            fs::set_permissions(&tmp_path, perms)?;
        }

        fs::rename(&tmp_path, &path)?;
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
    use super::remote::{Remote, RemoteConfig};

    #[test]
    fn test_config_store_init() {
        let store = ConfigStore::new().unwrap();
        assert!(store.base_dir().exists());
    }

    #[test]
    fn test_load_missing_file_returns_default() {
        let store = ConfigStore::new().unwrap();
        let config: RemoteConfig = store.load("nonexistent_test_file.json");
        assert_eq!(config.schema_version, 1);
        assert!(config.remotes.is_empty());
    }

    #[test]
    fn test_save_and_load_roundtrip() {
        let store = ConfigStore::new().unwrap();
        let test_file = "test_roundtrip_remotes.json";

        let mut config = RemoteConfig::new();
        config.add(Remote::new(
            "roundtrip-remote".to_string(),
            "10.0.0.1".to_string(),
            "admin".to_string(),
            "/keys/admin".to_string(),
        ));

        store.save(test_file, &config).unwrap();

        let loaded: RemoteConfig = store.load(test_file);
        assert_eq!(loaded.remotes.len(), 1);
        assert_eq!(loaded.remotes[0].name, "roundtrip-remote");

        // Cleanup
        let _ = fs::remove_file(store.base_dir().join(test_file));
    }

    #[cfg(unix)]
    #[test]
    fn test_file_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let store = ConfigStore::new().unwrap();
        let test_file = "test_permissions.json";

        let config = RemoteConfig::new();
        store.save(test_file, &config).unwrap();

        let path = store.base_dir().join(test_file);
        let metadata = fs::metadata(&path).unwrap();
        let mode = metadata.permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);

        // Cleanup
        let _ = fs::remove_file(path);
    }
}
