use crate::db::{
    create_folder as create_folder_query, delete_folder as delete_folder_query,
    get_folder as get_folder_query, list_child_folders as list_child_folders_query,
    list_folders_by_project as list_folders_by_project_query,
    update_folder as update_folder_query, Database, Folder,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<Folder>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FoldersResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<Vec<Folder>>,
}

#[tauri::command]
pub fn list_folders_by_project(
    app_handle: tauri::AppHandle,
    project_id: String,
) -> FoldersResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match list_folders_by_project_query(&conn, &project_id) {
            Ok(folders) => FoldersResponse {
                success: true,
                message: None,
                data: Some(folders),
            },
            Err(e) => FoldersResponse {
                success: false,
                message: Some(format!("Failed to list folders: {}", e)),
                data: None,
            },
        },
        Err(e) => FoldersResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn list_child_folders(app_handle: tauri::AppHandle, parent_id: String) -> FoldersResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match list_child_folders_query(&conn, &parent_id) {
            Ok(folders) => FoldersResponse {
                success: true,
                message: None,
                data: Some(folders),
            },
            Err(e) => FoldersResponse {
                success: false,
                message: Some(format!("Failed to list child folders: {}", e)),
                data: None,
            },
        },
        Err(e) => FoldersResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn create_folder(
    app_handle: tauri::AppHandle,
    project_id: String,
    name: String,
    color: String,
    parent_folder_id: Option<String>,
    description: Option<String>,
    details: Option<String>,
) -> FolderResponse {
    let folder = Folder::new(project_id, name, color, parent_folder_id, description, details);

    match Database::open(&app_handle) {
        Ok(conn) => match create_folder_query(&conn, &folder) {
            Ok(_) => FolderResponse {
                success: true,
                message: Some("Folder created successfully".to_string()),
                data: Some(folder),
            },
            Err(e) => FolderResponse {
                success: false,
                message: Some(format!("Failed to create folder: {}", e)),
                data: None,
            },
        },
        Err(e) => FolderResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn update_folder(
    app_handle: tauri::AppHandle,
    id: String,
    name: String,
    color: String,
    parent_folder_id: Option<String>,
    description: Option<String>,
    details: Option<String>,
) -> FolderResponse {
    let now = chrono::Utc::now().timestamp();
    let folder = Folder {
        id,
        project_id: String::new(),
        parent_folder_id,
        name,
        color,
        description,
        details,
        created_at: 0,
        updated_at: now,
    };

    match Database::open(&app_handle) {
        Ok(conn) => {
            if let Ok(Some(existing)) = get_folder_query(&conn, &folder.id) {
                let mut updated_folder = folder.clone();
                updated_folder.project_id = existing.project_id;
                updated_folder.created_at = existing.created_at;

                match update_folder_query(&conn, &updated_folder) {
                    Ok(_) => FolderResponse {
                        success: true,
                        message: Some("Folder updated successfully".to_string()),
                        data: Some(updated_folder),
                    },
                    Err(e) => FolderResponse {
                        success: false,
                        message: Some(format!("Failed to update folder: {}", e)),
                        data: None,
                    },
                }
            } else {
                FolderResponse {
                    success: false,
                    message: Some("Folder not found".to_string()),
                    data: None,
                }
            }
        }
        Err(e) => FolderResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn delete_folder(app_handle: tauri::AppHandle, id: String) -> FolderResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match delete_folder_query(&conn, &id) {
            Ok(_) => FolderResponse {
                success: true,
                message: Some("Folder deleted successfully".to_string()),
                data: None,
            },
            Err(e) => FolderResponse {
                success: false,
                message: Some(format!("Failed to delete folder: {}", e)),
                data: None,
            },
        },
        Err(e) => FolderResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}
