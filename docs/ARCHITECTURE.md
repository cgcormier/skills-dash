# Architecture

## Skill improvement v1 extension

The workbench includes a separate opt-in lifecycle. Pure TypeScript owns
effective policy, evidence consolidation, eligibility, immutable review snapshots,
validation, publication decisions and reconciliation. Rust owns bounded profile,
filesystem CAS and Codex process operations. React consumes the engine through
the replaceable native adapter. Detailed contracts and module ownership are in
[IMPROVEMENT_V1.md](IMPROVEMENT_V1.md).

New bounded commands are `lifecycle_profile`, `lifecycle_read`,
`lifecycle_write`, `reviewer_start` and `reviewer_cancel`. The reporter writes
immutable inbox records; only the app engine writes versioned lifecycle state.
The existing checked-save/recovery commands remain the sole source publisher.
No reviewer-provided command is executed. Native reviewer code uses a fixed
Codex executable/flags, a bounded snapshot/schema, timeout/cancellation and a
Windows process job. These OS capabilities are necessary for closed-app reporting,
durable state and local CLI integration; no general shell/HTTP/filesystem plugin
is introduced.

`SKILLS_DASH_TEST_PROFILE` selects an explicitly marked test directory and isolates
skill/recovery/lifecycle/legacy/WebView storage. Without it, the original fixed
personal root and application identity below are preserved. This test mechanism
does not add production multi-root discovery. The original history ledger is not
read, rewritten, migrated or combined with the new lifecycle.

A guarded exclusive OS handle holds the test-profile session lease for the
application lifetime. Two test profiles can run independently; two engines cannot
open the same test profile. The ordinary profile keeps its existing single-instance
plugin. The main window's narrowly scoped destroy permission completes Tauri's
existing `onCloseRequested` guard after it permits a close; it grants no file or
process execution capability.

Cancellation asks the runner to stop even when lifecycle persistence is blocked.
The original storage error remains visible until a successful reload. Invalid
proposals retain pending evidence across retries. Publication journals carry an
optional publish/restore operation discriminator so ambiguous recovery retains
its intent across restart, without migrating the separate history ledger.

The following sections describe the retained base workbench behavior.

## Authority and ownership

Personal skill folders are authoritative. Native code resolves the sole root from
`USERPROFILE/.agents/skills`. Callers cannot select a root. App preferences and
recovery transactions are separate from skill content. There is no archive index,
database or agent runtime that owns installed skills.

| Layer         | Owner                                              | Responsibility                                                                                     |
| ------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Metadata      | `src/domain/skillFiles.ts`                         | YAML inspection and validation, raw source preservation, bounded safe metadata projection          |
| Raw editing   | `src/domain/rawDraft.ts`                           | Map normalized textarea changes onto raw source while preserving untouched line endings/BOM        |
| File boundary | `src/storage/skillFiles.ts`                        | Native-only discovery/read/save/recovery calls, four concurrent metadata reads, per-entry failures |
| UI            | `src/App.tsx`                                      | Selection, search, opened revision, draft, dirty guards, recovery exports and explicit errors      |
| Legacy        | `src/storage/legacy.ts`, `src/domain/workspace.ts` | Independent raw primary/backup reads and read-only v1 validation for accounting                    |
| Native        | `src-tauri/src/skills.rs`                          | Bounded filesystem access, Windows path/link guards, checked recoverable publication               |
| Shell         | `src-tauri/src/main.rs`                            | Legacy raw read, existing single-instance/window shell                                             |

## IPC contract

- `discover_skills()` returns `{ root, savePolicy, entries, diagnostics }`.
  Windows advertises `recoverable-publish`; unsupported platforms fail closed.
  Entries contain folder, real path, disk modification time, size and access
  problems. Missing, malformed and blocked skill files remain visible.
- `read_skill(folder)` returns raw UTF-8 content, path, modified time, supporting
  inventory and filesystem diagnostics. No script or Markdown is executed.
- `save_skill(folder, expectedContent, content)` accepts only one existing skill
  folder. It compares exact opened source under a writer-excluding handle and
  uses the approved recoverable publish protocol described below.
- `list_skill_recoveries(folder)` returns the newest 20 transactions, their
  previous/draft paths, timestamps and incomplete/blocked recovery diagnostics.
