use crate::db::{
    create_timer_session as create_timer_session_query,
    delete_timer_session as delete_timer_session_query,
    get_timer_session as get_timer_session_query,
    list_timer_sessions_by_date as list_timer_sessions_by_date_query,
    list_timer_sessions_by_task as list_timer_sessions_by_task_query,
    update_timer_session as update_timer_session_query, Database, TimerSession,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct TimerSessionResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<TimerSession>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TimerSessionsResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<Vec<TimerSession>>,
}

#[tauri::command]
pub fn create_timer_session(
    app_handle: tauri::AppHandle,
    task_id: String,
    date: i32,
) -> TimerSessionResponse {
    let session = TimerSession::new(task_id, date);

    match Database::open(&app_handle) {
        Ok(conn) => match create_timer_session_query(&conn, &session) {
            Ok(_) => TimerSessionResponse {
                success: true,
                message: Some("Timer session created successfully".to_string()),
                data: Some(session),
            },
            Err(e) => TimerSessionResponse {
                success: false,
                message: Some(format!("Failed to create timer session: {}", e)),
                data: None,
            },
        },
        Err(e) => TimerSessionResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn list_timer_sessions_by_task(
    app_handle: tauri::AppHandle,
    task_id: String,
) -> TimerSessionsResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match list_timer_sessions_by_task_query(&conn, &task_id) {
            Ok(sessions) => TimerSessionsResponse {
                success: true,
                message: None,
                data: Some(sessions),
            },
            Err(e) => TimerSessionsResponse {
                success: false,
                message: Some(format!("Failed to list timer sessions: {}", e)),
                data: None,
            },
        },
        Err(e) => TimerSessionsResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn list_timer_sessions_by_date(
    app_handle: tauri::AppHandle,
    date: i32,
) -> TimerSessionsResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match list_timer_sessions_by_date_query(&conn, date) {
            Ok(sessions) => TimerSessionsResponse {
                success: true,
                message: None,
                data: Some(sessions),
            },
            Err(e) => TimerSessionsResponse {
                success: false,
                message: Some(format!("Failed to list timer sessions by date: {}", e)),
                data: None,
            },
        },
        Err(e) => TimerSessionsResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn update_timer_session(
    app_handle: tauri::AppHandle,
    id: String,
    end_time: i64,
    duration: i32,
) -> TimerSessionResponse {
    match Database::open(&app_handle) {
        Ok(conn) => {
            if let Ok(Some(mut session)) = get_timer_session_query(&conn, &id) {
                session.end_time = Some(end_time);
                session.duration = Some(duration);

                match update_timer_session_query(&conn, &session) {
                    Ok(_) => TimerSessionResponse {
                        success: true,
                        message: Some("Timer session updated successfully".to_string()),
                        data: Some(session),
                    },
                    Err(e) => TimerSessionResponse {
                        success: false,
                        message: Some(format!("Failed to update timer session: {}", e)),
                        data: None,
                    },
                }
            } else {
                TimerSessionResponse {
                    success: false,
                    message: Some("Timer session not found".to_string()),
                    data: None,
                }
            }
        }
        Err(e) => TimerSessionResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn delete_timer_session(app_handle: tauri::AppHandle, id: String) -> TimerSessionResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match delete_timer_session_query(&conn, &id) {
            Ok(_) => TimerSessionResponse {
                success: true,
                message: Some("Timer session deleted successfully".to_string()),
                data: None,
            },
            Err(e) => TimerSessionResponse {
                success: false,
                message: Some(format!("Failed to delete timer session: {}", e)),
                data: None,
            },
        },
        Err(e) => TimerSessionResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}
