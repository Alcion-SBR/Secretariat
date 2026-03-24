use crate::db::{
    create_task as create_task_query, delete_task as delete_task_query,
    get_task as get_task_query, list_tasks_by_folder as list_tasks_by_folder_query,
    list_tasks_by_project as list_tasks_by_project_query, update_task as update_task_query,
    Database, Task,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<Task>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TasksResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<Vec<Task>>,
}

#[tauri::command]
pub fn list_tasks_by_folder(app_handle: tauri::AppHandle, folder_id: String) -> TasksResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match list_tasks_by_folder_query(&conn, &folder_id) {
            Ok(tasks) => TasksResponse {
                success: true,
                message: None,
                data: Some(tasks),
            },
            Err(e) => TasksResponse {
                success: false,
                message: Some(format!("Failed to list tasks: {}", e)),
                data: None,
            },
        },
        Err(e) => TasksResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn list_tasks_by_project(app_handle: tauri::AppHandle, project_id: String) -> TasksResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match list_tasks_by_project_query(&conn, &project_id) {
            Ok(tasks) => TasksResponse {
                success: true,
                message: None,
                data: Some(tasks),
            },
            Err(e) => TasksResponse {
                success: false,
                message: Some(format!("Failed to list tasks by project: {}", e)),
                data: None,
            },
        },
        Err(e) => TasksResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn create_task(
    app_handle: tauri::AppHandle,
    folder_id: String,
    name: String,
    color: String,
    overview: Option<String>,
    details: Option<String>,
    related_links: Option<String>,
) -> TaskResponse {
    let mut task = Task::new(folder_id, name);
    task.color = color;
    task.overview = overview;
    task.details = details;
    task.related_links = related_links;

    match Database::open(&app_handle) {
        Ok(conn) => match create_task_query(&conn, &task) {
            Ok(_) => TaskResponse {
                success: true,
                message: Some("Task created successfully".to_string()),
                data: Some(task),
            },
            Err(e) => TaskResponse {
                success: false,
                message: Some(format!("Failed to create task: {}", e)),
                data: None,
            },
        },
        Err(e) => TaskResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn get_task(app_handle: tauri::AppHandle, id: String) -> TaskResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match get_task_query(&conn, &id) {
            Ok(task) => match task {
                Some(t) => TaskResponse {
                    success: true,
                    message: None,
                    data: Some(t),
                },
                None => TaskResponse {
                    success: false,
                    message: Some("Task not found".to_string()),
                    data: None,
                },
            },
            Err(e) => TaskResponse {
                success: false,
                message: Some(format!("Failed to get task: {}", e)),
                data: None,
            },
        },
        Err(e) => TaskResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn update_task(
    app_handle: tauri::AppHandle,
    id: String,
    name: String,
    color: String,
    overview: Option<String>,
    details: Option<String>,
    related_links: Option<String>,
) -> TaskResponse {
    let now = chrono::Utc::now().timestamp();
    let mut task = Task {
        id,
        folder_id: String::new(),
        name,
        color,
        overview,
        details,
        related_links,
        created_at: 0,
        updated_at: now,
    };

    match Database::open(&app_handle) {
        Ok(conn) => {
            if let Ok(Some(existing)) = get_task_query(&conn, &task.id) {
                task.folder_id = existing.folder_id;
                task.created_at = existing.created_at;

                match update_task_query(&conn, &task) {
                    Ok(_) => TaskResponse {
                        success: true,
                        message: Some("Task updated successfully".to_string()),
                        data: Some(task),
                    },
                    Err(e) => TaskResponse {
                        success: false,
                        message: Some(format!("Failed to update task: {}", e)),
                        data: None,
                    },
                }
            } else {
                TaskResponse {
                    success: false,
                    message: Some("Task not found".to_string()),
                    data: None,
                }
            }
        }
        Err(e) => TaskResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn delete_task(app_handle: tauri::AppHandle, id: String) -> TaskResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match delete_task_query(&conn, &id) {
            Ok(_) => TaskResponse {
                success: true,
                message: Some("Task deleted successfully".to_string()),
                data: None,
            },
            Err(e) => TaskResponse {
                success: false,
                message: Some(format!("Failed to delete task: {}", e)),
                data: None,
            },
        },
        Err(e) => TaskResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}
