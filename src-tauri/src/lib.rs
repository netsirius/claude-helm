mod commands;
mod config;
mod ssh;
mod state;

use std::sync::Arc;
use std::time::Duration;

use tauri::Manager;

use crate::ssh::connection::SshPool;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .setup(|app| {
            // Spawn a background task that periodically cleans up idle SSH connections
            let ssh_pool: Arc<SshPool> = {
                let state: tauri::State<AppState> = app.state();
                Arc::clone(&state.ssh_pool)
            };

            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_secs(30)).await;
                    ssh_pool.cleanup_idle().await;
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::vps_commands::list_vps,
            commands::vps_commands::add_vps,
            commands::vps_commands::remove_vps,
            commands::vps_commands::test_vps_connection,
            commands::vps_commands::probe_vps,
            commands::agent_commands::list_agents,
            commands::agent_commands::add_agent,
            commands::agent_commands::remove_agent,
            commands::session_commands::list_sessions,
            commands::session_commands::create_session,
            commands::session_commands::stop_session,
            commands::session_commands::capture_session_output,
            commands::extension_commands::list_vps_extensions,
            commands::pipeline_commands::list_pipelines,
            commands::pipeline_commands::create_pipeline,
            commands::pipeline_commands::add_pipeline_step,
            commands::pipeline_commands::delete_pipeline,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
