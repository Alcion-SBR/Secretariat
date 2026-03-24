use crate::db::models::*;
use rusqlite::{params, Connection, Result as SqlResult, OptionalExtension};

// ==================== Projects ====================

pub fn create_project(conn: &Connection, project: &Project) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO projects (id, name, color, description, details, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            project.id,
            project.name,
            project.color,
            project.description,
            project.details,
            project.created_at,
            project.updated_at
        ],
    )?;
    Ok(())
}

pub fn get_project(conn: &Connection, id: &str) -> SqlResult<Option<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, color, description, details, created_at, updated_at FROM projects WHERE id = ?1",
    )?;

    let project = stmt.query_row(params![id], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            description: row.get(3)?,
            details: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    }).optional()?;

    Ok(project)
}

pub fn list_projects(conn: &Connection) -> SqlResult<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, color, description, details, created_at, updated_at FROM projects ORDER BY created_at DESC",
    )?;

    let projects = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            description: row.get(3)?,
            details: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?
    .collect::<SqlResult<Vec<_>>>()?;

    Ok(projects)
}

pub fn update_project(conn: &Connection, project: &Project) -> SqlResult<()> {
    conn.execute(
        "UPDATE projects SET name = ?1, color = ?2, description = ?3, details = ?4, updated_at = ?5 WHERE id = ?6",
        params![
            project.name,
            project.color,
            project.description,
            project.details,
            project.updated_at,
            project.id
        ],
    )?;
    Ok(())
}

pub fn delete_project(conn: &Connection, id: &str) -> SqlResult<()> {
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
    Ok(())
}

// ==================== Folders ====================

pub fn create_folder(conn: &Connection, folder: &Folder) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO folders (id, project_id, parent_folder_id, name, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            folder.id,
            folder.project_id,
            folder.parent_folder_id,
            folder.name,
            folder.created_at,
            folder.updated_at
        ],
    )?;
    Ok(())
}

