use std::sync::Arc;
use tokio::sync::Mutex;

use crate::config::agents::AgentsConfig;
use crate::config::pipelines::PipelinesConfig;
use crate::config::vps::VpsConfig;
use crate::config::ConfigStore;
use crate::ssh::connection::SshPool;

/// Shared application state managed by Tauri.
///
/// Holds the config store, per-domain configs, and the SSH connection pool.
/// All mutable state is wrapped in `Arc<Mutex<_>>` so Tauri command handlers
/// (which receive `&self`) can safely mutate across async boundaries.
pub struct AppState {
    pub config: Arc<Mutex<ConfigStore>>,
    pub vps_config: Arc<Mutex<VpsConfig>>,
    pub agents_config: Arc<Mutex<AgentsConfig>>,
    pub pipelines_config: Arc<Mutex<PipelinesConfig>>,
    pub ssh_pool: Arc<SshPool>,
}

impl AppState {
    /// Initialise application state by loading configs from disk.
    ///
    /// Creates the SSH pool with a 60-second idle timeout.
    pub fn new() -> Self {
        let store = ConfigStore::new().expect("Failed to initialise config store");

        let vps_config: VpsConfig = store.load("vps.json");
        let agents_config: AgentsConfig = store.load("agents.json");
        let pipelines_config: PipelinesConfig = store.load("pipelines.json");

        Self {
            config: Arc::new(Mutex::new(store)),
            vps_config: Arc::new(Mutex::new(vps_config)),
            agents_config: Arc::new(Mutex::new(agents_config)),
            pipelines_config: Arc::new(Mutex::new(pipelines_config)),
            ssh_pool: Arc::new(SshPool::new(60)),
        }
    }
}
