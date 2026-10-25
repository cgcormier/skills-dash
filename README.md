# Personal skills workbench

A Windows desktop workbench for the actual agent skills in
`%USERPROFILE%\.agents\skills`. Skill folders and their real `SKILL.md` files are
authoritative. React, TypeScript, Vite and Tauri remain the existing stack.

## Current milestone

The feature branch `feature/skill-improvement-v1` adds an opt-in evidence-to-review
lifecycle with Codex CLI proposals, registered pilot behavior checks, checked
publication and recovery. Start with an isolated profile; see
[setup and integration](docs/IMPROVEMENT_V1.md) and
[handoff](docs/IMPLEMENTATION_HANDOFF.md). The original archive's `v1` branch is
separate from this feature release.

Directory discovery, search, metadata inspection, validation, supporting-file
inventory, raw editing, checked per-file saves and recovery export are implemented.
Malformed and inaccessible skills remain visible. Saves use the approved
recoverable publish policy: `SKILL.md` can briefly be absent after the old file is
moved to recovery; publishing refuses to replace any file created during that gap.
Previous content and the draft are retained independently. See [project state](docs/PROJECT_STATE.md) and the
[migration contract](docs/WORKBENCH_MIGRATION.md).

The app manages one personal root. It does not include plugin/system skill roots,
edit supporting files, create/delete skill folders, or
automatically migrate legacy archives. It uses the existing app identifier and
installer name, Skill Archive, to preserve app-data continuity.
Opt-in improvement invokes a restricted Codex reviewer. Imported skill text and
supporting scripts remain inert data.

The interface has a root header, searchable file list and paper dossier/editor.
Ctrl/Cmd+K or `/` focuses search; arrows/Home/End move through list buttons;
Enter opens a file; Ctrl/Cmd+S saves it. Escape returns to the list outside text fields. Switching
files, reloading or closing protects unsaved drafts. Reduced effects and OS
reduced motion work independently. Narrow windows show the list or dossier.

## Develop and verify

Requires Node 22.12+, npm and, for desktop, Rust MSVC, Microsoft C++ Build Tools
and WebView2. The desktop scripts activate the existing Windows compiler.

```powershell
npm.cmd ci
npm.cmd run dev
```

Browser mode at `http://127.0.0.1:1420` has no filesystem access and creates no
starter data. Stop its server before starting the desktop dev command:

```powershell
npm.cmd run profile:init -- my-demo
$env:SKILLS_DASH_TEST_PROFILE = (Resolve-Path .\output\profiles\my-demo).Path
npm.cmd run desktop
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run desktop:test
```

`npm.cmd run desktop:build` produces a standalone executable and NSIS installer.
The fresh executable was run directly against an isolated profile; no installer
was run and the installed application was not replaced. See the
[handoff](docs/IMPLEMENTATION_HANDOFF.md) for artifact paths and verification.

Browser QA uses the Playwright CLI with isolated contexts. Fixtures live only in
test code; they do not prove native integration:

```powershell
npx.cmd --yes --package @playwright/cli playwright-cli -s=workbench open http://127.0.0.1:1420 --browser chrome
npx.cmd --yes --package @playwright/cli playwright-cli -s=workbench run-code --filename tests/workbench-browser.cjs
npx.cmd --yes --package @playwright/cli playwright-cli -s=workbench run-code --filename tests/improvement-browser.cjs
npx.cmd --yes --package @playwright/cli playwright-cli -s=workbench run-code --filename tests/header-browser.cjs
```

Current native tests select `SKILLS_DASH_TEST_PROFILE`; do not redirect
USERPROFILE, APPDATA or LOCALAPPDATA. The staged `tests/improvement-native-*.cjs`
and `tests/improvement-packaged.cjs` scripts attach to QA port 9237 and refuse
the ordinary personal profile. Their cycle fixture includes actual agent tasks
and live model results, so they are not substitutes for routine unit tests.
Enable `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9237` only
for that test process. The port is not enabled in app configuration. Older
`workbench-native*.cjs` scripts remain historical fixtures; use the current
[verification instructions](docs/VERIFICATION.md) and handoff for this feature.
Native unit tests use disposable ignored fixtures, including deliberate junctions.
Vite ignores those fixtures and never follows their links. Keep CLI snippets as
bare function expressions, outside Prettier.

## Legacy data and recovery

**Legacy archive** inspects and exports the primary and previous backup
independently, preserving raw corrupt JSON. It never deletes or replaces stored
data and never converts it to installed skill folders. Export both copies and
review their contents before any future migration decision.

- Native: `%APPDATA%\com.skillarchive.desktop\workspace-v1.json` and
  `workspace-v1.backup.json`.
- Browser: `skill-archive.workspace.v1` and
  `skill-archive.workspace.backup.v1` localStorage keys.

Browser and native copies remain independent. Missing data produces no starter
population. Legacy exports preserve original raw text, including unknown fields.
The legacy bridge has a 5 MiB/UTF-8 read limit; unreadable or oversized data remains
on disk with a visible error, requiring manual file recovery.

Per-file recovery transactions live under
`%APPDATA%\com.skillarchive.desktop\skill-recovery\<folder>\<transaction>\`.
The dossier lists the newest 20 and exports previous/draft versions, including
when an interrupted publication leaves `SKILL.md` missing. Review/export a recovery
version and restore manually, then refresh. No automatic rollback overwrites an
external file. Recovery copies are not automatically pruned.

See [architecture](docs/ARCHITECTURE.md), [UX](docs/UX_MODEL.md),
[design](docs/DESIGN_CONTRACT.md) and [verification](docs/VERIFICATION.md).
