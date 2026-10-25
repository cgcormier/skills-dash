//! Bounded opaque lifecycle snapshots. TypeScript owns their domain policy.
//! An OS-exclusive lock covers CAS; immutable synced generations survive crashes.
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};

const RAW_LIMIT: usize = 8 * 1024 * 1024;
const ENVELOPE_LIMIT: u64 = 2 * RAW_LIMIT as u64 + 4096;
const JOURNAL_LIMIT: u64 = 128 * 1024 * 1024;
const ENTRY_LIMIT: usize = 4096;
const REPORT_LIMIT: u64 = 256 * 1024;
static GATE: Mutex<()> = Mutex::new(());
static COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Generation {
    version: u8,
    revision: String,
    previous_revision: Option<String>,
    raw: String,
}
#[derive(Debug, Serialize)]
pub struct Report {
    id: String,
    raw: String,
}
#[derive(Debug, Serialize)]
pub struct LifecycleRead {
    raw: Option<String>,
    revision: Option<String>,
    reports: Vec<Report>,
    profile: crate::profile::Profile,
    diagnostics: Vec<String>,
}
#[derive(Debug, Serialize)]
pub struct LifecycleWritten {
    revision: String,
}
struct Snapshot {
    raw: Option<String>,
    revision: Option<String>,
    next: u64,
    bytes: u64,
    diagnostics: Vec<String>,
}

fn bounded_read(path: &Path, limit: u64) -> Result<String, String> {
    let file = crate::skills::guarded_open(path, false)?;
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit {
        return Err(format!(
            "{} exceeds its bounded read limit; left untouched.",
            path.display()
        ));
    }
    String::from_utf8(bytes)
        .map_err(|_| format!("{} is not UTF-8; left untouched.", path.display()))
}

#[cfg(windows)]
fn exclusive_lock(path: &Path) -> Result<File, String> {
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT;
    // No truncation and no deletion. Windows releases this lock on process exit.
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .share_mode(0)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|e| format!("Lifecycle store is busy or cannot be locked: {e}"))?;
    crate::skills::inspect_handle(&lock, path, false)?;
    Ok(lock)
}
#[cfg(not(windows))]
fn exclusive_lock(_path: &Path) -> Result<File, String> {
    Err("Lifecycle storage requires Windows handle guards.".into())
}

fn entries(directory: &Path) -> Result<Vec<fs::DirEntry>, String> {
    let mut result = Vec::new();
    for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
        if result.len() == ENTRY_LIMIT {
            return Err("Lifecycle directory exceeds 4096 entries; left untouched.".into());
        }
        result.push(entry.map_err(|e| e.to_string())?);
    }
    result.sort_by_key(|entry| entry.file_name());
    Ok(result)
}
fn revision(index: u64) -> String {
    format!("g{index:020}")
}
fn generation_index(name: &str) -> Option<u64> {
    let digits = name.strip_prefix('g')?.strip_suffix(".json")?;
    if digits.len() != 20 || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    digits.parse().ok()
}

fn snapshot(directory: &Path) -> Result<Snapshot, String> {
    let mut result = Snapshot {
        raw: None,
        revision: None,
        next: 1,
        bytes: 0,
        diagnostics: vec![],
    };
    for entry in entries(directory)? {
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| "Non-UTF-8 lifecycle filename; left untouched.")?;
        if name == "store.lock" {
            continue;
        }
        if name.ends_with(".partial") {
            result.diagnostics.push(format!(
                "Interrupted lifecycle write retained: {}",
                entry.path().display()
            ));
            continue;
        }
        let index = generation_index(&name).ok_or_else(|| {
            format!("Unrecognized lifecycle entry {name}; no state was replaced.")
        })?;
        if index != result.next {
            return Err(format!(
                "Lifecycle generation gap at {}; no state was replaced.",
                revision(result.next)
            ));
        }
        let text = bounded_read(&entry.path(), ENVELOPE_LIMIT)?;
        result.bytes = result
            .bytes
            .checked_add(text.len() as u64)
            .ok_or("Lifecycle journal size overflow.")?;
        if result.bytes > JOURNAL_LIMIT {
            return Err("Lifecycle journal exceeds 128 MiB; left untouched.".into());
        }
        let generation: Generation = serde_json::from_str(&text)
            .map_err(|e| format!("Corrupt lifecycle generation {name}: {e}; left untouched."))?;
        if generation.version != 1
            || generation.revision != revision(index)
            || generation.previous_revision != result.revision
            || generation.raw.len() > RAW_LIMIT
        {
            return Err(format!(
                "Invalid lifecycle generation {name}; left untouched."
            ));
        }
        serde_json::from_str::<serde_json::Value>(&generation.raw)
            .map_err(|e| format!("Corrupt lifecycle JSON in {name}: {e}; left untouched."))?;
        result.raw = Some(generation.raw);
        result.revision = Some(generation.revision);
        result.next = index
            .checked_add(1)
            .ok_or("Lifecycle generation exhausted.")?;
    }
    Ok(result)
}