- `read_skill_recovery(folder, id, version)` returns bounded raw content for
  `previous` or `draft`. IDs must match the exact generated transaction format.
- `read_legacy_archive(backup)` independently reads the existing fixed primary
  or backup path, retaining corrupt JSON as raw text. No legacy write is exposed.

## Filesystem capability review

Native access is necessary to manage installed files from Tauri's WebView. It
accepts an ordinary immediate folder name, rejecting separators, relative paths,
reserved Windows names and alternate streams. All ancestors and relevant
directories remain open without write/delete sharing while paths are used.
Reparse points, hardlinked files and unexpected file types are rejected through
handle inspection. No general filesystem/shell/SQL/HTTP/dialog plugin is added.

Bounds: 1 MiB per raw skill or recovery read, 4,096 root/recovery inventory entries,
2,048 supporting paths and depth 8. Limit and permission failures stay visible.
Missing skill roots are not created. Supporting files are inventoried, never
modified or executed. Non-Windows filesystem behavior is not implemented.

The single-instance plugin coordinates app windows; it does not lock external
agents. Event listen/unlisten permissions guard dirty drafts during native close.
Existing bounded window controls and local-only CSP remain. Native commands do
not accept arbitrary paths or execute external content.

## Approved recoverable publishing

Windows tests showed atomic replacement is blocked while the target excludes
external replacement. A POSIX rename probe also returned sharing error 32.
The user explicitly selected strict refusal during a race, accepting a brief
missing-file interval. This protocol is **not an atomic replacement**:

1. Pin source and recovery ancestor directories. Open the existing file for
   reading and handle-based rename, excluding external writers/deletes. Compare
   exact raw content with `expectedContent`; stale/deleted/blocked files stop.
2. Create a unique transaction outside the skill root. Sync independent previous
   and draft copies, a publication stage and a preparation journal before moving
   the source. Guard links and permissions at creation; unsafe sources fail closed.
3. Move the already-open original by handle to `previous.md`, without replacing
   anything. Record the move. Only now is `SKILL.md` briefly absent.
4. Rename the synced stage by handle into `SKILL.md` with replacement disabled.
   If any file or link appeared during the gap, refuse publication and retain all
   copies. No check-then-overwrite path is used.
5. Sync the published handle and record publication. Return known requested bytes
   and handle metadata, keeping the handle guarded until return. Do not reread a
   racing pathname and clear the draft against somebody else's contents.

Transactions live at app-data `skill-recovery/<folder>/<id>/`. `previous-copy.md`
and `draft.md` survive even if publication is interrupted. `previous.md` retains
the moved original when that step completed; `stage.md` remains after a failed
publish. A preparation/moved/published record describes progress. Failure messages
name the recovery paths, and the UI retains its unsaved draft. Missing source
files still expose their recovery list and exports.

Source/recovery must be on the same volume. Read-only/encrypted sources, unsafe
links, unavailable guards or permission-preservation failures are rejected.
Recovery/stage copies use the source DACL, protected against inheritance from
their new parent. This preserves access restrictions but protects inheritance
on the new copies. The moved original keeps its security descriptor/streams.

Recovery is explicit export/manual reconciliation; no rollback overwrites a
newer external file. No automatic pruning occurs. Synced files and journals
support process interruption recovery; physical power-loss/filesystem durability
is not certified, and whole-file replacement of alternate streams is not claimed.

## Parsing and compatibility

TypeScript owns YAML parsing/validation. `yaml` supports multiline and nested
unknown metadata; custom tags do not execute application code. Alias expansion,
projection depth and node counts are bounded. Malformed syntax/cycles produce
diagnostics while preserving raw source. Required-field errors and naming
convention warnings remain separate. Validation is advisory for repairing files.

Metadata is never serialized over the source. The editor preserves unchanged raw
spans, including BOM and mixed line endings; inserted line breaks follow the
original file's first newline convention. Supporting contents are untouched.

The app identifier and legacy data paths remain unchanged. Neither legacy JSON
copy nor browser key is deleted/replaced/migrated. Starter records exist only as
test fixtures. Atlas, Posters, category/lifecycle/relationship mutations and
workspace undo are retired. Photo assets are unused; deleting them is deferred.
The stack/build tooling remains small; the only new frontend runtime dependency
is YAML parsing. Windows security feature flags support bounded DACL preservation.
