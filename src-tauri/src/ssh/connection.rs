use async_trait::async_trait;
use russh::client::{Config, Handle};
use russh::keys::load_secret_key;
use russh::Disconnect;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

/// SSH client handler that accepts all server keys.
/// TODO: implement known_hosts checking for production use.
pub struct SshHandler;

#[async_trait]
impl russh::client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh_keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Accept all host keys for now.
        // In production, verify against ~/.ssh/known_hosts.
        Ok(true)
    }
}

/// Thread-safe wrapper around a russh Handle (which is not Clone).
pub type SharedHandle = Arc<Mutex<Handle<SshHandler>>>;

/// A pooled SSH connection with last-used tracking for idle cleanup.
struct PooledConnection {
    handle: SharedHandle,
    last_used: Instant,
}

/// Connection pool that reuses SSH sessions keyed by VPS ID.
pub struct SshPool {
    connections: Arc<Mutex<HashMap<String, PooledConnection>>>,
    idle_timeout: Duration,
}

impl SshPool {
    /// Create a new SSH connection pool.
    ///
    /// `idle_timeout_secs` controls how long an unused connection stays alive
    /// before `cleanup_idle()` removes it.
    pub fn new(idle_timeout_secs: u64) -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
            idle_timeout: Duration::from_secs(idle_timeout_secs),
        }
    }

    /// Return an existing connection for `vps_id`, or create a new one.
    ///
    /// Uses public-key authentication with the private key at `key_path`.
    pub async fn get_or_connect(
        &self,
        vps_id: &str,
        host: &str,
        port: u16,
        user: &str,
        key_path: &str,
    ) -> Result<SharedHandle, String> {
        let mut conns = self.connections.lock().await;

        // Return existing connection if it's still open
        if let Some(pooled) = conns.get_mut(vps_id) {
            let handle_guard = pooled.handle.lock().await;
            if !handle_guard.is_closed() {
                drop(handle_guard);
                pooled.last_used = Instant::now();
                return Ok(Arc::clone(&pooled.handle));
            }
            drop(handle_guard);
            // Connection is closed; remove stale entry and reconnect below
            conns.remove(vps_id);
        }

        // Load the private key (no passphrase)
        let key = load_secret_key(key_path, None)
            .map_err(|e| format!("Failed to load SSH key '{}': {}", key_path, e))?;

        let config = Arc::new(Config::default());
        let addr = format!("{}:{}", host, port);
        let handler = SshHandler;

        let mut handle = russh::client::connect(config, &addr, handler)
            .await
            .map_err(|e| format!("SSH connect to {} failed: {}", addr, e))?;

        // Authenticate with the private key
        let authenticated = handle
            .authenticate_publickey(user, Arc::new(key))
            .await
            .map_err(|e| format!("SSH auth failed for {}@{}: {}", user, addr, e))?;

        if !authenticated {
            return Err(format!(
                "SSH authentication rejected for {}@{}",
                user, addr
            ));
        }

        let shared = Arc::new(Mutex::new(handle));

        conns.insert(
            vps_id.to_string(),
            PooledConnection {
                handle: Arc::clone(&shared),
                last_used: Instant::now(),
            },
        );

        Ok(shared)
    }

    /// Close and remove the connection for a specific VPS.
    pub async fn disconnect(&self, vps_id: &str) -> Result<(), String> {
        let mut conns = self.connections.lock().await;
        if let Some(pooled) = conns.remove(vps_id) {
            let handle = pooled.handle.lock().await;
            handle
                .disconnect(Disconnect::ByApplication, "user requested disconnect", "")
                .await
                .map_err(|e| format!("SSH disconnect error: {}", e))?;
        }
        Ok(())
    }

    /// Remove connections that have been idle longer than the configured timeout.
    pub async fn cleanup_idle(&self) {
        let mut conns = self.connections.lock().await;
        let now = Instant::now();
        let timeout = self.idle_timeout;

        let expired: Vec<String> = conns
            .iter()
            .filter(|(_, pooled)| now.duration_since(pooled.last_used) > timeout)
            .map(|(id, _)| id.clone())
            .collect();

        for id in expired {
            if let Some(pooled) = conns.remove(&id) {
                let handle = pooled.handle.lock().await;
                let _ = handle
                    .disconnect(Disconnect::ByApplication, "idle timeout", "")
                    .await;
            }
        }
    }
}
