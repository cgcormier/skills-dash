# Architecture

## Ownership

| Layer                 | Files                              | Responsibility                                                                                   |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| Domain                | `src/domain/workspace.ts`          | Version-1 contract, validation, filtering, deletion cleanup and explicit relationship projection |
| Domain state          | `src/hooks/useWorkspace.ts`        | Single owner; transactional mutations, serialized saves, save state, recovery and bounded undo   |
| Persistence boundary  | `src/storage/adapter.ts`           | Select native IPC or browser storage; never silently fall back when native storage fails         |
| View state            | `src/hooks/useViewState.ts`        | URL state, history, last-view preference; independent of domain undo                             |
| Semantic UI           | `src/App.tsx`, `src/components/`   | Navigation, forms, modals, collection views, keyboard handling and safe Markdown preview         |
| Expression and motion | `src/styles.css`, `public/images/` | Print/semantic/type/geometry tokens, static image treatments and short CSS transitions           |
| Native                | `src-tauri/src/main.rs`            | Fixed app-data files, payload guards, atomic replacement and one app instance                    |

## Persistent contract

`Workspace = { version: 1, skills: Skill[] }`. A skill has ID, title, summary, category, tags, status (`active`, `draft`, `archived`), Markdown body, directed `relatedIds`, favorite, createdAt and updatedAt. IDs are unique. Links cannot be dangling or self-references. Timestamps are canonical UTC ISO. UI mutations preserve identity/creation time and update modified time.

Stored references are directed because one record owns the edit, but the Atlas draws reciprocal pairs once and the dossier shows incoming and outgoing neighbors. No edges are inferred from category membership. Deleting through the domain API removes incoming links in the same transaction; the UI uses reversible archive/restore instead of destructive deletion.

Unknown schema versions and malformed imports fail before mutation. Native guards repeat critical structure checks at the trust boundary. Future schema migration must explicitly validate the source version, preserve a pre-migration backup, and add tests; there is no undocumented migration behavior today.

## Native IPC

- `load_workspace() -> string | null`: read primary fixed file; null only when absent. Corruption returns an error.
- `save_workspace({ data: string }) -> void`: validate bounded payload, preserve the valid previous file, sync a temporary file, atomically replace primary.
- `recover_workspace() -> string | null`: explicitly read the backup. Frontend validates and commits recovery; there is no silent fallback.

Windows replacement uses `MoveFileExW` with replace-existing and write-through flags. A process mutex serializes file operations. The single-instance plugin prevents two app processes from maintaining competing stale copies. JSON backups are local recovery aids, not a multi-device synchronization system or an encrypted vault.

## Capability review

The only plugin is Tauri's **single-instance** plugin. Requirement: prevent independently opened windows/processes from overwriting the same whole-workspace file. Core Tauri does not provide this as a simple config switch. The plugin only routes a second launch to focus the existing window; it adds no JavaScript API or file/shell permissions. It is registered first, per the [official single-instance documentation](https://v2.tauri.app/plugin/single-instance/).

No filesystem, shell, HTTP, SQL, notification or dialog plugin is enabled. Import/export use standard WebView file inputs and downloads, verified in the native app. Native commands accept no path. CSP permits bundled scripts/assets and Tauri IPC, with no remote navigation, frames or external resource origins. Application-local commands follow the [Tauri command boundary](https://v2.tauri.app/develop/calling-rust/).

The undecorated native window needs six explicit core window permissions: close, minimize, toggle maximize, internal toggle maximize (header double-click), read maximized state and start dragging. They are available only to the local main window. `WindowControls.tsx` mounts only in Tauri; browser development remains independent. These bounded OS operations replace the removed system title bar using Tauri's [window customization API](https://v2.tauri.app/learn/window-customization/); no filesystem, shell, remote-origin or window-creation access is added. The window starts maximized and restores to a resizable 1100x720 window with a 375x600 minimum.

## Dependency decisions

- React/TypeScript/Vite: browser-independent UI and production asset build.
- Tauri API/CLI + Rust: small native shell and real app-data persistence.
- Lucide: consistent semantic UI icons; typography/imagery establish identity.
- Fontsource: self-hosted fonts, no online font dependency.
- Native `<dialog>`: browser focus management plus custom dirty-close behavior; Base UI was investigated, but these simple dialogs do not justify another runtime layer.
- CSS transitions instead of Motion: no complex presence/layout choreography is currently required.
- Vitest: domain and storage boundary tests. axe-core and Playwright CLI: real rendered verification. Prettier: consistent source formatting.
- Versioned JSON instead of SQLite: current single-user collection is small and loaded in memory. Add SQLite only when measured query/concurrency needs justify migration and native complexity.

## Limits and extension points

Browser data is single-tab development storage; it has no cross-tab merge protocol. Native is single-instance. Undo snapshots live only in the current session. General Markdown formatting, asset attachments, installed-skill folder indexing, usage history, batch edits, cloud sync and multiwindow editing are not implemented. No simulated activity or proficiency metrics are shown. The Atlas uses deterministic category columns and scrolls at larger widths; virtualization, pan/zoom and large-library performance are not claimed.

An extension should enter through the smallest appropriate owner. Native integrations should add only bounded operations with actual product value. Keep expressive effects removable so native APIs and decoration never determine whether core workflows work.
