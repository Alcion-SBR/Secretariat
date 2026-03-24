use crate::db::{
    create_calendar_event as create_calendar_event_query,
    delete_calendar_event as delete_calendar_event_query,
    get_calendar_event as get_calendar_event_query,
    list_calendar_events_in_range as list_calendar_events_in_range_query,
    update_calendar_event as update_calendar_event_query, CalendarEvent, Database,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CalendarEventResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<CalendarEvent>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CalendarEventsResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<Vec<CalendarEvent>>,
}

#[tauri::command]
pub fn list_calendar_events_in_range(
    app_handle: tauri::AppHandle,
    start_date: i32,
    end_date: i32,
) -> CalendarEventsResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match list_calendar_events_in_range_query(&conn, start_date, end_date) {
            Ok(events) => CalendarEventsResponse {
                success: true,
                message: None,
                data: Some(events),
            },
            Err(e) => CalendarEventsResponse {
                success: false,
                message: Some(format!("Failed to list calendar events: {}", e)),
                data: None,
            },
        },
        Err(e) => CalendarEventsResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn create_calendar_event(
    app_handle: tauri::AppHandle,
    task_id: Option<String>,
    title: String,
    date: i32,
    start_minute: i32,
    end_minute: i32,
    note: Option<String>,
) -> CalendarEventResponse {
    let event = CalendarEvent::new(task_id, title, date, start_minute, end_minute, note);

    match Database::open(&app_handle) {
        Ok(conn) => match create_calendar_event_query(&conn, &event) {
            Ok(_) => CalendarEventResponse {
                success: true,
                message: Some("Calendar event created successfully".to_string()),
                data: Some(event),
            },
            Err(e) => CalendarEventResponse {
                success: false,
                message: Some(format!("Failed to create calendar event: {}", e)),
                data: None,
            },
        },
        Err(e) => CalendarEventResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn update_calendar_event(
    app_handle: tauri::AppHandle,
    id: String,
    task_id: Option<String>,
    title: String,
    date: i32,
    start_minute: i32,
    end_minute: i32,
    note: Option<String>,
) -> CalendarEventResponse {
    match Database::open(&app_handle) {
        Ok(conn) => {
            if let Ok(Some(existing)) = get_calendar_event_query(&conn, &id) {
                let updated = CalendarEvent {
                    id,
                    task_id,
                    title,
                    date,
                    start_minute,
                    end_minute,
                    note,
                    created_at: existing.created_at,
                    updated_at: chrono::Utc::now().timestamp(),
                };
                match update_calendar_event_query(&conn, &updated) {
                    Ok(_) => CalendarEventResponse {
                        success: true,
                        message: Some("Calendar event updated successfully".to_string()),
                        data: Some(updated),
                    },
                    Err(e) => CalendarEventResponse {
                        success: false,
                        message: Some(format!("Failed to update calendar event: {}", e)),
                        data: None,
                    },
                }
            } else {
                CalendarEventResponse {
                    success: false,
                    message: Some("Calendar event not found".to_string()),
                    data: None,
                }
            }
        }
        Err(e) => CalendarEventResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn delete_calendar_event(app_handle: tauri::AppHandle, id: String) -> CalendarEventResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match delete_calendar_event_query(&conn, &id) {
            Ok(_) => CalendarEventResponse {
                success: true,
                message: Some("Calendar event deleted successfully".to_string()),
                data: None,
            },
            Err(e) => CalendarEventResponse {
                success: false,
                message: Some(format!("Failed to delete calendar event: {}", e)),
                data: None,
            },
        },
        Err(e) => CalendarEventResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}