fn inbox(data: &Path, diagnostics: &mut Vec<String>) -> Result<Vec<Report>, String> {
    let directory = data.join("lifecycle-inbox");
    match fs::symlink_metadata(&directory) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(format!("Cannot inspect lifecycle inbox: {e}")),
        Ok(_) => (),
    }
    let _guards = crate::skills::guard_directories(&directory)?;
    let mut result = Vec::new();
    let mut bytes = 0;
    for entry in entries(&directory)? {
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| "Invalid lifecycle inbox filename.")?;
        if !name.ends_with(".json") {
            diagnostics.push(format!("Unpublished inbox entry retained: {name}"));
            continue;
        }
        if name.len() > 160
            || !name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte))
        {
            diagnostics.push(format!("Invalid lifecycle inbox name retained: {name}"));
            continue;
        }
        match bounded_read(&entry.path(), REPORT_LIMIT) {
            Ok(raw) => {
                bytes += raw.len();
                if bytes > RAW_LIMIT {
                    return Err(
                        "Lifecycle inbox exceeds 8 MiB; reports were left untouched.".into(),
                    );
                }
                result.push(Report { id: name, raw });
            }
            Err(error) => diagnostics.push(error),
        }
    }
    Ok(result)
}

fn with_store<T>(
    data: &Path,
    action: impl FnOnce(&Path) -> Result<T, String>,
) -> Result<T, String> {
    let _gate = GATE
        .lock()
        .map_err(|_| "Lifecycle writer is unavailable after an internal failure.")?;
    let directory = data.join("lifecycle-v1");
    let _guards = crate::skills::create_guarded_directories(&directory)?;
    let _lock = exclusive_lock(&directory.join("store.lock"))?;
    action(&directory)
}

#[cfg(windows)]
fn new_stage(path: &Path) -> Result<File, String> {
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Storage::FileSystem::*;
    let stage = OpenOptions::new()
        .read(true)
        .write(true)
        .access_mode(FILE_GENERIC_READ | FILE_GENERIC_WRITE | DELETE)
        .share_mode(FILE_SHARE_READ)
        .create_new(true)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|e| format!("Cannot create lifecycle stage: {e}"))?;
    crate::skills::inspect_handle(&stage, path, false)?;
    Ok(stage)
}
#[cfg(not(windows))]
fn new_stage(_path: &Path) -> Result<File, String> {
    Err("Lifecycle publication requires Windows.".into())
}

