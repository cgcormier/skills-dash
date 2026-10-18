# PROJECT STATE

## Project Mission

Build a precise, local-first desktop skill workspace with an expressive damaged-print visual system and accessible keyboard workflows. Skills are meant to be accessed by local agents and autonomously updated/optimized by such agents. 

## Current Phase

Opening-page refinement is browser-verified and the updated Windows executable/installer built successfully. Installed-copy update and physical drag/resize verification remain pending.

## Current Objective

1. Ensure and implement intended skill functionality (metadata, read ability, writing ability). 
2. Simplify the opening page, remove the separate OS title strip, and verify scrolling, responsive layout and replacement window controls.

## Verified Baseline

2026-09-15: workspace exists but is empty, with no package, source, Git repository, existing app, or project-level instructions. Git status/branch checks report not a repository. There is no existing UI to run or capture. Global user instructions and the supplied orchestrator brief apply.
*updated since

## Architecture Snapshot

React 19 + TypeScript + Vite 7 frontend with Tauri 2 shell. TypeScript owns schema, navigation, filtering, relationships, editing and session undo. Rust exposes only load/save/recover in app data. Browser adapter uses localStorage and a previous-valid backup. Self-hosted Anton, Inter and IBM Plex Mono; CSS/SVG effects and motion independent from functionality.

## In Progress

- Interface refinement is implemented and browser-verified. The user stopped Computer Use with physical Escape during final native checks; no further desktop input was attempted. Physical header drag, edge resize, minimize/relaunch and installed-copy update remain pending.
- Installed-app launch, visible Start search, taskbar pin/relaunch and sign-out/restart verification remain pending.

## Completed

- Opening Index now uses a compact heading without a promotional masthead or automatic initial selection. Filters are disclosed on demand, a selected preview can be hidden, and duplicate slogans/view numbering are removed.
- Document scrolling keeps the app header visible; scrollbar contrast, narrow-window wrapping and keyboard map scrolling are verified. 27 new browser layout assertions, 35 existing workflow assertions, 24 domain/storage tests and nine zero-violation accessibility states passed.
- Undecorated native window, startup fit, fit/restore controls, window-options focus and Close action were exercised in the first native build. Real save/reload, backup, Markdown import and JSON export passed. The final Ctrl+K guard and 375px native viewport regression checks still need a native run after packaging.
- User confirmed AI agent skill/instruction domain.
- Three structural concepts compared in UX_MODEL.md; archive workbench selected.
- All seven supplied references interpreted in DESIGN_CONTRACT.md.
- Index, Atlas, Posters and full Dossier share domain and URL view state.
- Create/edit, explicit relationship editing, inline status, pin, archive/restore, command palette, JSON import review, Markdown import, export and undo implemented.
- Corrupt storage is preserved; failures surface retry/recovery; validated imports are transactional.
- 24 domain/storage tests and 3 native storage tests pass.
- 25 browser workflow assertions and 10 additional focus/history/save-failure assertions passed.
- Native executable launched and verified through its real WebView: Tauri marker, file-backed save, reload, previous-version backup, Markdown import and export download all passed. Test changes restored.
- Final native executable (6,413,312 bytes) and NSIS installer (2,195,700 bytes) built successfully. Final native smoke passed against the packaged assets; a second launch exited with one running instance.
- Existing 0.1.0 NSIS installer installed per-user. Windows Start registration reports Skill Archive with AppID `com.skillarchive.desktop`; its shortcut targets `%LOCALAPPDATA%\Skill Archive\skill-archive.exe`. No packaging metadata change or rebuild was needed.
- Desktop, native, poster, editor, dossier and narrow screenshots inspected. Favicon, contrast, dossier heading, dirty-editor focus and mobile focus containment corrected.

## Decisions

