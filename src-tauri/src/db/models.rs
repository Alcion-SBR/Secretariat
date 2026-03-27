use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub color: String,
    pub description: Option<String>,
    pub details: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Project {
    pub fn new(name: String, color: String) -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            color,
            description: None,
            details: None,
            created_at: now,
            updated_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub project_id: String,
    pub parent_folder_id: Option<String>,
    pub name: String,
    pub color: String,
    pub description: Option<String>,
    pub details: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Folder {
    pub fn new(
        project_id: String,
        name: String,
        color: String,
        parent_folder_id: Option<String>,
        description: Option<String>,
        details: Option<String>,
    ) -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            id: Uuid::new_v4().to_string(),
            project_id,
            parent_folder_id,
            name,
            color,
            description,
            details,
            created_at: now,
            updated_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelatedLink {
    #[serde(rename = "type")]
    pub link_type: String, // "FilePath" or "URL"
    pub url: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub folder_id: String,
    pub name: String,
    pub color: String,
    pub overview: Option<String>,
    pub details: Option<String>,
    pub related_links: Option<String>, // JSON string
    pub created_at: i64,
    pub updated_at: i64,
}

impl Task {
    pub fn new(folder_id: String, name: String) -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            id: Uuid::new_v4().to_string(),
            folder_id,
            name,
            color: "#2f80cc".to_string(),
            overview: None,
            details: None,
            related_links: None,
            created_at: now,
            updated_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeeklyGoal {
    pub id: String,
    pub project_id: Option<String>,
    pub task_id: Option<String>,
    pub week_start: i32,         // YYYYMMDD format
    pub target_hours: f64,
    pub actual_hours: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

impl WeeklyGoal {
    pub fn new(week_start: i32, target_hours: f64) -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            id: Uuid::new_v4().to_string(),
            project_id: None,
            task_id: None,
            week_start,
            target_hours,
            actual_hours: 0.0,
            created_at: now,
            updated_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerSession {
    pub id: String,
    pub task_id: String,
    pub start_time: i64,        // Unix timestamp
    pub end_time: Option<i64>,
    pub duration: Option<i32>,  // seconds
    pub date: i32,              // YYYYMMDD format
    pub created_at: i64,
}

impl TimerSession {
    pub fn new(task_id: String, date: i32) -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            id: Uuid::new_v4().to_string(),
            task_id,
            start_time: now,
            end_time: None,
            duration: None,
            date,
            created_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    pub task_id: Option<String>,
    pub title: String,
    pub date: i32, // YYYYMMDD
    pub start_minute: i32,
    pub end_minute: i32,
    pub note: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl CalendarEvent {
    pub fn new(
        task_id: Option<String>,
        title: String,
        date: i32,
        start_minute: i32,
        end_minute: i32,
        note: Option<String>,
    ) -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            id: Uuid::new_v4().to_string(),
            task_id,
            title,
            date,
            start_minute,
            end_minute,
            note,
            created_at: now,
            updated_at: now,
        }
    }
}