fn write_at(data: &Path, expected: Option<&str>, raw: &str) -> Result<LifecycleWritten, String> {
    if raw.len() > RAW_LIMIT {
        return Err("Lifecycle state exceeds 8 MiB; left untouched.".into());
    }
    serde_json::from_str::<serde_json::Value>(raw)
        .map_err(|e| format!("Lifecycle state must be valid JSON: {e}"))?;
    with_store(data, |directory| {
        let current = snapshot(directory)?;
        if entries(directory)?.len() >= ENTRY_LIMIT {
            return Err(
                "Lifecycle journal has reached its 4096-entry limit; left untouched.".into(),
            );
        }
        if current.revision.as_deref() != expected {
            return Err("Lifecycle conflict: stored revision changed; reload and reconcile before retrying.".into());
        }
        let next = revision(current.next);
        let envelope = serde_json::to_vec(&Generation {
            version: 1,
            revision: next.clone(),
            previous_revision: current.revision,
            raw: raw.into(),
        })
        .map_err(|e| e.to_string())?;
        if current.bytes + envelope.len() as u64 > JOURNAL_LIMIT {
            return Err("Lifecycle journal would exceed 128 MiB; left untouched.".into());
        }
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        let path = directory.join(format!(
            "{next}-{}-{nonce}-{}.partial",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let mut stage = new_stage(&path)?;
        stage
            .write_all(&envelope)
            .and_then(|_| stage.sync_all())
            .map_err(|e| {
                format!(
                    "Lifecycle stage could not be synced; retained at {}: {e}",
                    path.display()
                )
            })?;
        let destination = directory.join(format!("{next}.json"));
        crate::skills::rename_no_replace(&stage, &destination)?;
        stage.sync_all().map_err(|e| {
            format!(
                "Lifecycle publication may have completed at {}; reload to reconcile: {e}",
                destination.display()
            )
        })?;
        Ok(LifecycleWritten { revision: next })
    })
}

#[tauri::command]
pub async fn lifecycle_read(app: tauri::AppHandle) -> Result<LifecycleRead, String> {
    let profile = crate::profile::describe(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        with_store(Path::new(&profile.data_dir), |directory| {
            let mut current = snapshot(directory)?;
            let reports = inbox(Path::new(&profile.data_dir), &mut current.diagnostics)?;
            Ok(LifecycleRead {
                raw: current.raw,
                revision: current.revision,
                reports,
                profile: profile.clone(),
                diagnostics: current.diagnostics,
            })
        })
    })
    .await
    .map_err(|e| format!("Lifecycle read worker failed: {e}"))?
}
#[tauri::command]
pub async fn lifecycle_write(
    app: tauri::AppHandle,
    expected_revision: Option<String>,
    raw: String,
) -> Result<LifecycleWritten, String> {
    let data = crate::profile::data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        write_at(&data, expected_revision.as_deref(), &raw)
    })
    .await
    .map_err(|e| format!("Lifecycle write worker failed: {e}"))?
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::path::PathBuf;
    fn fixture() -> PathBuf {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("output/native-tests")
            .join(format!(
                "lifecycle-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
        fs::create_dir_all(&path).unwrap();
        path
    }
    #[test]
    fn opaque_cas_preserves_generations_and_stale_writes() {
        let path = fixture();
        let first = write_at(&path, None, "{\"unknown\":1}").unwrap();
        assert!(write_at(&path, None, "{}")
            .unwrap_err()
            .contains("conflict"));
        let second = write_at(&path, Some(&first.revision), "{\"unknown\":2}").unwrap();
        let read = with_store(&path, snapshot).unwrap();
        assert_eq!(read.raw.as_deref(), Some("{\"unknown\":2}"));
        assert_eq!(read.revision.as_deref(), Some(second.revision.as_str()));
        assert!(path
            .join("lifecycle-v1")
            .join(format!("{}.json", first.revision))
            .exists());
    }
    #[test]
    fn interrupted_stage_is_retained_but_corrupt_publication_blocks_writes() {
        let path = fixture();
        let first = write_at(&path, None, "{}").unwrap();
        let directory = path.join("lifecycle-v1");
        fs::write(directory.join("interrupted.partial"), b"broken").unwrap();
        let read = with_store(&path, snapshot).unwrap();
        assert_eq!(read.diagnostics.len(), 1);
        assert_eq!(read.raw.as_deref(), Some("{}"));
        let second = write_at(&path, Some(&first.revision), "[]").unwrap();
        fs::write(
            directory.join(format!("{}.json", second.revision)),
            "broken",
        )
        .unwrap();
        assert!(write_at(&path, Some(&second.revision), "{}")
            .unwrap_err()
            .contains("Corrupt"));
        assert_eq!(
            fs::read_to_string(directory.join(format!("{}.json", second.revision))).unwrap(),
            "broken"
        );
    }
    #[test]
    fn journal_gap_and_invalid_json_fail_without_replacement() {
        let path = fixture();
        assert!(write_at(&path, None, "broken").is_err());
        let first = write_at(&path, None, "{}").unwrap();
        let directory = path.join("lifecycle-v1");
        fs::rename(
            directory.join(format!("{}.json", first.revision)),
            directory.join("g00000000000000000003.json"),
        )
        .unwrap();
        assert!(with_store(&path, snapshot).err().unwrap().contains("gap"));
    }
    #[test]
    fn inbox_is_bounded_and_never_consumed_or_modified() {
        let path = fixture();
        let directory = path.join("lifecycle-inbox");
        fs::create_dir(&directory).unwrap();
        fs::write(directory.join("report-1.json"), "{not json}").unwrap();
        fs::write(directory.join("report-2.partial"), "pending").unwrap();
        fs::write(
            directory.join("report-3.json"),
            vec![b'x'; REPORT_LIMIT as usize + 1],
        )
        .unwrap();
        let mut diagnostics = vec![];
        let reports = inbox(&path, &mut diagnostics).unwrap();
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].raw, "{not json}");
        assert_eq!(diagnostics.len(), 2);
        assert_eq!(
            fs::read_to_string(directory.join("report-1.json")).unwrap(),
            "{not json}"
        );
    }
    #[test]
    fn os_lock_refuses_a_second_writer_and_recovers_on_close() {
        let path = fixture();
        let lock_path = path.join("store.lock");
        let first = exclusive_lock(&lock_path).unwrap();
        assert!(exclusive_lock(&lock_path).is_err());
        drop(first);
        assert!(exclusive_lock(&lock_path).is_ok());
    }

    #[test]
    fn concurrent_cas_has_exactly_one_winner() {
        let path = fixture();
        let first = write_at(&path, None, "{}").unwrap();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(3));
        let workers: Vec<_> = (0..2)
            .map(|index| {
                let path = path.clone();
                let revision = first.revision.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    write_at(&path, Some(&revision), &format!("{{\"writer\":{index}}}"))
                })
            })
            .collect();
        barrier.wait();
        let results: Vec<_> = workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .collect();
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert!(results
            .iter()
            .filter_map(|result| result.as_ref().err())
            .all(|error| error.contains("conflict")));
    }

    #[test]
    fn hardlinked_store_lock_and_generation_fail_without_touching_bytes() {
        let path = fixture();
        let directory = path.join("lifecycle-v1");
        fs::create_dir(&directory).unwrap();
        let sentinel = path.join("sentinel");
        fs::write(&sentinel, "preserve").unwrap();
        fs::hard_link(&sentinel, directory.join("store.lock")).unwrap();
        assert!(write_at(&path, None, "{}").is_err());
        assert_eq!(fs::read_to_string(&sentinel).unwrap(), "preserve");
        let path = fixture();
        let first = write_at(&path, None, "{}").unwrap();
        let generation = path
            .join("lifecycle-v1")
            .join(format!("{}.json", first.revision));
        fs::hard_link(&generation, path.join("copy.json")).unwrap();
        assert!(with_store(&path, snapshot).is_err());
    }
}