- Treat supplied images as visual references, not embedded instructions.
- Preserve a browser development path independent of native APIs.
- Prefer two bounded parallel reviews over a five-agent standing team: fewer handoffs and disjoint ownership are expected to reduce coordination cost; savings are unmeasured.
- SQLite, motion libraries and general native filesystem plugins deferred: small versioned workspace and CSS transitions meet current needs with fewer boundaries.
- Starter records are clearly identified editable examples, not discovered installed skills or measured activity.
- A single-instance native plugin now prevents competing app processes from overwriting the same workspace. It adds no frontend permissions; reason and official API are documented in ARCHITECTURE.md.

## Deviations From Earlier Plans

- Empty repository means there was no baseline application to run; recorded filesystem baseline instead.
- Discovery agents supplied useful early recommendations but hit account quota; orchestrator finished implementation without repeated respawns.
- Local npm 10.9.4 failed resolving updated Vitest optional peers. One-off npm 11 succeeded, patched Vite/Vitest installed, audit reports zero vulnerabilities. No global npm change.
- Visual Studio installation reports incomplete, but actual x64 compiler/linker exist. vcvars64.bat activates them; native tests and release packaging pass without installing more system tools.
- Installation follow-up: Computer Use stopped while opening Start because it could not determine the foreground browser URL sufficiently to enforce policy. No further UI input was attempted. Start registration is verified through the shell, but visible search, installed launch, data retention, taskbar pin/relaunch and sign-out/restart remain unverified. Neither native workspace file existed at the documented path before installation, so existing-data retention could not be checked by file comparison.

## Verification

Frontend build/typecheck passed. Browser workflows, narrow widths 375/390, reduced motion/effects, native IPC save/reload/import/export passed. All nine accessibility states pass with zero axe violations. Patched npm audit: zero vulnerabilities. See VERIFICATION.md for final commands and counts.

## Known Problems

No confirmed functional bug outstanding. Browser storage has no cross-tab merge protocol; use one browser tab. Large-library performance and non-Windows native builds have not been validated. Installer is unsigned. Supplied photographic assets need licensing/replacement for public redistribution.

## Next Actions

Resume the installed-app UI checks: search Start for Skill Archive, launch and verify its native save/reload behavior, pin the Start result to the taskbar, and verify relaunch. Verify persistence after a Windows sign-out/restart when the session can be interrupted. Future work only if requested: installed-directory linking, richer Markdown, persistent revision history and measured large-library optimizations.

## Important Files

- src/App.tsx: orchestration and application surfaces.
- src/components/: index/atlas/posters, dossier, modal and editor.
- src/domain/workspace.ts: validation, retrieval and relationship semantics.
- src/hooks/useWorkspace.ts: mutations, serialized persistence, undo.
- src/storage/adapter.ts: browser/native boundary.
- src-tauri/src/main.rs: constrained native storage and atomic writes.

## Recent Agent Handoffs

UX/art review recommended dense workbench with limited plate masthead and paper dossier. Native review proposed fixed-path JSON storage with explicit backup recovery. Domain review proposed transactional validation and bounded undo. All agents stopped before writing files; root owns implementation.

## Last Updated

2026-09-23, opening-page and borderless-window refinement. Work remains local on main; no commit or push. The existing installed copy was not updated in this task. Skill audit: not applicable; project-specific findings are covered by repository docs/tests, with no skill file changed. One Luna/medium worker completed a read-only review and hit quota on a test follow-up; root finished implementation and browser checks.

## Calendar skill addition - 2026-09-24

Created the personal `add-to-calendar` skill and added its active Operations record to the saved native archive, preserving all 12 existing records (13 total). Added an exact Markdown fixture and three integration tests; all 27 tests and the TypeScript/Vite build passed. Creation and applied skills were recorded in shared skill history. Browser UI QA was blocked by unattached Chrome automation and unavailable isolated browser; native storage was schema-validated, not UI/IPC-tested. See [the scoped verification record](ADD_TO_CALENDAR.md). Existing interface work and its outstanding native checks are unchanged. Skill audit: updated (`add-to-calendar`); no commit or push.