pub fn get_folder(conn: &Connection, id: &str) -> SqlResult<Option<Folder>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, parent_folder_id, name, created_at, updated_at FROM folders WHERE id = ?1",
    )?;

    let folder = stmt.query_row(params![id], |row| {
        Ok(Folder {
            id: row.get(0)?,
            project_id: row.get(1)?,
            parent_folder_id: row.get(2)?,
            name: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    }).optional()?;

    Ok(folder)
}

pub fn list_folders_by_project(conn: &Connection, project_id: &str) -> SqlResult<Vec<Folder>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, parent_folder_id, name, created_at, updated_at FROM folders WHERE project_id = ?1 ORDER BY created_at ASC",
    )?;

    let folders = stmt.query_map(params![project_id], |row| {
        Ok(Folder {
            id: row.get(0)?,
            project_id: row.get(1)?,
            parent_folder_id: row.get(2)?,
            name: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?
    .collect::<SqlResult<Vec<_>>>()?;

    Ok(folders)
}

pub fn list_child_folders(conn: &Connection, parent_id: &str) -> SqlResult<Vec<Folder>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, parent_folder_id, name, created_at, updated_at FROM folders WHERE parent_folder_id = ?1 ORDER BY created_at ASC",
    )?;

    let folders = stmt.query_map(params![parent_id], |row| {
        Ok(Folder {
            id: row.get(0)?,
            project_id: row.get(1)?,
            parent_folder_id: row.get(2)?,
            name: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?
    .collect::<SqlResult<Vec<_>>>()?;

    Ok(folders)
}

pub fn update_folder(conn: &Connection, folder: &Folder) -> SqlResult<()> {
    conn.execute(
        "UPDATE folders SET name = ?1, parent_folder_id = ?2, updated_at = ?3 WHERE id = ?4",
        params![
            folder.name,
            folder.parent_folder_id,
            folder.updated_at,
            folder.id
        ],
    )?;
    Ok(())
}

pub fn delete_folder(conn: &Connection, id: &str) -> SqlResult<()> {
    conn.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
    Ok(())
}

// ==================== Tasks ====================

pub fn create_task(conn: &Connection, task: &Task) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO tasks (id, folder_id, name, color, overview, details, related_links, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            task.id,
            task.folder_id,
            task.name,
            task.color,
            task.overview,
            task.details,
            task.related_links,
            task.created_at,
            task.updated_at
        ],
    )?;
    Ok(())
}

pub fn get_task(conn: &Connection, id: &str) -> SqlResult<Option<Task>> {
    let mut stmt = conn.prepare(
        "SELECT id, folder_id, name, color, overview, details, related_links, created_at, updated_at FROM tasks WHERE id = ?1",
    )?;

    let task = stmt.query_row(params![id], |row| {
        Ok(Task {
            id: row.get(0)?,
            folder_id: row.get(1)?,
            name: row.get(2)?,
            color: row.get(3)?,
            overview: row.get(4)?,
            details: row.get(5)?,
            related_links: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    }).optional()?;

    Ok(task)
}

pub fn list_tasks_by_folder(conn: &Connection, folder_id: &str) -> SqlResult<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT id, folder_id, name, color, overview, details, related_links, created_at, updated_at FROM tasks WHERE folder_id = ?1 ORDER BY created_at ASC",
    )?;

    let tasks = stmt.query_map(params![folder_id], |row| {
        Ok(Task {
            id: row.get(0)?,
            folder_id: row.get(1)?,
            name: row.get(2)?,
            color: row.get(3)?,
            overview: row.get(4)?,
            details: row.get(5)?,
            related_links: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?
    .collect::<SqlResult<Vec<_>>>()?;

    Ok(tasks)
}

pub fn update_task(conn: &Connection, task: &Task) -> SqlResult<()> {
    conn.execute(
        "UPDATE tasks SET name = ?1, color = ?2, overview = ?3, details = ?4, related_links = ?5, updated_at = ?6 WHERE id = ?7",
        params![
            task.name,
            task.color,
            task.overview,
            task.details,
            task.related_links,
            task.updated_at,
            task.id
        ],
    )?;
    Ok(())
}

pub fn delete_task(conn: &Connection, id: &str) -> SqlResult<()> {
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
    Ok(())
}

// ==================== WeeklyGoals ====================

pub fn create_weekly_goal(conn: &Connection, goal: &WeeklyGoal) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO weekly_goals (id, project_id, task_id, week_start, target_hours, actual_hours, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            goal.id,
            goal.project_id,
            goal.task_id,
            goal.week_start,
            goal.target_hours,
            goal.actual_hours,
            goal.created_at,
            goal.updated_at
        ],
    )?;
    Ok(())
}

pub fn get_weekly_goal(conn: &Connection, id: &str) -> SqlResult<Option<WeeklyGoal>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, task_id, week_start, target_hours, actual_hours, created_at, updated_at FROM weekly_goals WHERE id = ?1",
    )?;

    let goal = stmt.query_row(params![id], |row| {
        Ok(WeeklyGoal {
            id: row.get(0)?,
            project_id: row.get(1)?,
            task_id: row.get(2)?,
            week_start: row.get(3)?,
            target_hours: row.get(4)?,
            actual_hours: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }).optional()?;

    Ok(goal)
}

pub fn list_weekly_goals_by_project(conn: &Connection, project_id: &str, week_start: i32) -> SqlResult<Vec<WeeklyGoal>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, task_id, week_start, target_hours, actual_hours, created_at, updated_at 
         FROM weekly_goals WHERE project_id = ?1 AND week_start = ?2 AND task_id IS NULL",
    )?;

    let goals = stmt.query_map(params![project_id, week_start], |row| {
        Ok(WeeklyGoal {
            id: row.get(0)?,
            project_id: row.get(1)?,
            task_id: row.get(2)?,
            week_start: row.get(3)?,
            target_hours: row.get(4)?,
            actual_hours: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?
    .collect::<SqlResult<Vec<_>>>()?;

    Ok(goals)
}

pub fn list_weekly_goals_by_task(conn: &Connection, task_id: &str, week_start: i32) -> SqlResult<Vec<WeeklyGoal>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, task_id, week_start, target_hours, actual_hours, created_at, updated_at 
         FROM weekly_goals WHERE task_id = ?1 AND week_start = ?2",
    )?;

    let goals = stmt.query_map(params![task_id, week_start], |row| {
        Ok(WeeklyGoal {
            id: row.get(0)?,
            project_id: row.get(1)?,
            task_id: row.get(2)?,
            week_start: row.get(3)?,
            target_hours: row.get(4)?,
            actual_hours: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?
    .collect::<SqlResult<Vec<_>>>()?;

    Ok(goals)
}

pub fn update_weekly_goal(conn: &Connection, goal: &WeeklyGoal) -> SqlResult<()> {
    conn.execute(
        "UPDATE weekly_goals SET target_hours = ?1, actual_hours = ?2, updated_at = ?3 WHERE id = ?4",
        params![
            goal.target_hours,
            goal.actual_hours,
            goal.updated_at,
            goal.id
        ],
    )?;
    Ok(())
}

pub fn delete_weekly_goal(conn: &Connection, id: &str) -> SqlResult<()> {
    conn.execute("DELETE FROM weekly_goals WHERE id = ?1", params![id])?;
    Ok(())
}

// ==================== TimerSessions ====================

pub fn create_timer_session(conn: &Connection, session: &TimerSession) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO timer_sessions (id, task_id, start_time, end_time, duration, date, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            session.id,
            session.task_id,
            session.start_time,
            session.end_time,
            session.duration,
            session.date,
            session.created_at
        ],
    )?;
    Ok(())
}

pub fn get_timer_session(conn: &Connection, id: &str) -> SqlResult<Option<TimerSession>> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, start_time, end_time, duration, date, created_at FROM timer_sessions WHERE id = ?1",
    )?;

    let session = stmt.query_row(params![id], |row| {
        Ok(TimerSession {
            id: row.get(0)?,
            task_id: row.get(1)?,
            start_time: row.get(2)?,
            end_time: row.get(3)?,
            duration: row.get(4)?,
            date: row.get(5)?,
            created_at: row.get(6)?,
        })
    }).optional()?;

    Ok(session)
}

pub fn list_timer_sessions_by_task(conn: &Connection, task_id: &str) -> SqlResult<Vec<TimerSession>> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, start_time, end_time, duration, date, created_at FROM timer_sessions WHERE task_id = ?1 ORDER BY date DESC",
    )?;

    let sessions = stmt.query_map(params![task_id], |row| {
        Ok(TimerSession {
            id: row.get(0)?,
            task_id: row.get(1)?,
            start_time: row.get(2)?,
            end_time: row.get(3)?,
            duration: row.get(4)?,
            date: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?
    .collect::<SqlResult<Vec<_>>>()?;

    Ok(sessions)
}

pub fn list_timer_sessions_by_date(conn: &Connection, date: i32) -> SqlResult<Vec<TimerSession>> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, start_time, end_time, duration, date, created_at FROM timer_sessions WHERE date = ?1 ORDER BY start_time ASC",
    )?;

    let sessions = stmt.query_map(params![date], |row| {
        Ok(TimerSession {
            id: row.get(0)?,
            task_id: row.get(1)?,
            start_time: row.get(2)?,
            end_time: row.get(3)?,
            duration: row.get(4)?,
            date: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?
    .collect::<SqlResult<Vec<_>>>()?;

    Ok(sessions)
}

pub fn update_timer_session(conn: &Connection, session: &TimerSession) -> SqlResult<()> {
    conn.execute(
        "UPDATE timer_sessions SET end_time = ?1, duration = ?2 WHERE id = ?3",
        params![session.end_time, session.duration, session.id],
    )?;
    Ok(())
}

pub fn delete_timer_session(conn: &Connection, id: &str) -> SqlResult<()> {
    conn.execute("DELETE FROM timer_sessions WHERE id = ?1", params![id])?;
    Ok(())
}
