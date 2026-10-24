#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(not(windows))]
use std::fs::File;
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};
use tauri::Manager;
mod skills;

const LIMIT: u64 = 5 * 1024 * 1024;
fn directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

// Explicit legacy bridge: return original text even if its JSON/schema is bad.
// It never migrates or writes the archive, and never inspects personal skills.
#[tauri::command]
fn read_legacy_archive(app: tauri::AppHandle, backup: bool) -> Result<Option<String>, String> {
    let name = if backup {
        "workspace-v1.backup.json"
    } else {
        "workspace-v1.json"
    };
    let path = directory(&app)?.join(name);
    read_legacy_raw(&path)
}
fn read_legacy_raw(path: &Path) -> Result<Option<String>, String> {
    // Preserve the missing-file contract before guarding existing ancestors.
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("Could not inspect legacy archive: {e}")),
        Ok(_) => (),
    }
    #[cfg(windows)]
    let _guards = skills::guard_directories(
        path.parent()
            .ok_or("Legacy archive has no parent directory.")?,
    )?;
    #[cfg(windows)]
    let file = skills::guarded_open(path, false)?;
    #[cfg(not(windows))]
    let file = match File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("Could not read legacy archive: {e}")),
    };
    let mut bytes = Vec::new();
    file.take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > LIMIT {
        return Err("Legacy archive exceeds 5 MB; it was left untouched.".into());
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| "Legacy archive is not valid UTF-8; it was left untouched.".into())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            read_legacy_archive,
            skills::discover_skills,
            skills::read_skill,
            skills::save_skill,
            skills::list_skill_recoveries,
            skills::read_skill_recovery
        ])
        .run(tauri::generate_context!())
        .expect("Could not start personal skills workbench");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_bridge_returns_corrupt_raw_without_repairing_it() {
        let directory = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("output/native-tests")
            .join(format!(
                "legacy-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("workspace-v1.json");
        assert!(read_legacy_raw(&path).unwrap().is_none());
        let invalid = "\u{feff}{not valid JSON\r\n";
        fs::write(&path, invalid).unwrap();
        assert_eq!(read_legacy_raw(&path).unwrap().unwrap(), invalid);
        assert_eq!(fs::read(&path).unwrap(), invalid.as_bytes());
        fs::write(&path, [0xff]).unwrap();
        assert!(read_legacy_raw(&path).unwrap_err().contains("UTF-8"));
        fs::write(&path, vec![b'a'; LIMIT as usize + 1]).unwrap();
        assert!(read_legacy_raw(&path).unwrap_err().contains("5 MB"));
        assert_eq!(fs::metadata(path).unwrap().len(), LIMIT + 1);
        // Unique ignored fixture retained for inspection; no recursive cleanup.
    }
}
