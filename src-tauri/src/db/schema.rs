use rusqlite::{Connection, Result as SqlResult};

pub fn init_schema(conn: &Connection) -> SqlResult<()> {
    // Projects テーブル
    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            description TEXT,
            details TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    // Folders テーブル
    conn.execute(
        "CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            parent_folder_id TEXT,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#2f80cc',
            description TEXT,
            details TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id),
            FOREIGN KEY(parent_folder_id) REFERENCES folders(id)
        )",
        [],
    )?;

    // Tasks テーブル
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            folder_id TEXT NOT NULL,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#2f80cc',
            overview TEXT,
            details TEXT,
            related_links TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(folder_id) REFERENCES folders(id)
        )",
        [],
    )?;

    // 既存DB向けマイグレーション: tasks.color を後方互換で追加
    let mut has_color = false;
    let mut stmt = conn.prepare("PRAGMA table_info(tasks)")?;
    let columns = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for column in columns {
        if column? == "color" {
            has_color = true;
            break;
        }
    }
    if !has_color {
        conn.execute(
            "ALTER TABLE tasks ADD COLUMN color TEXT NOT NULL DEFAULT '#2f80cc'",
            [],
        )?;
    }

    // 既存DB向けマイグレーション: folders に color/description/details を後方互換で追加
    let mut folder_cols: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut stmt2 = conn.prepare("PRAGMA table_info(folders)")?;
    let col_names = stmt2.query_map([], |row| row.get::<_, String>(1))?;
    for col in col_names {
        folder_cols.insert(col?);
    }
    if !folder_cols.contains("color") {
        conn.execute(
            "ALTER TABLE folders ADD COLUMN color TEXT NOT NULL DEFAULT '#2f80cc'",
            [],
        )?;
    }
    if !folder_cols.contains("description") {
        conn.execute("ALTER TABLE folders ADD COLUMN description TEXT", [])?;
    }
    if !folder_cols.contains("details") {
        conn.execute("ALTER TABLE folders ADD COLUMN details TEXT", [])?;
    }

    // WeeklyGoals テーブル
    conn.execute(
        "CREATE TABLE IF NOT EXISTS weekly_goals (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            task_id TEXT,
            week_start INTEGER NOT NULL,
            target_hours REAL NOT NULL,
            actual_hours REAL NOT NULL DEFAULT 0.0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id),
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        )",
        [],
    )?;

    // TimerSessions テーブル
    conn.execute(
        "CREATE TABLE IF NOT EXISTS timer_sessions (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            start_time INTEGER NOT NULL,
            end_time INTEGER,
            duration INTEGER,
            date INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        )",
        [],
    )?;

    // CalendarEvents テーブル
    conn.execute(
        "CREATE TABLE IF NOT EXISTS calendar_events (
            id TEXT PRIMARY KEY,
            task_id TEXT,
            title TEXT NOT NULL,
            date INTEGER NOT NULL,
            start_minute INTEGER NOT NULL,
            end_minute INTEGER NOT NULL,
            note TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        )",
        [],
    )?;

    // インデックス作成（クエリ性能向上）
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_folders_project_id ON folders(project_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_folder_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_folder_id ON tasks(folder_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_weekly_goals_project_id ON weekly_goals(project_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_weekly_goals_task_id ON weekly_goals(task_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_timer_sessions_task_id ON timer_sessions(task_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_timer_sessions_date ON timer_sessions(date)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_calendar_events_task_id ON calendar_events(task_id)",
        [],
    )?;

    Ok(())
}
