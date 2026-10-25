//! Fixed-root personal skill I/O. Markdown is opaque UTF-8, never instructions.
use serde::Serialize;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

const CONTENT_LIMIT: u64 = 1024 * 1024;
const ENTRY_LIMIT: usize = 4096;
const SUPPORT_LIMIT: usize = 2048;
const DEPTH_LIMIT: usize = 8;
const RECOVERY_LIMIT: usize = 20;
static TRANSACTION_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillEntry {
    folder: String,
    path: String,
    modified_ms: Option<u64>,
    size: Option<u64>,
    problem: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Discovery {
    root: String,
    save_policy: &'static str,
    entries: Vec<SkillEntry>,
    diagnostics: Vec<String>,
}
#[derive(Debug, Serialize)]
pub struct SupportingFile {
    path: String,
    kind: &'static str,
    size: Option<u64>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFile {
    folder: String,
    path: String,
    modified_ms: Option<u64>,
    content: String,
    supporting_files: Vec<SupportingFile>,
    diagnostics: Vec<String>,
    recovery_path: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryEntry {
    id: String,
    folder: String,
    previous_path: Option<String>,
    draft_path: Option<String>,
    created_ms: Option<u64>,
    diagnostics: Vec<String>,
}

fn personal_root() -> Result<PathBuf, String> {
    crate::profile::skills_root()
}
fn folder_name(folder: &str) -> Result<(), String> {
    let mut components = Path::new(folder).components();
    let normal =
        matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none();
    let reserved = folder.split('.').next().unwrap_or("").to_ascii_uppercase();
    if !normal
        || folder.is_empty()
        || folder.ends_with(['.', ' '])
        || folder.chars().any(|c| c < ' ' || "\\/:*?\"<>|".contains(c))
        || matches!(reserved.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (reserved.len() == 4
            && (reserved.starts_with("COM") || reserved.starts_with("LPT"))
            && reserved.as_bytes()[3].is_ascii_digit())
    {
        return Err("Skill folder must be one ordinary immediate-child folder name.".into());
    }
    Ok(())
}
fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
fn modified(metadata: &fs::Metadata) -> Option<u64> {
    metadata
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis()
        .try_into()
        .ok()
}

#[cfg(windows)]
pub(crate) fn guarded_open(path: &Path, directory: bool) -> Result<File, String> {
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Storage::FileSystem::*;
    let file = OpenOptions::new()
        .access_mode(if directory {
            FILE_READ_ATTRIBUTES
        } else {
            FILE_GENERIC_READ
        })
        .share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS)
        .open(path)
        .map_err(|e| format!("Cannot safely open {}: {e}", display(path)))?;
    inspect_handle(&file, path, directory)?;
    Ok(file)
}
#[cfg(windows)]
pub(crate) fn inspect_handle(file: &File, path: &Path, directory: bool) -> Result<(), String> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::*;
    let mut info = BY_HANDLE_FILE_INFORMATION::default();
    if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0 {
        return Err(format!(
            "Cannot inspect {}: {}",
            display(path),
            std::io::Error::last_os_error()
        ));
    }
    if info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(format!("Blocked reparse point: {}", display(path)));
    }
    if (info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY != 0) != directory {
        return Err(format!("Unexpected file type: {}", display(path)));
    }
    if !directory && info.nNumberOfLinks != 1 {
        return Err(format!("Blocked hardlinked file: {}", display(path)));
    }
    Ok(())
}
#[cfg(not(windows))]
pub(crate) fn guarded_open(_path: &Path, _directory: bool) -> Result<File, String> {
    Err(
        "Personal skill filesystem access currently requires Windows directory-handle guards."
            .into(),
    )
}

// Hold every ancestor open without write/delete sharing. No canonicalize-and-then-
// open gap, no junction traversal, and no directory reparse mutation during I/O.
pub(crate) fn guard_directories(path: &Path) -> Result<Vec<File>, String> {
    directory_guards(path, DirectoryMode::Existing)?.ok_or("Required directory is missing.".into())
}
pub(crate) fn create_guarded_directories(path: &Path) -> Result<Vec<File>, String> {
    directory_guards(path, DirectoryMode::Create)?.ok_or("Required directory is missing.".into())
}
#[derive(Clone, Copy)]
enum DirectoryMode {
    Existing,
    Create,
    Optional,
}
fn directory_guards(path: &Path, mode: DirectoryMode) -> Result<Option<Vec<File>>, String> {
    if !path.is_absolute() {
        return Err("Skill root must be absolute.".into());
    }
    let mut current = PathBuf::new();
    let mut guards = Vec::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => {
                #[cfg(windows)]
                if !matches!(prefix.kind(), std::path::Prefix::Disk(_)) {
                    return Err("Only a local drive skill root is supported.".into());
                }
                current.push(prefix.as_os_str());
            }
            Component::RootDir => {
                current.push(component.as_os_str());
                guards.push(guarded_open(&current, true)?);
            }
            Component::Normal(name) => {
                current.push(name);
                match mode {
                    DirectoryMode::Create => match fs::create_dir(&current) {
                        Ok(()) => (),
                        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
                        Err(e) => {
                            return Err(format!(
                                "Cannot create recovery directory {}: {e}",
                                display(&current)
                            ))
                        }
                    },
                    DirectoryMode::Optional => match fs::symlink_metadata(&current) {
                        Ok(_) => (),
                        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
                        Err(e) => {
                            return Err(format!(
                                "Cannot inspect recovery directory {}: {e}",
                                display(&current)
                            ))
                        }
                    },
                    DirectoryMode::Existing => (),
                }
                guards.push(guarded_open(&current, true)?);
            }
            _ => return Err("Skill paths cannot contain relative components.".into()),
        }
    }
    Ok(Some(guards))
}
fn raw(file: &File) -> Result<String, String> {
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if metadata.len() > CONTENT_LIMIT {
        return Err("SKILL.md exceeds the 1 MiB read/edit limit.".into());
    }
    let mut bytes = Vec::new();
    file.take(CONTENT_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > CONTENT_LIMIT {
        return Err("SKILL.md exceeds the 1 MiB read/edit limit.".into());
    }
    String::from_utf8(bytes)
        .map_err(|_| "SKILL.md is not valid UTF-8; its bytes were left untouched.".into())
}
fn discover_at(root: &Path) -> Discovery {
    let mut result = Discovery {
        root: display(root),
        save_policy: if cfg!(windows) {
            "recoverable-publish"
        } else {
            "read-only"
        },
        entries: vec![],
        diagnostics: vec![],
    };
    let _guards = match guard_directories(root) {
        Ok(guards) => guards,
        Err(e) => {
            result.diagnostics.push(e);
            return result;
        }
    };
    let listing = match fs::read_dir(root) {
        Ok(listing) => listing,
        Err(e) => {
            result.diagnostics.push(e.to_string());
            return result;
        }
    };
    for (index, entry) in listing.enumerate() {
        if index >= ENTRY_LIMIT {
            result.diagnostics.push(format!(
                "Discovery stopped at {ENTRY_LIMIT} directory entries."
            ));
            break;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(e) => {
                result.diagnostics.push(e.to_string());
                continue;
            }
        };
        let metadata = match fs::symlink_metadata(entry.path()) {
            Ok(metadata) => metadata,
            Err(e) => {
                result.diagnostics.push(e.to_string());
                continue;
            }
        };
        // Include directory links as blocked entries without entering them.
        #[cfg(windows)]
        let directory = {
            use std::os::windows::fs::MetadataExt;
            metadata.file_attributes()
                & windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_DIRECTORY
                != 0
        };
        #[cfg(not(windows))]
        let directory = metadata.is_dir() || metadata.file_type().is_symlink();
        if !directory {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().into_owned();
        let path = entry.path().join("SKILL.md");
        let mut item = SkillEntry {
            folder: folder.clone(),
            path: display(&path),
            modified_ms: None,
            size: None,
            problem: None,
        };
        let inspect = || -> Result<(Option<u64>, u64), String> {
            folder_name(&folder)?;
            if entry.file_name().to_str().is_none() {
                return Err("Folder name is not representable as UTF-8.".into());
            }
            let _child = guarded_open(&entry.path(), true)?;
            let file = guarded_open(&path, false)?;
            let metadata = file.metadata().map_err(|e| e.to_string())?;
            // Validate readability/encoding while bounded; do not parse metadata.
            raw(&file)?;
            Ok((modified(&metadata), metadata.len()))
        };
        match inspect() {
            Ok((time, size)) => {
                item.modified_ms = time;
                item.size = Some(size);
            }
            Err(e) => item.problem = Some(e),
        }
        result.entries.push(item);
    }
    result.entries.sort_by(|a, b| {
        a.folder
            .to_lowercase()
            .cmp(&b.folder.to_lowercase())
            .then(a.folder.cmp(&b.folder))
    });
    result
}

fn supporting(
    directory: &Path,
    relative: &Path,
    depth: usize,
    files: &mut Vec<SupportingFile>,
    diagnostics: &mut Vec<String>,
    visited: &mut usize,
) {
    let listing = match fs::read_dir(directory) {
        Ok(listing) => listing,
        Err(e) => {
            diagnostics.push(format!("Supporting files: {e}"));
            return;
        }
    };
    for entry in listing {
        if *visited >= SUPPORT_LIMIT {
            diagnostics.push(format!(
                "Supporting inventory stopped at {SUPPORT_LIMIT} entries."
            ));
            return;
        }
        *visited += 1;
        let entry = match entry {
            Ok(entry) => entry,
            Err(e) => {
                diagnostics.push(e.to_string());
                continue;
            }
        };
        let name = entry.file_name();
        if relative.as_os_str().is_empty()
            && name.to_string_lossy().eq_ignore_ascii_case("SKILL.md")
        {
            continue;
        }
        let rel = relative.join(&name);
        let path = rel.to_string_lossy().replace('\\', "/");
        let metadata = match fs::symlink_metadata(entry.path()) {
            Ok(metadata) => metadata,
            Err(e) => {
                diagnostics.push(e.to_string());
                continue;
            }
        };
        #[cfg(windows)]
        let directory_type = {
            use std::os::windows::fs::MetadataExt;
            metadata.file_attributes()
                & windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_DIRECTORY
                != 0
        };
        #[cfg(not(windows))]
        let directory_type = metadata.is_dir();
        match guarded_open(&entry.path(), directory_type) {
            Err(e) => {
                files.push(SupportingFile {
                    path,
                    kind: "blocked",
                    size: None,
                });
                diagnostics.push(e);
            }
            Ok(_guard) => {
                files.push(SupportingFile {
                    path,
                    kind: if directory_type { "directory" } else { "file" },
                    size: if directory_type {
                        None
                    } else {
                        Some(metadata.len())
                    },
                });
                if directory_type {
                    if depth < DEPTH_LIMIT {
                        supporting(&entry.path(), &rel, depth + 1, files, diagnostics, visited);
                    } else {
                        diagnostics.push(format!(
                            "Supporting depth limit reached at {}.",
                            display(&rel)
                        ));
                    }
                }
            }
        }
    }
}
fn read_at(root: &Path, folder: &str) -> Result<SkillFile, String> {
    folder_name(folder)?;
    let _guards = guard_directories(root)?;
    let child = root.join(folder);
    let _child = guarded_open(&child, true)?;
    let path = child.join("SKILL.md");
    let file = guarded_open(&path, false)?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    let content = raw(&file)?;
    let mut result = SkillFile {
        folder: folder.into(),
        path: display(&path),
        modified_ms: modified(&metadata),
        content,
        supporting_files: vec![],
        diagnostics: vec![],
        recovery_path: None,
    };
    supporting(
        &child,
        Path::new(""),
        0,
        &mut result.supporting_files,
        &mut result.diagnostics,
        &mut 0,
    );
    result.supporting_files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(result)
}

#[tauri::command]
pub fn discover_skills() -> Result<Discovery, String> {
    Ok(discover_at(&personal_root()?))
}
#[tauri::command]
pub fn read_skill(folder: String) -> Result<SkillFile, String> {
    read_at(&personal_root()?, &folder)
}

fn recovery_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(crate::profile::data_dir(app)?.join("skill-recovery"))
}
fn transaction_id() -> Result<String, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    Ok(format!(
        "{nanos:032x}-{:08x}-{:016x}",
        std::process::id(),
        TRANSACTION_COUNTER.fetch_add(1, Ordering::Relaxed)
    ))
}
fn validate_transaction_id(id: &str) -> Result<(), String> {
    if id.len() != 58
        || id.as_bytes()[32] != b'-'
        || id.as_bytes()[41] != b'-'
        || !id
            .bytes()
            .enumerate()
            .all(|(i, b)| i == 32 || i == 41 || b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err("Recovery ID must be an exact generated transaction ID.".into());
    }
    Ok(())
}
#[cfg(windows)]
fn original_for_save(path: &Path) -> Result<File, String> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    use windows_sys::Win32::Storage::FileSystem::*;
    let file = OpenOptions::new()
        .access_mode(FILE_GENERIC_READ | DELETE)
        .share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS)
        .open(path)
        .map_err(|e| format!("Cannot exclusively guard {} for saving: {e}", display(path)))?;
    inspect_handle(&file, path, false)?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    source_attributes(metadata.file_attributes())?;
    if metadata.permissions().readonly() {
        return Err("SKILL.md is read-only; its protection was left unchanged.".into());
    }
    Ok(file)
}
#[cfg(windows)]
fn source_attributes(attributes: u32) -> Result<(), String> {
    if attributes & windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_ENCRYPTED != 0 {
        return Err("EFS-encrypted SKILL.md cannot be published: encryption preservation is unsupported, and no plaintext recovery copy was created.".into());
    }
    Ok(())
}
#[cfg(not(windows))]
fn original_for_save(_path: &Path) -> Result<File, String> {
    Err("Recoverable publishing requires Windows handle-based rename support.".into())
}

