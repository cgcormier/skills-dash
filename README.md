# Personal skills workbench

A Windows desktop workbench for the actual agent skills in
`%USERPROFILE%\.agents\skills`. Skill folders and their real `SKILL.md` files are
authoritative. React, TypeScript, Vite and Tauri remain the existing stack.

## Current milestone

Directory discovery, search, metadata inspection, validation, supporting-file
inventory, raw editing, checked per-file saves and recovery export are implemented.
Malformed and inaccessible skills remain visible. Saves use the approved
recoverable publish policy: `SKILL.md` can briefly be absent after the old file is
moved to recovery; publishing refuses to replace any file created during that gap.
Previous content and the draft are retained independently. See [project state](docs/PROJECT_STATE.md) and the
[migration contract](docs/WORKBENCH_MIGRATION.md).

The app manages one personal root. It does not include plugin/system skill roots,
execute agents or scripts, edit supporting files, create/delete skill folders, or
automatically migrate legacy archives. It uses the existing app identifier and
installer name, Skill Archive, to preserve app-data continuity.

The interface has a root header, searchable file list and paper dossier/editor.
Ctrl/Cmd+K or `/` focuses search; arrows/Home/End move through list buttons;
Enter opens a file; Ctrl/Cmd+S saves it. Escape returns to the list outside text fields. Switching
files, reloading or closing protects unsaved drafts. Reduced effects and OS
reduced motion work independently. Narrow windows show the list or dossier.

## Develop and verify

Requires Node 22.12+, npm and, for desktop, Rust MSVC, Microsoft C++ Build Tools
and WebView2. The desktop scripts activate the existing Windows compiler.

```powershell
npm ci
npm run dev
```

Browser mode at `http://127.0.0.1:1420` has no filesystem access and creates no
starter data. Stop its server before starting the desktop dev command:

```powershell
npm run desktop
npm run typecheck
npm test
npm run build
npm run desktop:test
```

`npm run desktop:build` produces an executable and NSIS installer. Packaging and
installed-copy behavior need separate verification for this milestone; historical
installers do not contain these source changes. Use development mode for review.

Browser QA uses the Playwright CLI with isolated contexts. Fixtures live only in
test code; they do not prove native integration:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=workbench open http://127.0.0.1:1420 --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=workbench run-code --filename tests/workbench-browser.cjs
```

`tests/workbench-native.cjs` attaches to a development WebView debug port 9233 for
read-only actual-root checks. `tests/workbench-native-write.cjs` refuses to run
outside the isolated `output/native-ipc-profile/.agents/skills` fixture. Launch
the native executable with `USERPROFILE` overridden only for that process to the
disposable profile while the dev server runs. Also set its process-only `APPDATA`
and `LOCALAPPDATA` to existing `AppData\Roaming` and `AppData\Local` directories
under that profile; Windows known-folder lookup otherwise fails. The test uses production commands;
no alternate-root API is added. Enable the port only in the QA process with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9233`; it is not
enabled in app configuration. Native unit tests use disposable ignored fixtures,
including deliberate junctions. Vite ignores those fixtures and never follows
their links. Keep CLI snippets as bare function expressions, outside Prettier.
The fixture setup commands are in [verification](docs/VERIFICATION.md).

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
