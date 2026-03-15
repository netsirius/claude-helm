mod commands;
mod config;
mod ssh;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
