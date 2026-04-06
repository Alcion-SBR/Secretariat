#[tauri::command]
pub fn open_path_in_explorer(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("path is empty".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::path::{Path, PathBuf};
        use std::process::Command;

        // Accept plain Windows paths, quoted paths, and file:// URLs.
        let unquoted = trimmed.trim_matches('"');
        let from_file_url = unquoted
            .strip_prefix("file:///")
            .or_else(|| unquoted.strip_prefix("file://"));
        let candidate = from_file_url.unwrap_or(unquoted).replace('/', "\\");
        let path_buf = PathBuf::from(candidate.clone());

        if !path_buf.exists() {
            return Err(format!("path not found: {}", candidate));
        }

        let child = if Path::new(&path_buf).is_file() {
            Command::new("explorer")
                .arg(format!("/select,{}", path_buf.display()))
                .spawn()
        } else {
            Command::new("explorer").arg(path_buf).spawn()
        }
        .map_err(|e| format!("failed to start explorer: {e}"))?;

        let _ = child;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = trimmed;
        Err("open_path_in_explorer is supported on Windows only".to_string())
    }
}