#[cfg(windows)]
struct SourceSecurity {
    descriptor: windows_sys::Win32::Security::PSECURITY_DESCRIPTOR,
    dacl: *mut windows_sys::Win32::Security::ACL,
    was_protected: bool,
}
#[cfg(windows)]
impl Drop for SourceSecurity {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::LocalFree(self.descriptor);
        }
    }
}
#[cfg(windows)]
impl SourceSecurity {
    fn from_file(file: &File) -> Result<Self, String> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Security::{Authorization::*, *};
        let mut descriptor = std::ptr::null_mut();
        let mut dacl = std::ptr::null_mut();
        let status = unsafe {
            GetSecurityInfo(
                file.as_raw_handle(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut dacl,
                std::ptr::null_mut(),
                &mut descriptor,
            )
        };
        if status != 0 {
            return Err(format!(
                "Cannot capture source DACL: {}",
                std::io::Error::from_raw_os_error(status as i32)
            ));
        }
        let mut result = Self {
            descriptor,
            dacl,
            was_protected: false,
        };
        let mut control = 0;
        let mut revision = 0;
        if unsafe { GetSecurityDescriptorControl(result.descriptor, &mut control, &mut revision) }
            == 0
        {
            return Err(format!(
                "Cannot inspect source DACL control: {}",
                std::io::Error::last_os_error()
            ));
        }
        result.was_protected = control & SE_DACL_PROTECTED != 0;
        if !dacl.is_null() && unsafe { IsValidAcl(dacl) } == 0 {
            return Err("Source DACL is invalid; save refused.".into());
        }
        // Freeze the exact source ACEs before creation. Recovery-parent inheritance
        // must not broaden access even briefly while the new bytes are written.
        if unsafe {
            SetSecurityDescriptorControl(result.descriptor, SE_DACL_PROTECTED, SE_DACL_PROTECTED)
        } == 0
        {
            return Err(format!(
                "Cannot protect copied source DACL: {}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(result)
    }
    fn acl_bytes(&self) -> Option<&[u8]> {
        if self.dacl.is_null() {
            None
        } else {
            // GetSecurityInfo owns this valid ACL until LocalFree in Drop.
            Some(unsafe {
                std::slice::from_raw_parts(self.dacl.cast::<u8>(), (*self.dacl).AclSize as usize)
            })
        }
    }
    fn verify(&self, file: &File) -> Result<(), String> {
        let actual = Self::from_file(file)?;
        if !actual.was_protected || actual.acl_bytes() != self.acl_bytes() {
            return Err(
                "Copied file DACL differs from the protected source DACL; save refused.".into(),
            );
        }
        Ok(())
    }
}
#[cfg(not(windows))]
struct SourceSecurity;
#[cfg(not(windows))]
impl SourceSecurity {
    fn from_file(_file: &File) -> Result<Self, String> {
        Err("Windows DACL preservation is unavailable.".into())
    }
}

#[cfg(windows)]
fn controlled_file(path: &Path, bytes: &[u8], security: &SourceSecurity) -> Result<File, String> {
    use std::os::windows::{ffi::OsStrExt, io::FromRawHandle};
    use windows_sys::Win32::Storage::FileSystem::*;
    use windows_sys::Win32::{Foundation::INVALID_HANDLE_VALUE, Security::SECURITY_ATTRIBUTES};
    let mut name: Vec<u16> = path.as_os_str().encode_wide().collect();
    if name.contains(&0) {
        return Err("Recovery path contains a NUL character.".into());
    }
    name.push(0);
    let attributes = SECURITY_ATTRIBUTES {
        nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: security.descriptor,
        bInheritHandle: 0,
    };
    let handle = unsafe {
        CreateFileW(
            name.as_ptr(),
            FILE_GENERIC_READ | FILE_GENERIC_WRITE | DELETE,
            FILE_SHARE_READ,
            &attributes,
            CREATE_NEW,
            FILE_FLAG_OPEN_REPARSE_POINT | FILE_ATTRIBUTE_NORMAL,
            std::ptr::null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return Err(format!(
            "Cannot create recovery file {}: {}",
            display(path),
            std::io::Error::last_os_error()
        ));
    }
    let mut file = unsafe { File::from_raw_handle(handle) };
    inspect_handle(&file, path, false)?;
    security.verify(&file)?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| format!("Cannot sync recovery file {}: {e}", display(path)))?;
    Ok(file)
}
#[cfg(not(windows))]
fn controlled_file(
    _path: &Path,
    _bytes: &[u8],
    _security: &SourceSecurity,
) -> Result<File, String> {
    Err("Recoverable publishing requires Windows.".into())
}

#[cfg(windows)]
fn require_same_volume(source: &File, destination_directory: &File) -> Result<(), String> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::*;
    let mut source_info = BY_HANDLE_FILE_INFORMATION::default();
    let mut destination_info = BY_HANDLE_FILE_INFORMATION::default();
    if unsafe { GetFileInformationByHandle(source.as_raw_handle(), &mut source_info) } == 0
        || unsafe {
            GetFileInformationByHandle(destination_directory.as_raw_handle(), &mut destination_info)
        } == 0
    {
        return Err(format!(
            "Cannot verify recovery volume: {}",
            std::io::Error::last_os_error()
        ));
    }
    if source_info.dwVolumeSerialNumber != destination_info.dwVolumeSerialNumber {
        return Err(
            "Source and recovery must reside on the same volume; original was not moved.".into(),
        );
    }
    Ok(())
}
#[cfg(not(windows))]
fn require_same_volume(_source: &File, _destination_directory: &File) -> Result<(), String> {
    Err("Windows volume verification is unavailable.".into())
}

// Rename THIS already validated, locked file. Never reopen its old pathname and
// never replace the destination. Parent directory handles remain pinned by caller.
#[cfg(windows)]
pub(crate) fn rename_no_replace(file: &File, destination: &Path) -> Result<(), String> {
    use std::os::windows::{ffi::OsStrExt, io::AsRawHandle};
    use windows_sys::Win32::Storage::FileSystem::{
        FileRenameInfo, SetFileInformationByHandle, FILE_RENAME_INFO,
    };
    let name: Vec<u16> = destination.as_os_str().encode_wide().collect();
    let byte_count = name
        .len()
        .checked_mul(2)
        .ok_or("Recovery pathname is too long.")?;
    let offset = std::mem::offset_of!(FILE_RENAME_INFO, FileName);
    let size = std::mem::size_of::<FILE_RENAME_INFO>()
        .checked_add(byte_count)
        .ok_or("Recovery pathname is too long.")?;
    let mut storage = vec![0u64; size.div_ceil(std::mem::size_of::<u64>())];
    let info = storage.as_mut_ptr().cast::<FILE_RENAME_INFO>();
    // u64-backed storage supplies FILE_RENAME_INFO alignment on Windows x86/x64.
    // It includes the variable-length UTF-16 tail, excluding any NUL terminator.
    unsafe {
        (*info).Anonymous.ReplaceIfExists = false;
        (*info).RootDirectory = std::ptr::null_mut();
        (*info).FileNameLength = byte_count
            .try_into()
            .map_err(|_| "Recovery pathname is too long.")?;
        std::ptr::copy_nonoverlapping(
            name.as_ptr(),
            storage.as_mut_ptr().cast::<u8>().add(offset).cast::<u16>(),
            name.len(),
        );
        if SetFileInformationByHandle(
            file.as_raw_handle(),
            FileRenameInfo,
            info.cast(),
            size.try_into()
                .map_err(|_| "Recovery pathname is too long.")?,
        ) == 0
        {
            return Err(format!(
                "No-replace rename to {} failed: {}",
                display(destination),
                std::io::Error::last_os_error()
            ));
        }
    }
    Ok(())
}
#[cfg(not(windows))]
pub(crate) fn rename_no_replace(_file: &File, _destination: &Path) -> Result<(), String> {
    Err("Recoverable publishing requires Windows.".into())
}

fn save_at(
    root: &Path,
    recovery: &Path,
    folder: &str,
    expected: &str,
    content: &str,
) -> Result<SkillFile, String> {
    save_with_gap_hook(root, recovery, folder, expected, content, |_| Ok(()))
}
fn save_with_gap_hook(
    root: &Path,
    recovery: &Path,
    folder: &str,
    expected: &str,
    content: &str,
    after_move: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<SkillFile, String> {
    folder_name(folder)?;
    if content.len() as u64 > CONTENT_LIMIT || expected.len() as u64 > CONTENT_LIMIT {
        return Err("SKILL.md exceeds the 1 MiB read/edit limit.".into());
    }
    let _root_guards = guard_directories(root)?;
    let child = root.join(folder);
    let _child = guarded_open(&child, true)?;
    let path = child.join("SKILL.md");
    let original = original_for_save(&path)?;
    if raw(&original)? != expected {
        return Err("SKILL.md changed outside this app. Reload it before saving; your draft has not been written.".into());
    }
    let source_security = SourceSecurity::from_file(&original)?;
    let root_text = display(root).replace('/', "\\").to_lowercase();
    let recovery_text = display(recovery).replace('/', "\\").to_lowercase();
    if recovery_text == root_text || recovery_text.starts_with(&(root_text + "\\")) {
        return Err("Recovery storage must be outside the personal skill root.".into());
    }
    let _recovery_guards = directory_guards(&recovery.join(folder), DirectoryMode::Create)?;
    let id = transaction_id()?;
    let transaction = recovery.join(folder).join(&id);
    fs::create_dir(&transaction).map_err(|e| {
        format!(
            "Cannot create recovery transaction {}: {e}",
            display(&transaction)
        )
    })?;
    let copy_path = transaction.join("previous-copy.md");
    let previous_path = transaction.join("previous.md");
    let draft_path = transaction.join("draft.md");
    let stage_path = transaction.join("stage.md");
    let action = || -> Result<SkillFile, String> {
        let _transaction_guard = guarded_open(&transaction, true)?;
        require_same_volume(&original, &_transaction_guard)?;
        // Both versions are synced before the first source mutation. Keep every
        // controlled file locked until return; no recoverable artifact is deleted.
        let _previous_copy = controlled_file(&copy_path, expected.as_bytes(), &source_security)?;
        let _draft = controlled_file(&draft_path, content.as_bytes(), &source_security)?;
        let stage = controlled_file(&stage_path, content.as_bytes(), &source_security)?;
        let journal = format!("skill-recovery-v1\nfolder: {folder}\nsource: {}\nprevious-copy: previous-copy.md\nmoved-original: previous.md\ndraft: draft.md\npublish-stage: stage.md\n", display(&path));
        let _prepared = controlled_file(
            &transaction.join("prepared.txt"),
            journal.as_bytes(),
            &source_security,
        )?;
        let mut supporting_files = vec![];
        let mut diagnostics = vec![];
        supporting(
            &child,
            Path::new(""),
            0,
            &mut supporting_files,
            &mut diagnostics,
            &mut 0,
        );
        #[cfg(windows)]
        inspect_handle(&original, &path, false)?;
        rename_no_replace(&original, &previous_path)?;
        let _moved = controlled_file(
            &transaction.join("original-moved.txt"),
            b"Original moved; publication may not yet be complete.\n",
            &source_security,
        )?;
        after_move(&path)?;
        // If another process creates ANY destination during the gap, the kernel
        // refuses this rename. No check-then-replace operation exists here.
        #[cfg(windows)]
        inspect_handle(&stage, &stage_path, false)?;
        rename_no_replace(&stage, &path)?;
        stage
            .sync_all()
            .map_err(|e| format!("Published bytes could not be flushed: {e}"))?;
        let _published = controlled_file(
            &transaction.join("published.txt"),
            b"Publication completed; previous and draft retained.\n",
            &source_security,
        )?;
        let metadata = stage.metadata().map_err(|e| e.to_string())?;
        supporting_files.sort_by(|a, b| a.path.cmp(&b.path));
        diagnostics.push("Saved using recoverable publishing. A brief missing-file interval separates the original move and no-replace publication.".into());
        // The stage handle still excludes external writers/deletes. Return known
        // saved bytes, never a path reread that could clear a draft against a rival.
        Ok(SkillFile {
            folder: folder.into(),
            path: display(&path),
            modified_ms: modified(&metadata),
            content: content.into(),
            supporting_files,
            diagnostics,
            recovery_path: Some(display(&previous_path)),
        })
    };
    action().map_err(|e| format!("Save stopped: {e}\nRecovery transaction: {}\nPrevious snapshot: {}\nMoved original (if present): {}\nDraft (if created): {}\nNo existing destination was overwritten; inspect recovery before manual reconciliation.", display(&transaction), display(&copy_path), display(&previous_path), display(&draft_path)))
}
#[tauri::command]
pub fn save_skill(
    app: tauri::AppHandle,
    folder: String,
    expected_content: String,
    content: String,
) -> Result<SkillFile, String> {
    save_at(
        &personal_root()?,
        &recovery_root(&app)?,
        &folder,
        &expected_content,
        &content,
    )
}

fn existing_recovery_file(directory: &Path, name: &str) -> Result<Option<PathBuf>, String> {
    let path = directory.join(name);
    match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => {
            return Err(format!(
                "Cannot inspect recovery file {}: {e}",
                display(&path)
            ))
        }
        Ok(_) => (),
    }
    let file = guarded_open(&path, false)?;
    if file.metadata().map_err(|e| e.to_string())?.len() > CONTENT_LIMIT {
        return Err(format!("Recovery file exceeds 1 MiB: {}", display(&path)));
    }
    Ok(Some(path))
}
fn previous_recovery(directory: &Path) -> Result<Option<PathBuf>, String> {
    match existing_recovery_file(directory, "previous.md")? {
        Some(path) => Ok(Some(path)),
        None => existing_recovery_file(directory, "previous-copy.md"),
    }
}
fn list_recoveries_at(recovery: &Path, folder: &str) -> Result<Vec<RecoveryEntry>, String> {
    folder_name(folder)?;
    let path = recovery.join(folder);
    let _guards = match directory_guards(&path, DirectoryMode::Optional)? {
        Some(guards) => guards,
        None => return Ok(vec![]),
    };
    let mut result = vec![];
    for (index, item) in fs::read_dir(&path).map_err(|e| e.to_string())?.enumerate() {
        if index >= ENTRY_LIMIT {
            return Err(format!("Recovery inventory exceeds {ENTRY_LIMIT} entries; no incomplete 'latest' list was returned."));
        }
        let item = item.map_err(|e| format!("Cannot enumerate recovery transactions: {e}"))?;
        let id = item
            .file_name()
            .into_string()
            .map_err(|_| "Recovery entry has an unrepresentable name.")?;
        validate_transaction_id(&id)
            .map_err(|e| format!("Unexpected recovery entry {}: {e}", display(&item.path())))?;
        let mut entry = RecoveryEntry {
            id: id.clone(),
            folder: folder.into(),
            previous_path: None,
            draft_path: None,
            created_ms: u128::from_str_radix(&id[..32], 16)
                .ok()
                .and_then(|n| (n / 1_000_000).try_into().ok()),
            diagnostics: vec![],
        };
        match guarded_open(&item.path(), true) {
            Err(e) => entry.diagnostics.push(e),
            Ok(_transaction) => {
                match previous_recovery(&item.path()) {
                    Ok(path) => entry.previous_path = path.map(|p| display(&p)),
                    Err(e) => entry.diagnostics.push(e),
                }
                match existing_recovery_file(&item.path(), "draft.md") {
                    Ok(path) => entry.draft_path = path.map(|p| display(&p)),
                    Err(e) => entry.diagnostics.push(e),
                }
                if entry.previous_path.is_none() {
                    entry
                        .diagnostics
                        .push("Previous recovery bytes are missing or blocked.".into());
                }
                if entry.draft_path.is_none() {
                    entry
                        .diagnostics
                        .push("Draft recovery bytes are missing or blocked.".into());
                }
                let preparation = (|| -> Result<bool, String> {
                    let Some(marker) = existing_recovery_file(&item.path(), "prepared.txt")? else {
                        return Ok(false);
                    };
                    let file = guarded_open(&marker, false)?;
                    let journal = raw(&file)?;
                    Ok(journal.starts_with("skill-recovery-v1\n")
                        && journal.ends_with("publish-stage: stage.md\n"))
                })();
                match preparation {
                    Ok(true) => (),
                    Ok(false) => entry.diagnostics.push("Preparation journal is missing or incomplete; recovery copies may be partial. Inspect available bytes before reconciliation.".into()),
                    Err(e) => entry.diagnostics.push(format!("Preparation could not be confirmed; recovery copies may be partial: {e}")),
                }
                match existing_recovery_file(&item.path(), "published.txt") {
                    Ok(Some(_)) => (),
                    Ok(None) => entry.diagnostics.push("Publication is incomplete or unconfirmed. The source may be missing or externally changed; inspect diagnostics before exporting available retained bytes.".into()),
                    Err(e) => entry.diagnostics.push(e),
                }
            }
        }
        result.push(entry);
    }
    result.sort_by(|a, b| b.id.cmp(&a.id));
    result.truncate(RECOVERY_LIMIT);
    Ok(result)
}
fn read_recovery_at(
    recovery: &Path,
    folder: &str,
    id: &str,
    version: &str,
) -> Result<String, String> {
    folder_name(folder)?;
    validate_transaction_id(id)?;
    if !matches!(version, "previous" | "draft") {
        return Err("Recovery version must be previous or draft.".into());
    }
    let directory = recovery.join(folder).join(id);
    let _guards = guard_directories(&directory)?;
    let path = if version == "previous" {
        previous_recovery(&directory)?
    } else {
        existing_recovery_file(&directory, "draft.md")?
    }
    .ok_or("Requested recovery bytes are missing.")?;
    let file = guarded_open(&path, false)?;
    raw(&file)
}
#[tauri::command]
pub fn list_skill_recoveries(
    app: tauri::AppHandle,
    folder: String,
) -> Result<Vec<RecoveryEntry>, String> {
    list_recoveries_at(&recovery_root(&app)?, &folder)
}
#[tauri::command]
pub fn read_skill_recovery(
    app: tauri::AppHandle,
    folder: String,
    id: String,
    version: String,
) -> Result<String, String> {
    read_recovery_at(&recovery_root(&app)?, &folder, &id, &version)
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::{
        io::Write,
        sync::atomic::{AtomicU64, Ordering},
    };
    static NEXT: AtomicU64 = AtomicU64::new(0);
    struct Fixture {
        base: PathBuf,
        root: PathBuf,
    }
    impl Fixture {
        fn new() -> Self {
            let stamp = std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let base = Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .join("output")
                .join("native-tests")
                .join(format!(
                    "{}-{stamp}-{}",
                    std::process::id(),
                    NEXT.fetch_add(1, Ordering::Relaxed)
                ));
            let root = base.join("skills");
            fs::create_dir_all(&root).unwrap();
            Self { base, root }
        }
        fn skill(&self, name: &str, bytes: &[u8]) -> PathBuf {
            let folder = self.root.join(name);
            fs::create_dir(&folder).unwrap();
            fs::write(folder.join("SKILL.md"), bytes).unwrap();
            folder
        }
        fn recovery(&self) -> PathBuf {
            self.base.join("appdata").join("skill-recovery")
        }
        fn junction(&self, link: &Path, target: &Path) {
            assert!(link.starts_with(&self.base) && target.starts_with(&self.base));
            let output = std::process::Command::new("cmd.exe")
                .args(["/D", "/C", "mklink", "/J"])
                .arg(link)
                .arg(target)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }
    // Fixtures intentionally remain in ignored output/native-tests for inspection.
    // No tests operate on USERPROFILE, and none recursively delete paths.
    #[test]
    fn discovers_all_child_folders_including_missing_and_invalid_skill_files() {
        let fixture = Fixture::new();
        fixture.skill("valid", b"---\nname: Test\n---\nBody");
        fixture.skill("invalid-utf8", &[0xff]);
        fs::create_dir(fixture.root.join("missing")).unwrap();
        fs::write(fixture.root.join("ordinary-file"), "ignored").unwrap();
        let result = discover_at(&fixture.root);
        assert_eq!(result.entries.len(), 3, "{:?}", result.diagnostics);
        assert!(result
            .entries
            .iter()
            .find(|e| e.folder == "valid")
            .unwrap()
            .problem
            .is_none());
        assert!(result
            .entries
            .iter()
            .find(|e| e.folder == "missing")
            .unwrap()
            .problem
            .is_some());
        assert!(result
            .entries
            .iter()
            .find(|e| e.folder == "invalid-utf8")
            .unwrap()
            .problem
            .as_ref()
            .unwrap()
            .contains("UTF-8"));
    }
    #[test]
    fn retains_bom_crlf_and_no_final_newline_exactly() {
        let fixture = Fixture::new();
        let bytes = b"\xef\xbb\xbf---\r\nname: Test\r\n---\r\nNo newline";
        fixture.skill("raw", bytes);
        assert_eq!(
            read_at(&fixture.root, "raw").unwrap().content.as_bytes(),
            bytes
        );
    }
    #[test]
    fn malformed_utf8_and_oversized_files_are_never_rewritten() {
        let fixture = Fixture::new();
        let bad = fixture.skill("bad", &[0xff, 0xfe]);
        assert!(read_at(&fixture.root, "bad").unwrap_err().contains("UTF-8"));
        assert_eq!(fs::read(bad.join("SKILL.md")).unwrap(), [0xff, 0xfe]);
        let large = fixture.skill("large", &vec![b'a'; CONTENT_LIMIT as usize + 1]);
        assert!(read_at(&fixture.root, "large")
            .unwrap_err()
            .contains("1 MiB"));
        assert_eq!(
            fs::metadata(large.join("SKILL.md")).unwrap().len(),
            CONTENT_LIMIT + 1
        );
    }
    #[test]
    fn refuses_folder_escape_and_windows_alias_names() {
        for name in [
            "",
            ".",
            "..",
            "../outside",
            "nested/child",
            "nested\\child",
            "C:drive",
            "a:stream",
            "name.",
            "name ",
            "NUL",
            "COM1.txt",
        ] {
            assert!(folder_name(name).is_err(), "accepted {name}");
        }
        assert!(folder_name("ordinary-skill").is_ok());
    }
    #[test]
    fn reports_missing_root_without_creating_it() {
        let fixture = Fixture::new();
        let missing = fixture.base.join("absent");
        let result = discover_at(&missing);
        assert!(result.entries.is_empty());
        assert!(!result.diagnostics.is_empty());
        assert!(!missing.exists());
    }
    #[test]
    fn inventories_supporting_paths_without_reading_or_changing_contents() {
        let fixture = Fixture::new();
        let folder = fixture.skill("support", b"body");
        fs::create_dir(folder.join("scripts")).unwrap();
        let binary = [0xff, 0x00, 0x01];
        fs::write(folder.join("scripts/helper.bin"), binary).unwrap();
        let result = read_at(&fixture.root, "support").unwrap();
        assert!(result
            .supporting_files
            .iter()
            .any(|f| f.path == "scripts" && f.kind == "directory"));
        assert!(result
            .supporting_files
            .iter()
            .any(|f| f.path == "scripts/helper.bin" && f.kind == "file" && f.size == Some(3)));
        assert_eq!(fs::read(folder.join("scripts/helper.bin")).unwrap(), binary);
    }
    #[test]
    fn rejects_hardlinked_skill_and_marks_hardlinked_support_blocked() {
        let fixture = Fixture::new();
        let folder = fixture.skill("linked", b"body");
        fs::hard_link(folder.join("SKILL.md"), fixture.base.join("alias")).unwrap();
        assert!(read_at(&fixture.root, "linked")
            .unwrap_err()
            .contains("hardlinked"));
        let support = fixture.skill("support", b"safe");
        fs::hard_link(fixture.base.join("alias"), support.join("helper")).unwrap();
        let result = read_at(&fixture.root, "support").unwrap();
        assert!(result
            .supporting_files
            .iter()
            .any(|f| f.path == "helper" && f.kind == "blocked"));
    }
    #[test]
    fn rejects_reparse_root_ancestor_child_file_and_support_paths() {
        let fixture = Fixture::new();
        let folder = fixture.skill("real", b"body");
        let root_link = fixture.base.join("root-link");
        fixture.junction(&root_link, &fixture.root);
        assert!(!discover_at(&root_link).diagnostics.is_empty());
        assert!(read_at(&root_link, "real").unwrap_err().contains("reparse"));
        let nested = folder.join("nested");
        fs::create_dir(&nested).unwrap();
        fixture.junction(&fixture.root.join("linked-child"), &folder);
        assert!(
            discover_at(&fixture.root)
                .entries
                .iter()
                .any(|e| e.folder == "linked-child"
                    && e.problem.as_ref().unwrap().contains("reparse"))
        );
        fixture.junction(&folder.join("linked-support"), &nested);
        let result = read_at(&fixture.root, "real").unwrap();
        assert!(result
            .supporting_files
            .iter()
            .any(|f| f.path == "linked-support" && f.kind == "blocked"));
        // A directory reparse point named SKILL.md must also be rejected.
        let bad = fixture.root.join("linked-file");
        fs::create_dir(&bad).unwrap();
        fixture.junction(&bad.join("SKILL.md"), &nested);
        assert!(read_at(&fixture.root, "linked-file")
            .unwrap_err()
            .contains("reparse"));
        // A linked ancestor above an otherwise ordinary root is blocked too.
        let ancestor = fixture.base.join("ancestor-link");
        fixture.junction(&ancestor, &fixture.base);
        assert!(guard_directories(&ancestor.join("skills")).is_err());
    }
    #[test]
    fn guards_exclude_external_writers_and_renames() {
        let fixture = Fixture::new();
        let folder = fixture.skill("guarded", b"old");
        let _ancestors = guard_directories(&fixture.root).unwrap();
        let _directory = guarded_open(&folder, true).unwrap();
        let _file = guarded_open(&folder.join("SKILL.md"), false).unwrap();
        assert!(OpenOptions::new()
            .write(true)
            .open(folder.join("SKILL.md"))
            .is_err());
        assert!(fs::rename(folder.join("SKILL.md"), folder.join("moved")).is_err());
        assert!(fs::rename(&folder, fixture.root.join("moved-folder")).is_err());
    }
    #[test]
    fn save_refuses_stale_and_deleted_sources_without_creating_recovery() {
        let fixture = Fixture::new();
        let folder = fixture.skill("edit", b"external");
        fs::write(folder.join("helper"), b"untouched").unwrap();
        assert!(
            save_at(&fixture.root, &fixture.recovery(), "edit", "stale", "draft")
                .unwrap_err()
                .contains("changed outside")
        );
        assert!(!fixture.recovery().exists());
        assert_eq!(fs::read(folder.join("SKILL.md")).unwrap(), b"external");
        assert_eq!(fs::read(folder.join("helper")).unwrap(), b"untouched");
        fs::rename(folder.join("SKILL.md"), folder.join("deleted-original")).unwrap();
        assert!(save_at(
            &fixture.root,
            &fixture.recovery(),
            "edit",
            "external",
            "draft"
        )
        .is_err());
        assert!(!folder.join("SKILL.md").exists());
    }
    #[test]
    fn save_checks_content_limit_without_touching_files() {
        let fixture = Fixture::new();
        fixture.skill("edit", b"old");
        assert!(save_at(
            &fixture.root,
            &fixture.recovery(),
            "edit",
            "old",
            &"a".repeat(CONTENT_LIMIT as usize + 1)
        )
        .unwrap_err()
        .contains("1 MiB"));
        assert_eq!(
            fs::read(fixture.root.join("edit/SKILL.md")).unwrap(),
            b"old"
        );
        assert!(!fixture.recovery().exists());
    }
    #[test]
    fn successful_publish_preserves_raw_versions_supporting_files_and_reload() {
        let fixture = Fixture::new();
        let previous = "\u{feff}---\r\nname: Old\r\n---\r\nOld body";
        let draft = "\u{feff}---\r\nname: New\r\n---\r\nNew body";
        let folder = fixture.skill("edit", previous.as_bytes());
        fs::create_dir(folder.join("scripts")).unwrap();
        fs::write(folder.join("scripts/helper.ps1"), b"never execute\r\n").unwrap();
        let result = save_at(&fixture.root, &fixture.recovery(), "edit", previous, draft).unwrap();
        assert_eq!(result.content, draft);
        assert!(result.modified_ms.is_some());
        assert_eq!(read_at(&fixture.root, "edit").unwrap().content, draft);
        assert_eq!(
            fs::read(folder.join("scripts/helper.ps1")).unwrap(),
            b"never execute\r\n"
        );
        let entries = list_recoveries_at(&fixture.recovery(), "edit").unwrap();
        assert_eq!(entries.len(), 1);
        assert!(
            entries[0].diagnostics.is_empty(),
            "{:?}",
            entries[0].diagnostics
        );
        assert_eq!(
            read_recovery_at(&fixture.recovery(), "edit", &entries[0].id, "previous").unwrap(),
            previous
        );
        assert_eq!(
            read_recovery_at(&fixture.recovery(), "edit", &entries[0].id, "draft").unwrap(),
            draft
        );
        assert_eq!(
            fs::read(result.recovery_path.unwrap()).unwrap(),
            previous.as_bytes()
        );
        assert!(fixture
            .recovery()
            .join("edit")
            .join(&entries[0].id)
            .join("prepared.txt")
            .exists());
        assert!(!fixture
            .recovery()
            .join("edit")
            .join(&entries[0].id)
            .join("stage.md")
            .exists());
        save_at(&fixture.root, &fixture.recovery(), "edit", draft, "third").unwrap();
        let newer = list_recoveries_at(&fixture.recovery(), "edit").unwrap();
        assert_eq!(newer.len(), 2);
        assert_eq!(
            read_recovery_at(&fixture.recovery(), "edit", &newer[0].id, "previous").unwrap(),
            draft
        );
    }
    #[test]
    fn gap_race_preserves_external_destination_and_both_recoverable_versions() {
        let fixture = Fixture::new();
        let folder = fixture.skill("edit", b"old");
        let result = save_with_gap_hook(
            &fixture.root,
            &fixture.recovery(),
            "edit",
            "old",
            "draft",
            |source| {
                assert!(!source.exists());
                fs::write(source, b"external wins").unwrap();
                Ok(())
            },
        );
        let error = result.unwrap_err();
        assert!(error.contains("No existing destination was overwritten"));
        assert!(error.contains("Previous snapshot:") && error.contains("Draft (if created):"));
        assert_eq!(fs::read(folder.join("SKILL.md")).unwrap(), b"external wins");
        let entries = list_recoveries_at(&fixture.recovery(), "edit").unwrap();
        assert_eq!(
            read_recovery_at(&fixture.recovery(), "edit", &entries[0].id, "previous").unwrap(),
            "old"
        );
        assert_eq!(
            read_recovery_at(&fixture.recovery(), "edit", &entries[0].id, "draft").unwrap(),
            "draft"
        );
        assert!(!entries[0].diagnostics.is_empty());
        assert!(fixture
            .recovery()
            .join("edit")
            .join(&entries[0].id)
            .join("stage.md")
            .exists());
    }
    #[test]
    fn deterministic_interruption_leaves_queryable_recovery_when_source_is_missing() {
        let fixture = Fixture::new();
        let folder = fixture.skill("edit", b"old");
        let error = save_with_gap_hook(
            &fixture.root,
            &fixture.recovery(),
            "edit",
            "old",
            "draft",
            |_| Err("simulated process interruption before publish".into()),
        )
        .unwrap_err();
        assert!(error.contains("simulated process interruption"));
        assert!(!folder.join("SKILL.md").exists());
        assert!(read_at(&fixture.root, "edit").is_err());
        let entries = list_recoveries_at(&fixture.recovery(), "edit").unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(
            read_recovery_at(&fixture.recovery(), "edit", &entries[0].id, "previous").unwrap(),
            "old"
        );
        assert_eq!(
            read_recovery_at(&fixture.recovery(), "edit", &entries[0].id, "draft").unwrap(),
            "draft"
        );
        assert!(entries[0]
            .diagnostics
            .iter()
            .any(|d| d.contains("incomplete or unconfirmed")));
        // Recovery lookup never needs the installed folder or its SKILL.md.
        fs::rename(&folder, fixture.root.join("externally-moved-folder")).unwrap();
        assert_eq!(
            list_recoveries_at(&fixture.recovery(), "edit")
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn gap_junction_destination_is_never_followed_or_replaced() {
        let fixture = Fixture::new();
        let folder = fixture.skill("edit", b"old");
        let outside = fixture.base.join("outside");
        fs::create_dir(&outside).unwrap();
        fs::write(outside.join("untouched"), b"external").unwrap();
        assert!(save_with_gap_hook(
            &fixture.root,
            &fixture.recovery(),
            "edit",
            "old",
            "draft",
            |source| {
                fixture.junction(source, &outside);
                Ok(())
            }
        )
        .is_err());
        assert_eq!(fs::read(outside.join("untouched")).unwrap(), b"external");
        assert!(guarded_open(&folder.join("SKILL.md"), false)
            .unwrap_err()
            .contains("reparse"));
        let entries = list_recoveries_at(&fixture.recovery(), "edit").unwrap();
        assert_eq!(
            read_recovery_at(&fixture.recovery(), "edit", &entries[0].id, "previous").unwrap(),
            "old"
        );
    }
    #[test]
    fn original_and_stage_handles_exclude_external_mutation_and_transaction_swaps() {
        let fixture = Fixture::new();
        let folder = fixture.skill("edit", b"old");
        {
            let _original = original_for_save(&folder.join("SKILL.md")).unwrap();
            assert!(OpenOptions::new()
                .write(true)
                .open(folder.join("SKILL.md"))
                .is_err());
            assert!(fs::rename(folder.join("SKILL.md"), folder.join("other")).is_err());
        }
        save_with_gap_hook(
            &fixture.root,
            &fixture.recovery(),
            "edit",
            "old",
            "draft",
            |_| {
                let transaction = fs::read_dir(fixture.recovery().join("edit"))
                    .unwrap()
                    .next()
                    .unwrap()
                    .unwrap()
                    .path();
                assert!(OpenOptions::new()
                    .write(true)
                    .open(transaction.join("stage.md"))
                    .is_err());
                assert!(fs::rename(
                    transaction.join("stage.md"),
                    transaction.join("stage-swapped.md")
                )
                .is_err());
                assert!(fs::rename(&transaction, transaction.with_extension("moved")).is_err());
                Ok(())
            },
        )
        .unwrap();
    }
    #[test]
    fn recovery_and_controlled_stage_reparse_or_hardlink_paths_are_rejected() {
        let fixture = Fixture::new();
        let folder = fixture.skill("edit", b"old");
        let outside = fixture.base.join("outside");
        fs::create_dir(&outside).unwrap();
        let appdata = fixture.base.join("appdata");
        fixture.junction(&appdata, &outside);
        assert!(
            save_at(&fixture.root, &fixture.recovery(), "edit", "old", "draft")
                .unwrap_err()
                .contains("reparse")
        );
        assert_eq!(fs::read(folder.join("SKILL.md")).unwrap(), b"old");
        let linked_stage = fixture.base.join("linked-stage.md");
        fixture.junction(&linked_stage, &outside);
        let original = original_for_save(&folder.join("SKILL.md")).unwrap();
        let security = SourceSecurity::from_file(&original).unwrap();
        assert!(controlled_file(&linked_stage, b"new", &security).is_err());
        let existing = fixture.base.join("existing.md");
        fs::write(&existing, b"untouched").unwrap();
        let hardlinked_stage = fixture.base.join("hardlinked-stage.md");
        fs::hard_link(&existing, &hardlinked_stage).unwrap();
        assert!(controlled_file(&hardlinked_stage, b"new", &security).is_err());
        assert_eq!(fs::read(existing).unwrap(), b"untouched");
    }
    #[test]
    fn recovery_reads_reject_linked_oversized_invalid_and_escaping_requests() {
        let fixture = Fixture::new();
        fixture.skill("edit", b"old");
        save_at(&fixture.root, &fixture.recovery(), "edit", "old", "draft").unwrap();
        let entries = list_recoveries_at(&fixture.recovery(), "edit").unwrap();
        let id = &entries[0].id;
        assert!(read_recovery_at(&fixture.recovery(), "edit", "../escape", "draft").is_err());
        assert!(read_recovery_at(&fixture.recovery(), "../edit", id, "draft").is_err());
        assert!(read_recovery_at(&fixture.recovery(), "edit", id, "stage").is_err());
        let directory = fixture.recovery().join("edit").join(id);
        fs::hard_link(directory.join("draft.md"), fixture.base.join("draft-alias")).unwrap();
        assert!(read_recovery_at(&fixture.recovery(), "edit", id, "draft")
            .unwrap_err()
            .contains("hardlinked"));
        assert!(list_recoveries_at(&fixture.recovery(), "edit").unwrap()[0]
            .diagnostics
            .iter()
            .any(|d| d.contains("hardlinked")));
        fs::write(
            directory.join("previous.md"),
            vec![b'x'; CONTENT_LIMIT as usize + 1],
        )
        .unwrap();
        assert!(
            read_recovery_at(&fixture.recovery(), "edit", id, "previous")
                .unwrap_err()
                .contains("1 MiB")
        );
        fs::write(directory.join("previous.md"), [0xff]).unwrap();
        assert!(
            read_recovery_at(&fixture.recovery(), "edit", id, "previous")
                .unwrap_err()
                .contains("UTF-8")
        );
    }
    #[test]
    fn recovery_inventory_returns_newest_twenty_and_reports_unexpected_entries() {
        let fixture = Fixture::new();
        let folder = fixture.recovery().join("edit");
        fs::create_dir_all(&folder).unwrap();
        for number in 1..=25u128 {
            let id = format!("{number:032x}-00000001-0000000000000000");
            let transaction = folder.join(id);
            fs::create_dir(&transaction).unwrap();
            fs::write(transaction.join("previous-copy.md"), b"old").unwrap();
            fs::write(transaction.join("draft.md"), b"draft").unwrap();
        }
        let entries = list_recoveries_at(&fixture.recovery(), "edit").unwrap();
        assert_eq!(entries.len(), RECOVERY_LIMIT);
        assert_eq!(&entries[0].id[..32], format!("{:032x}", 25));
        assert_eq!(&entries[19].id[..32], format!("{:032x}", 6));
        assert_eq!(
            read_recovery_at(&fixture.recovery(), "edit", &entries[0].id, "previous").unwrap(),
            "old"
        );
        fs::write(folder.join("unexpected"), b"data").unwrap();
        assert!(list_recoveries_at(&fixture.recovery(), "edit")
            .unwrap_err()
            .contains("Unexpected recovery entry"));
    }
    #[test]
    fn recovery_transaction_links_and_recovery_root_overlap_are_rejected() {
        let fixture = Fixture::new();
        fixture.skill("edit", b"old");
        assert!(save_at(
            &fixture.root,
            &fixture.root.join("recovery"),
            "edit",
            "old",
            "draft"
        )
        .unwrap_err()
        .contains("outside"));
        assert!(!fixture.root.join("recovery").exists());
        let recovery_folder = fixture.recovery().join("edit");
        fs::create_dir_all(&recovery_folder).unwrap();
        let outside = fixture.base.join("outside");
        fs::create_dir(&outside).unwrap();
        let id = transaction_id().unwrap();
        fixture.junction(&recovery_folder.join(&id), &outside);
        assert!(list_recoveries_at(&fixture.recovery(), "edit").unwrap()[0]
            .diagnostics
            .iter()
            .any(|d| d.contains("reparse")));
        assert!(read_recovery_at(&fixture.recovery(), "edit", &id, "draft")
            .unwrap_err()
            .contains("reparse"));
    }
    #[test]
    fn publishes_and_recovers_with_exact_protected_source_dacl() {
        use std::os::windows::{ffi::OsStrExt, fs::OpenOptionsExt, io::AsRawHandle};
        use windows_sys::Win32::{
            Foundation::LocalFree,
            Security::{Authorization::*, *},
            Storage::FileSystem::*,
        };
        let fixture = Fixture::new();
        let folder = fixture.skill("private", b"private old");
        let source = folder.join("SKILL.md");
        let file = OpenOptions::new()
            .access_mode(FILE_GENERIC_READ | WRITE_DAC)
            .open(&source)
            .unwrap();
        let mut owner = std::ptr::null_mut();
        let mut owner_descriptor = std::ptr::null_mut();
        let mut sid_text = std::ptr::null_mut();
        unsafe {
            assert_eq!(
                GetSecurityInfo(
                    file.as_raw_handle(),
                    SE_FILE_OBJECT,
                    OWNER_SECURITY_INFORMATION,
                    &mut owner,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    &mut owner_descriptor
                ),
                0
            );
            assert_ne!(ConvertSidToStringSidW(owner, &mut sid_text), 0);
        }
        let mut length = 0;
        while unsafe { *sid_text.add(length) } != 0 {
            length += 1;
        }
        let owner_sid =
            String::from_utf16(unsafe { std::slice::from_raw_parts(sid_text, length) }).unwrap();
        let sddl: Vec<u16> = std::ffi::OsStr::new(&format!("D:P(A;;FA;;;{owner_sid})"))
            .encode_wide()
            .chain(Some(0))
            .collect();
        let mut private_descriptor = std::ptr::null_mut();
        let mut private_dacl = std::ptr::null_mut();
        let mut present = 0;
        let mut defaulted = 0;
        unsafe {
            assert_ne!(
                ConvertStringSecurityDescriptorToSecurityDescriptorW(
                    sddl.as_ptr(),
                    SDDL_REVISION_1,
                    &mut private_descriptor,
                    std::ptr::null_mut()
                ),
                0
            );
            assert_ne!(
                GetSecurityDescriptorDacl(
                    private_descriptor,
                    &mut present,
                    &mut private_dacl,
                    &mut defaulted
                ),
                0
            );
            assert_eq!(
                SetSecurityInfo(
                    file.as_raw_handle(),
                    SE_FILE_OBJECT,
                    DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    private_dacl,
                    std::ptr::null_mut()
                ),
                0
            );
            LocalFree(sid_text.cast());
            LocalFree(owner_descriptor);
            LocalFree(private_descriptor);
        }
        let expected_security = SourceSecurity::from_file(&file).unwrap();
        assert!(expected_security.was_protected);
        drop(file);
        save_at(
            &fixture.root,
            &fixture.recovery(),
            "private",
            "private old",
            "private draft",
        )
        .unwrap();
        let published = guarded_open(&source, false).unwrap();
        expected_security.verify(&published).unwrap();
        drop(published);
        let entries = list_recoveries_at(&fixture.recovery(), "private").unwrap();
        let transaction = fixture.recovery().join("private").join(&entries[0].id);
        for name in ["previous.md", "previous-copy.md", "draft.md"] {
            let recovered = guarded_open(&transaction.join(name), false).unwrap();
            expected_security.verify(&recovered).unwrap();
        }
    }
    #[test]
    fn refuses_readonly_or_efs_sources_before_creating_recovery() {
        use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_ENCRYPTED;
        let fixture = Fixture::new();
        let folder = fixture.skill("edit", b"old");
        let path = folder.join("SKILL.md");
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions).unwrap();
        assert!(
            save_at(&fixture.root, &fixture.recovery(), "edit", "old", "draft")
                .unwrap_err()
                .contains("read-only")
        );
        assert!(!fixture.recovery().exists());
        assert_eq!(fs::read(&path).unwrap(), b"old");
        assert!(source_attributes(FILE_ATTRIBUTE_ENCRYPTED)
            .unwrap_err()
            .contains("EFS-encrypted"));
    }
    #[test]
    fn incomplete_preparation_is_visible_and_never_claimed_as_durable_versions() {
        let fixture = Fixture::new();
        fixture.skill("edit", b"source unchanged");
        let id = transaction_id().unwrap();
        let directory = fixture.recovery().join("edit").join(&id);
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("previous-copy.md"), b"partial previous").unwrap();
        fs::write(directory.join("draft.md"), b"partial draft").unwrap();
        let missing = list_recoveries_at(&fixture.recovery(), "edit").unwrap();
        assert!(missing[0]
            .diagnostics
            .iter()
            .any(|d| d.contains("copies may be partial")));
        fs::write(
            directory.join("prepared.txt"),
            b"skill-recovery-v1\nfolder:",
        )
        .unwrap();
        let incomplete = list_recoveries_at(&fixture.recovery(), "edit").unwrap();
        assert!(incomplete[0]
            .diagnostics
            .iter()
            .any(|d| d.contains("journal is missing or incomplete")));
        assert_eq!(
            fs::read(fixture.root.join("edit/SKILL.md")).unwrap(),
            b"source unchanged"
        );
    }
    #[test]
    fn bounded_supporting_depth_reports_incomplete_inventory() {
        let fixture = Fixture::new();
        let folder = fixture.skill("deep", b"body");
        let mut nested = folder;
        for _ in 0..DEPTH_LIMIT + 2 {
            nested = nested.join("nested");
            fs::create_dir(&nested).unwrap();
        }
        File::create(nested.join("never-read"))
            .unwrap()
            .write_all(b"data")
            .unwrap();
        let result = read_at(&fixture.root, "deep").unwrap();
        assert!(result.diagnostics.iter().any(|s| s.contains("depth limit")));
        assert!(!result
            .supporting_files
            .iter()
            .any(|f| f.path.ends_with("never-read")));
    }
}
