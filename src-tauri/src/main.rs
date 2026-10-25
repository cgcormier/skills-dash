#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(not(windows))]
use std::fs::File;
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};
use tauri::Manager;
mod lifecycle;
mod profile;
mod reviewer;
mod skills;

const LIMIT: u64 = 5 * 1024 * 1024;
fn directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    profile::data_dir(app)
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
    // Invalid explicit profiles fail before any ordinary app window or storage
    // is opened. Test instances never contact/focus the installed normal app.
    let test_profile = profile::test_profile()
        .expect("Invalid SKILLS_DASH_TEST_PROFILE; ordinary profile was not opened");
    // Held in main's scope until the blocking app event loop exits. Each test
    // profile gets its own lease; production retains the existing plugin.
    let _test_profile_lease = test_profile
        .as_deref()
        .map(profile::acquire_test_session_lease)
        .transpose()
        .expect("Could not acquire the test profile session; no app window was opened");
    let mut context = tauri::generate_context!();
    let mut test_windows = vec![];
    if test_profile.is_some() {
        for window in &mut context.config_mut().app.windows {
            test_windows.push(window.clone());
            window.create = false;
        }
    }
    let mut builder = tauri::Builder::default().manage(reviewer::Reviewers::default());
    if test_profile.is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }
    builder
        .setup(move |app| {
            if let Some(profile) = &test_profile {
                let webview = profile.join("webview");
                let _guards =
                    skills::create_guarded_directories(&webview).map_err(std::io::Error::other)?;
                for window in &test_windows {
                    tauri::WebviewWindowBuilder::from_config(app, window)?
                        .data_directory(webview.clone())
                        .build()?;
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_legacy_archive,
            skills::discover_skills,
            skills::read_skill,
            skills::save_skill,
            skills::list_skill_recoveries,
            skills::read_skill_recovery,
            profile::lifecycle_profile,
            lifecycle::lifecycle_read,
            lifecycle::lifecycle_write,
            reviewer::reviewer_start,
            reviewer::reviewer_cancel
        ])
        .run(context)
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
