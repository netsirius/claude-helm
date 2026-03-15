use async_trait::async_trait;
use russh::client::{Config, Handle};
use russh::keys::load_secret_key;
use russh::Disconnect;
use russh_keys::HashAlg;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

/// Load the known-hosts store from `~/.claude-manager/known_hosts.json`.
/// Returns an empty map if the file doesn't exist or can't be parsed.
fn load_known_hosts() -> HashMap<String, String> {
    let path = known_hosts_path();
    match std::fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

/// Persist the known-hosts map to `~/.claude-manager/known_hosts.json`.
fn save_known_hosts(hosts: &HashMap<String, String>) -> Result<(), String> {
    let path = known_hosts_path();
    let json = serde_json::to_string_pretty(hosts)
        .map_err(|e| format!("Failed to serialise known_hosts: {}", e))?;
    std::fs::write(&path, &json)
        .map_err(|e| format!("Failed to write known_hosts: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(&path, perms)
            .map_err(|e| format!("Failed to set known_hosts permissions: {}", e))?;
    }

    Ok(())
}

fn known_hosts_path() -> PathBuf {
    dirs::home_dir()
        .expect("Could not determine home directory")
        .join(".claude-manager")
        .join("known_hosts.json")
}

/// SSH client handler that implements Trust On First Use (TOFU) host key verification.
///
/// On first connection to a host, the server's public key fingerprint is stored in
/// `~/.claude-manager/known_hosts.json`. On subsequent connections, the key is verified
/// against the stored fingerprint.
pub struct SshHandler {
    /// The `host:port` identifier for this connection.
    host_addr: String,
}

impl SshHandler {
    pub fn new(host: &str, port: u16) -> Self {
        Self {
            host_addr: format!("{}:{}", host, port),
        }
    }
}

#[async_trait]
impl russh::client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh_keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        let fingerprint = server_public_key.fingerprint(HashAlg::Sha256).to_string();

        let mut known = load_known_hosts();

        if let Some(stored_fp) = known.get(&self.host_addr) {
            // Subsequent connection: verify the key matches
            if *stored_fp != fingerprint {
                eprintln!(
                    "HOST KEY VERIFICATION FAILED for {}!\n\
                     Stored fingerprint:  {}\n\
                     Current fingerprint: {}\n\
                     The server's host key has changed. This could indicate a \
                     man-in-the-middle attack. Connection rejected.\n\
                     To accept the new key, remove the entry for '{}' from \
                     ~/.claude-manager/known_hosts.json",
                    self.host_addr, stored_fp, fingerprint, self.host_addr
                );
                return Ok(false);
            }
            Ok(true)
        } else {
            // First connection (TOFU): store the fingerprint
            known.insert(self.host_addr.clone(), fingerprint);
            if let Err(e) = save_known_hosts(&known) {
                eprintln!("Warning: failed to save known_hosts: {}", e);
                // Still accept the key even if we can't persist, but warn
            }
            Ok(true)
        }
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

        // Expand tilde in key path to the user's home directory
        let expanded_key_path = if key_path.starts_with("~/") {
            match dirs::home_dir() {
                Some(home) => home.join(&key_path[2..]).to_string_lossy().into_owned(),
                None => key_path.to_string(),
            }
        } else {
            key_path.to_string()
        };

        // Load the private key (no passphrase)
        let key = load_secret_key(&expanded_key_path, None)
            .map_err(|e| format!("Failed to load SSH key '{}': {}", expanded_key_path, e))?;

        let config = Arc::new(Config::default());
        let addr = format!("{}:{}", host, port);
        let handler = SshHandler::new(host, port);

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
