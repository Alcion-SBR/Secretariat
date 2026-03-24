use crate::db::{
    create_project as create_project_query, delete_project as delete_project_query,
    get_project as get_project_query, list_projects as list_projects_query,
    update_project as update_project_query, Database, Project,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<Project>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectsResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<Vec<Project>>,
}

#[tauri::command]
pub fn list_projects(app_handle: tauri::AppHandle) -> ProjectsResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match list_projects_query(&conn) {
            Ok(projects) => ProjectsResponse {
                success: true,
                message: None,
                data: Some(projects),
            },
            Err(e) => ProjectsResponse {
                success: false,
                message: Some(format!("Failed to list projects: {}", e)),
                data: None,
            },
        },
        Err(e) => ProjectsResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn create_project(
    app_handle: tauri::AppHandle,
    name: String,
    color: String,
    description: Option<String>,
    details: Option<String>,
) -> ProjectResponse {
    let mut project = Project::new(name, color);
    project.description = description;
    project.details = details;

    match Database::open(&app_handle) {
        Ok(conn) => match create_project_query(&conn, &project) {
            Ok(_) => ProjectResponse {
                success: true,
                message: Some("Project created successfully".to_string()),
                data: Some(project),
            },
            Err(e) => ProjectResponse {
                success: false,
                message: Some(format!("Failed to create project: {}", e)),
                data: None,
            },
        },
        Err(e) => ProjectResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn get_project(app_handle: tauri::AppHandle, id: String) -> ProjectResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match get_project_query(&conn, &id) {
            Ok(project) => match project {
                Some(p) => ProjectResponse {
                    success: true,
                    message: None,
                    data: Some(p),
                },
                None => ProjectResponse {
                    success: false,
                    message: Some("Project not found".to_string()),
                    data: None,
                },
            },
            Err(e) => ProjectResponse {
                success: false,
                message: Some(format!("Failed to get project: {}", e)),
                data: None,
            },
        },
        Err(e) => ProjectResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn update_project(
    app_handle: tauri::AppHandle,
    id: String,
    name: String,
    color: String,
    description: Option<String>,
    details: Option<String>,
) -> ProjectResponse {
    let now = chrono::Utc::now().timestamp();
    let mut project = Project {
        id,
        name,
        color,
        description,
        details,
        created_at: 0,
        updated_at: now,
    };

    match Database::open(&app_handle) {
        Ok(conn) => {
            if let Ok(Some(existing)) = get_project_query(&conn, &project.id) {
                project.created_at = existing.created_at;
            }

            match update_project_query(&conn, &project) {
                Ok(_) => ProjectResponse {
                    success: true,
                    message: Some("Project updated successfully".to_string()),
                    data: Some(project),
                },
                Err(e) => ProjectResponse {
                    success: false,
                    message: Some(format!("Failed to update project: {}", e)),
                    data: None,
                },
            }
        }
        Err(e) => ProjectResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn delete_project(app_handle: tauri::AppHandle, id: String) -> ProjectResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match delete_project_query(&conn, &id) {
            Ok(_) => ProjectResponse {
                success: true,
                message: Some("Project deleted successfully".to_string()),
                data: None,
            },
            Err(e) => ProjectResponse {
                success: false,
                message: Some(format!("Failed to delete project: {}", e)),
                data: None,
            },
        },
        Err(e) => ProjectResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}
