mod db;
mod commands;

use db::Database;
use commands::*;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                if let Err(e) = Database::init(&app_handle) {
                    eprintln!("Failed to initialize database: {}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            // Projects
            list_projects,
            create_project,
            get_project,
            update_project,
            delete_project,
            // Folders
            list_folders_by_project,
            list_child_folders,
            create_folder,
            update_folder,
            delete_folder,
            // Tasks
            list_tasks_by_folder,
            list_tasks_by_project,
            create_task,
            get_task,
            update_task,
            delete_task,
            // Weekly Goals
            create_weekly_goal,
            list_weekly_goals_by_week,
            list_weekly_goals_by_project,
            list_weekly_goals_by_task,
            update_weekly_goal,
            delete_weekly_goal,
            // Timer Sessions
            create_timer_session,
            list_timer_sessions_by_task,
            list_timer_sessions_by_date,
            update_timer_session,
            delete_timer_session,
            // Calendar Events
            list_calendar_events_in_range,
            create_calendar_event,
            update_calendar_event,
            delete_calendar_event,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
