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
            commands::remote_commands::list_remotes,
            commands::remote_commands::add_remote,
            commands::remote_commands::update_remote,
            commands::remote_commands::remove_remote,
            commands::remote_commands::test_remote_connection,
            commands::remote_commands::probe_remote,
            commands::remote_commands::browse_remote_dir,
            commands::remote_commands::read_remote_claude_config,
            commands::remote_commands::write_remote_claude_config,
            commands::remote_commands::install_claude_remote,
            commands::remote_commands::update_claude_remote,
            commands::agent_commands::list_agents,
            commands::agent_commands::add_agent,
            commands::agent_commands::remove_agent,
            commands::session_commands::list_sessions,
            commands::session_commands::create_session,
            commands::session_commands::stop_session,
            commands::session_commands::capture_session_output,
            commands::session_commands::get_agent_activity,
            commands::session_commands::open_session_terminal,
            commands::extension_commands::list_remote_extensions,
            commands::pipeline_commands::list_pipelines,
            commands::pipeline_commands::create_pipeline,
            commands::pipeline_commands::add_pipeline_step,
            commands::pipeline_commands::delete_pipeline,
            commands::pipeline_commands::execute_pipeline,
            commands::pipeline_commands::get_pipeline_status,
            commands::pipeline_commands::cancel_pipeline,
            commands::remote_admin_commands::list_remote_skills,
            commands::remote_admin_commands::list_remote_plugins,
            commands::remote_admin_commands::install_plugin_on_remote,
            commands::remote_admin_commands::list_remote_hooks,
            commands::remote_admin_commands::list_remote_mcps,
            commands::remote_admin_commands::list_remote_agents,
            commands::remote_admin_commands::remove_remote_extension,
            commands::remote_admin_commands::toggle_remote_extension,
            commands::remote_admin_commands::search_skills_marketplace,
            commands::analytics_commands::get_remote_usage_stats,
            commands::analytics_commands::get_session_heatmap,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
