//! The only alternate root is an explicitly marked, process-local test profile.
use serde::Serialize;
#[cfg(windows)]
use std::fs::OpenOptions;
use std::{
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
};
use tauri::Manager;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub root: String,
    pub data_dir: String,
    pub test: bool,
}

/// Keep this value alive across the app event loop. Unlike the short lifecycle
/// CAS lock, this lease prevents two engines from opening the same test profile
/// and treating one another's live review as an interrupted prior session.
#[derive(Debug)]
pub struct TestProfileLease {
    _file: File,
    _directories: Vec<File>,
}

#[cfg(windows)]
pub fn acquire_test_session_lease(profile: &Path) -> Result<TestProfileLease, String> {
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT;
    // The caller has already selected/validated the explicit process profile.
    // This helper is not an IPC command and never accepts a UI-selected root.
    let directory = profile.join("app-data");
    let directories = crate::skills::create_guarded_directories(&directory)?;
    let path = directory.join("profile-session.lock");
    // Presence is not ownership: never truncate or delete a stale lock file.
    // Windows releases the exclusive handle after normal exit or process crash.
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .share_mode(0)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(&path)
        .map_err(|error| {
            format!(
                "Test profile is already in use or cannot be exclusively opened: {}: {error}",
                profile.display()
            )
        })?;
    crate::skills::inspect_handle(&file, &path, false)?;
    Ok(TestProfileLease {
        _file: file,
        _directories: directories,
    })
}
#[cfg(not(windows))]
pub fn acquire_test_session_lease(_profile: &Path) -> Result<TestProfileLease, String> {
    Err("Test profile sessions require Windows exclusive file handles.".into())
}

fn ordinary_profile() -> Result<PathBuf, String> {
    let path = PathBuf::from(std::env::var_os("USERPROFILE").ok_or("USERPROFILE is unavailable.")?);
    if !path.is_absolute() {
        return Err("USERPROFILE must be an absolute local path.".into());
    }
    Ok(path)
}

pub fn validate_test_profile(path: &Path, personal: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("SKILLS_DASH_TEST_PROFILE must be an absolute local directory.".into());
    }
    // Reject ancestors as well as descendants of the personal root, including
    // case aliases. Directory guards separately reject links and relative parts.
    let _guards = crate::skills::guard_directories(path)?;
    // Compare resolved names while ancestors are pinned, also covering DOS
    // short-name aliases. Resolution is read-only and never selects a root.
    let resolved =
        fs::canonicalize(path).map_err(|e| format!("Cannot resolve test profile: {e}"))?;
    let resolved_personal = fs::canonicalize(personal).unwrap_or_else(|_| personal.to_owned());
    let normalize = |path: &Path| {
        path.to_string_lossy()
            .replace('/', "\\")
            .trim_start_matches("\\\\?\\")
            .trim_end_matches('\\')
            .to_ascii_lowercase()
    };
    let path_text = normalize(&resolved);
    let personal_text = normalize(&resolved_personal);
    let within = |a: &str, b: &str| {
        a == b || a.starts_with(&format!("{b}\\")) || a.starts_with(&format!("{b}/"))
    };
    if within(&path_text, &personal_text) || within(&personal_text, &path_text) {
        return Err("A test profile must not overlap the personal skills root.".into());
    }
    let marker = crate::skills::guarded_open(&path.join("skills-dash-test-profile.json"), false)?;
    let mut bytes = Vec::new();
    marker
        .take(4097)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 4096 {
        return Err("Test profile marker exceeds 4 KiB.".into());
    }
    let marker: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|e| format!("Invalid test profile marker: {e}"))?;
    if marker.get("version").and_then(|v| v.as_u64()) != Some(1) {
        return Err("Test profile marker must declare version 1.".into());
    }
    Ok(path.to_owned())
}

pub fn test_profile() -> Result<Option<PathBuf>, String> {
    match std::env::var_os("SKILLS_DASH_TEST_PROFILE") {
        None => Ok(None),
        Some(value) => validate_test_profile(
            &PathBuf::from(value),
            &ordinary_profile()?.join(".agents/skills"),
        )
        .map(Some),
    }
}

pub fn skills_root() -> Result<PathBuf, String> {
    Ok(test_profile()?
        .unwrap_or(ordinary_profile()?)
        .join(".agents")
        .join("skills"))
}

pub fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    match test_profile()? {
        Some(path) => Ok(path.join("app-data")),
        None => app.path().app_data_dir().map_err(|e| e.to_string()),
    }
}

