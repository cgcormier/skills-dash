# PROJECT STATE

## Project Mission

Build a precise, local-first desktop skill workspace with an expressive damaged-print visual system and accessible keyboard workflows.

## Current Phase

Verified Windows desktop release and browser development build ready for handoff.

## Current Objective

Maintain the verified archive workbench; use the documented architecture and design contract for future changes.

## Verified Baseline

2026-09-15: workspace exists but is empty, with no package, source, Git repository, existing app, or project-level instructions. Git status/branch checks report not a repository. There is no existing UI to run or capture. Global user instructions and the supplied orchestrator brief apply.

## Architecture Snapshot

React 19 + TypeScript + Vite 7 frontend with Tauri 2 shell. TypeScript owns schema, navigation, filtering, relationships, editing and session undo. Rust exposes only load/save/recover in app data. Browser adapter uses localStorage and a previous-valid backup. Self-hosted Anton, Inter and IBM Plex Mono; CSS/SVG effects and motion independent from functionality.

## In Progress

- No implementation work pending.
- Final verification and workflow audit complete.

## Completed

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

## Verification

Frontend build/typecheck passed. Browser workflows, narrow widths 375/390, reduced motion/effects, native IPC save/reload/import/export passed. All nine accessibility states pass with zero axe violations. Patched npm audit: zero vulnerabilities. See VERIFICATION.md for final commands and counts.

## Known Problems

No confirmed functional bug outstanding. Browser storage has no cross-tab merge protocol; use one browser tab. Large-library performance and non-Windows native builds have not been validated. Installer is unsigned. Supplied photographic assets need licensing/replacement for public redistribution.

## Next Actions

Use Start Skill Archive.cmd or the installer. Future work only if requested: installed-directory linking, richer Markdown, persistent revision history and measured large-library optimizations.

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

2026-09-15, final packaged Windows runtime confirmed. Work is local on main; no commit or push was made by this task. Skill audit: not applicable; no skill file changed because canonical repository docs cover the verified procedures.
