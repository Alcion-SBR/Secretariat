use crate::db::{
    create_weekly_goal as create_weekly_goal_query,
    delete_weekly_goal as delete_weekly_goal_query,
    get_weekly_goal as get_weekly_goal_query,
    list_weekly_goals_by_week as list_weekly_goals_by_week_query,
    list_weekly_goals_by_project as list_weekly_goals_by_project_query,
    list_weekly_goals_by_task as list_weekly_goals_by_task_query,
    update_weekly_goal as update_weekly_goal_query, Database, WeeklyGoal,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct WeeklyGoalResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<WeeklyGoal>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WeeklyGoalsResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<Vec<WeeklyGoal>>,
}

#[tauri::command]
pub fn create_weekly_goal(
    app_handle: tauri::AppHandle,
    project_id: Option<String>,
    task_id: Option<String>,
    week_start: i32,
    target_hours: f64,
) -> WeeklyGoalResponse {
    let mut goal = WeeklyGoal::new(week_start, target_hours);
    goal.project_id = project_id;
    goal.task_id = task_id;

    match Database::open(&app_handle) {
        Ok(conn) => match create_weekly_goal_query(&conn, &goal) {
            Ok(_) => WeeklyGoalResponse {
                success: true,
                message: Some("Weekly goal created successfully".to_string()),
                data: Some(goal),
            },
            Err(e) => WeeklyGoalResponse {
                success: false,
                message: Some(format!("Failed to create weekly goal: {}", e)),
                data: None,
            },
        },
        Err(e) => WeeklyGoalResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn list_weekly_goals_by_project(
    app_handle: tauri::AppHandle,
    project_id: String,
    week_start: i32,
) -> WeeklyGoalsResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match list_weekly_goals_by_project_query(&conn, &project_id, week_start) {
            Ok(goals) => WeeklyGoalsResponse {
                success: true,
                message: None,
                data: Some(goals),
            },
            Err(e) => WeeklyGoalsResponse {
                success: false,
                message: Some(format!("Failed to list weekly goals: {}", e)),
                data: None,
            },
        },
        Err(e) => WeeklyGoalsResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn list_weekly_goals_by_task(
    app_handle: tauri::AppHandle,
    task_id: String,
    week_start: i32,
) -> WeeklyGoalsResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match list_weekly_goals_by_task_query(&conn, &task_id, week_start) {
            Ok(goals) => WeeklyGoalsResponse {
                success: true,
                message: None,
                data: Some(goals),
            },
            Err(e) => WeeklyGoalsResponse {
                success: false,
                message: Some(format!("Failed to list weekly goals: {}", e)),
                data: None,
            },
        },
        Err(e) => WeeklyGoalsResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn list_weekly_goals_by_week(app_handle: tauri::AppHandle, week_start: i32) -> WeeklyGoalsResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match list_weekly_goals_by_week_query(&conn, week_start) {
            Ok(goals) => WeeklyGoalsResponse {
                success: true,
                message: None,
                data: Some(goals),
            },
            Err(e) => WeeklyGoalsResponse {
                success: false,
                message: Some(format!("Failed to list weekly goals: {}", e)),
                data: None,
            },
        },
        Err(e) => WeeklyGoalsResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn update_weekly_goal(
    app_handle: tauri::AppHandle,
    id: String,
    target_hours: f64,
    actual_hours: f64,
) -> WeeklyGoalResponse {
    let now = chrono::Utc::now().timestamp();
    let goal = WeeklyGoal {
        id,
        project_id: None,
        task_id: None,
        week_start: 0,
        target_hours,
        actual_hours,
        created_at: 0,
        updated_at: now,
    };

    match Database::open(&app_handle) {
        Ok(conn) => {
            if let Ok(Some(existing)) = get_weekly_goal_query(&conn, &goal.id) {
                let mut updated_goal = goal.clone();
                updated_goal.project_id = existing.project_id;
                updated_goal.task_id = existing.task_id;
                updated_goal.week_start = existing.week_start;
                updated_goal.created_at = existing.created_at;

                match update_weekly_goal_query(&conn, &updated_goal) {
                    Ok(_) => WeeklyGoalResponse {
                        success: true,
                        message: Some("Weekly goal updated successfully".to_string()),
                        data: Some(updated_goal),
                    },
                    Err(e) => WeeklyGoalResponse {
                        success: false,
                        message: Some(format!("Failed to update weekly goal: {}", e)),
                        data: None,
                    },
                }
            } else {
                WeeklyGoalResponse {
                    success: false,
                    message: Some("Weekly goal not found".to_string()),
                    data: None,
                }
            }
        }
        Err(e) => WeeklyGoalResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}

#[tauri::command]
pub fn delete_weekly_goal(app_handle: tauri::AppHandle, id: String) -> WeeklyGoalResponse {
    match Database::open(&app_handle) {
        Ok(conn) => match delete_weekly_goal_query(&conn, &id) {
            Ok(_) => WeeklyGoalResponse {
                success: true,
                message: Some("Weekly goal deleted successfully".to_string()),
                data: None,
            },
            Err(e) => WeeklyGoalResponse {
                success: false,
                message: Some(format!("Failed to delete weekly goal: {}", e)),
                data: None,
            },
        },
        Err(e) => WeeklyGoalResponse {
            success: false,
            message: Some(format!("Database connection error: {}", e)),
            data: None,
        },
    }
}