pub fn describe(app: &tauri::AppHandle) -> Result<Profile, String> {
    let test_path = test_profile()?;
    Ok(Profile {
        id: test_path
            .as_ref()
            .map(|path| format!("test:{}", path.to_string_lossy()))
            .unwrap_or_else(|| "personal".into()),
        root: skills_root()?.to_string_lossy().into_owned(),
        data_dir: data_dir(app)?.to_string_lossy().into_owned(),
        test: test_path.is_some(),
    })
}

#[tauri::command]
pub fn lifecycle_profile(app: tauri::AppHandle) -> Result<Profile, String> {
    describe(&app)
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    fn fixture() -> PathBuf {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("output")
            .join("native-tests")
            .join(format!(
                "profile-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
        fs::create_dir_all(&path).unwrap();
        path
    }
    #[test]
    fn test_profile_requires_absolute_marker_and_no_personal_overlap() {
        let path = fixture();
        let personal = path.parent().unwrap().join("personal/.agents/skills");
        assert!(validate_test_profile(Path::new("relative"), &personal).is_err());
        assert!(validate_test_profile(&path, &personal).is_err());
        fs::write(
            path.join("skills-dash-test-profile.json"),
            "{\"version\":2}",
        )
        .unwrap();
        assert!(validate_test_profile(&path, &personal)
            .unwrap_err()
            .contains("version 1"));
        fs::write(
            path.join("skills-dash-test-profile.json"),
            "{\"version\":1}",
        )
        .unwrap();
        assert_eq!(validate_test_profile(&path, &personal).unwrap(), path);
        assert!(validate_test_profile(&path, &path.join(".agents/skills"))
            .unwrap_err()
            .contains("overlap"));
        assert!(validate_test_profile(&path.join(".."), &personal).is_err());
    }
    #[test]
    #[cfg(windows)]
    fn linked_test_profile_and_marker_are_rejected() {
        let path = fixture();
        let real = path.join("real");
        fs::create_dir(&real).unwrap();
        fs::write(
            real.join("skills-dash-test-profile.json"),
            "{\"version\":1}",
        )
        .unwrap();
        let alias = path.join("alias");
        let output = std::process::Command::new("cmd.exe")
            .args(["/d", "/c", "mklink", "/J"])
            .arg(&alias)
            .arg(&real)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(validate_test_profile(&alias, &path.join("personal/.agents/skills")).is_err());
        fs::hard_link(
            real.join("skills-dash-test-profile.json"),
            real.join("marker-copy.json"),
        )
        .unwrap();
        assert!(validate_test_profile(&real, &path.join("personal/.agents/skills")).is_err());
    }

    #[test]
    fn same_test_profile_is_exclusive_until_the_session_handle_closes() {
        let path = fixture();
        let lease = acquire_test_session_lease(&path).unwrap();
        assert!(acquire_test_session_lease(&path)
            .unwrap_err()
            .contains("already in use"));
        drop(lease);
        let restarted = acquire_test_session_lease(&path).unwrap();
        drop(restarted);
        assert!(path.join("app-data").join("profile-session.lock").exists());
    }

    #[test]
    fn distinct_test_profiles_can_hold_independent_session_leases() {
        let first = fixture();
        let second = fixture();
        let first_lease = acquire_test_session_lease(&first).unwrap();
        let second_lease = acquire_test_session_lease(&second).unwrap();
        assert!(acquire_test_session_lease(&first).is_err());
        assert!(acquire_test_session_lease(&second).is_err());
        drop(first_lease);
        assert!(acquire_test_session_lease(&first).is_ok());
        assert!(acquire_test_session_lease(&second).is_err());
        drop(second_lease);
    }

    #[test]
    fn stale_session_file_is_preserved_and_does_not_block_restart() {
        let path = fixture();
        let directory = path.join("app-data");
        fs::create_dir(&directory).unwrap();
        let lock_path = directory.join("profile-session.lock");
        fs::write(&lock_path, "stale file from an exited process").unwrap();
        let lease = acquire_test_session_lease(&path).unwrap();
        drop(lease);
        assert_eq!(
            fs::read_to_string(&lock_path).unwrap(),
            "stale file from an exited process"
        );
        assert!(acquire_test_session_lease(&path).is_ok());
    }

    #[test]
    fn hardlinked_session_file_is_rejected_without_modifying_its_bytes() {
        let path = fixture();
        let directory = path.join("app-data");
        fs::create_dir(&directory).unwrap();
        let sentinel = path.join("sentinel");
        fs::write(&sentinel, "preserve").unwrap();
        fs::hard_link(&sentinel, directory.join("profile-session.lock")).unwrap();
        assert!(acquire_test_session_lease(&path).is_err());
        assert_eq!(fs::read_to_string(&sentinel).unwrap(), "preserve");
    }
}
