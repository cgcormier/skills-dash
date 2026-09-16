#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, State};

const LIMIT: u64 = 5 * 1024 * 1024;
struct StorageLock(Mutex<()>);

fn validate(data: &str) -> Result<(), String> {
    if data.len() as u64 > LIMIT {
        return Err("Workspace exceeds 5 MB.".into());
    }
    let value: serde_json::Value =
        serde_json::from_str(data).map_err(|e| format!("Invalid JSON: {e}"))?;
    if value["version"] != 1 {
        return Err("Unsupported workspace version.".into());
    }
    let skills = value["skills"]
        .as_array()
        .ok_or("Workspace skills must be an array.")?;
    if skills.len() > 10000 {
        return Err("Workspace exceeds 10,000 records.".into());
    }
    let mut ids = HashSet::new();
    for skill in skills {
        for field in [
            "id",
            "title",
            "summary",
            "category",
            "body",
            "createdAt",
            "updatedAt",
        ] {
            if !skill[field].is_string() {
                return Err(format!("Invalid skill field: {field}"));
            }
        }
        for field in ["id", "title", "category"] {
            if skill[field].as_str().unwrap().trim().is_empty() {
                return Err(format!("Empty skill field: {field}"));
            }
        }
        for field in ["createdAt", "updatedAt"] {
            let timestamp = skill[field].as_str().unwrap();
            if timestamp.len() != 24
                || !timestamp.ends_with('Z')
                || timestamp.as_bytes()[19] != b'.'
                || time::OffsetDateTime::parse(
                    timestamp,
                    &time::format_description::well_known::Rfc3339,
                )
                .is_err()
            {
                return Err(format!("Invalid timestamp: {field}"));
            }
        }
        if skill["title"].as_str().unwrap().encode_utf16().count() > 160
            || skill["summary"].as_str().unwrap().encode_utf16().count() > 1200
            || skill["category"].as_str().unwrap().encode_utf16().count() > 80
        {
            return Err("Skill field is too long.".into());
        }
        if !matches!(
            skill["status"].as_str(),
            Some("active" | "draft" | "archived")
        ) || !skill["favorite"].is_boolean()
        {
            return Err("Invalid skill status or favorite.".into());
        }
        for field in ["tags", "relatedIds"] {
            let list = skill[field].as_array().ok_or("Invalid skill list.")?;
            let mut values = HashSet::new();
            for item in list {
                let text = item.as_str().ok_or("Invalid list item.")?;
                if text.trim().is_empty() || !values.insert(text) {
                    return Err("Empty or duplicate list item.".into());
                }
            }
        }
        if !ids.insert(skill["id"].as_str().unwrap()) {
            return Err("Duplicate skill ID.".into());
        }
    }
    for skill in skills {
        for related in skill["relatedIds"].as_array().unwrap() {
            if related == &skill["id"] || !ids.contains(related.as_str().unwrap()) {
                return Err("Invalid relationship target.".into());
            }
        }
    }
    Ok(())
}

fn read_file(path: &Path) -> Result<Option<String>, String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Could not open workspace: {error}")),
    };
    let mut data = String::new();
    file.take(LIMIT + 1)
        .read_to_string(&mut data)
        .map_err(|e| e.to_string())?;
    validate(&data)?;
    Ok(Some(data))
}

#[cfg(windows)]
fn atomic_replace(from: &Path, to: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    let result = unsafe {
        MoveFileExW(
            from.as_ptr(),
            to.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        Err(std::io::Error::last_os_error().to_string())
    } else {
        Ok(())
    }
}
#[cfg(not(windows))]
fn atomic_replace(from: &Path, to: &Path) -> Result<(), String> {
    fs::rename(from, to).map_err(|e| e.to_string())
}

fn write_atomic(path: &Path, data: &str) -> Result<(), String> {
    let temp = path.with_extension("tmp");
    let mut file = File::create(&temp).map_err(|e| e.to_string())?;
    file.write_all(data.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    drop(file);
    atomic_replace(&temp, path)
}

fn save_in(directory: &Path, data: &str) -> Result<(), String> {
    validate(data)?;
    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let primary = directory.join("workspace-v1.json");
    // Only a valid previous workspace may replace the recovery copy.
    if let Ok(Some(previous)) = read_file(&primary) {
        write_atomic(&directory.join("workspace-v1.backup.json"), &previous)?;
    }
    write_atomic(&primary, data)
}

fn directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
fn load_workspace(
    app: tauri::AppHandle,
    lock: State<StorageLock>,
) -> Result<Option<String>, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    read_file(&directory(&app)?.join("workspace-v1.json"))
}
#[tauri::command]
fn recover_workspace(
    app: tauri::AppHandle,
    lock: State<StorageLock>,
) -> Result<Option<String>, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    read_file(&directory(&app)?.join("workspace-v1.backup.json"))
}
#[tauri::command]
fn save_workspace(
    app: tauri::AppHandle,
    lock: State<StorageLock>,
    data: String,
) -> Result<(), String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    save_in(&directory(&app)?, &data)
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
        .manage(StorageLock(Mutex::new(())))
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            save_workspace,
            recover_workspace
        ])
        .run(tauri::generate_context!())
        .expect("Could not start Skill Archive");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_envelope_and_rejects_bad_input() {
        assert!(validate(r#"{"version":1,"skills":[]}"#).is_ok());
        assert!(validate(r#"{"version":2,"skills":[]}"#).is_err());
        assert!(validate("not json").is_err());
    }
    #[test]
    fn validates_canonical_dates_and_utf16_limits_like_frontend() {
        let mut record = serde_json::json!({"id":"test","title":"Test","summary":"","category":"Design","body":"","createdAt":"2026-09-16T00:00:00.000Z","updatedAt":"2026-09-16T00:00:00.000Z","status":"active","favorite":false,"tags":[],"relatedIds":[]});
        let serialize = |skill: &serde_json::Value| {
            serde_json::json!({"version":1,"skills":[skill]}).to_string()
        };
        assert!(validate(&serialize(&record)).is_ok());
        record["updatedAt"] = serde_json::json!("2026-02-31T00:00:00.000Z");
        assert!(validate(&serialize(&record)).is_err());
        record["updatedAt"] = serde_json::json!("2026-09-16T00:00:00.000Z");
        record["title"] = serde_json::json!("😀".repeat(81));
        assert!(validate(&serialize(&record)).is_err());
    }
    #[test]
    fn saves_previous_copy_and_preserves_it_after_corruption() {
        let dir = std::env::temp_dir().join(format!("skill-archive-test-{}", std::process::id()));
        let first = r#"{"version":1,"skills":[]}"#;
        let second = "{\n\"version\":1,\"skills\":[]}";
        save_in(&dir, first).unwrap();
        save_in(&dir, second).unwrap();
        assert_eq!(
            read_file(&dir.join("workspace-v1.backup.json"))
                .unwrap()
                .unwrap(),
            first
        );
        fs::write(dir.join("workspace-v1.json"), "broken").unwrap();
        assert!(read_file(&dir.join("workspace-v1.json")).is_err());
        save_in(&dir, first).unwrap();
        assert_eq!(
            read_file(&dir.join("workspace-v1.backup.json"))
                .unwrap()
                .unwrap(),
            first
        );
        // Unique process-owned temporary fixture only.
        fs::remove_dir_all(&dir).unwrap();
    }
}
