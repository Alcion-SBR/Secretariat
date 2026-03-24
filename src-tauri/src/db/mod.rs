mod models;
mod schema;
mod queries;

pub use models::*;
pub use queries::*;

use rusqlite::{Connection, Result as SqlResult};
use std::path::PathBuf;
use tauri::Manager;

pub struct Database;

impl Database {
    pub fn init(app_handle: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
        let db_path = Self::get_db_path(app_handle);
        
        // ディレクトリが存在しない場合は作成
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(&db_path)?;
        schema::init_schema(&conn)?;
        
        Ok(())
    }

    pub fn open(app_handle: &tauri::AppHandle) -> SqlResult<Connection> {
        let db_path = Self::get_db_path(app_handle);
        Connection::open(db_path)
    }

    fn get_db_path(app_handle: &tauri::AppHandle) -> PathBuf {
        let app_local_data_dir = app_handle.path().app_local_data_dir().unwrap_or_default();
        app_local_data_dir.join("secretariat.db")
    }
}
