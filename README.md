# Skill Archive

A local-first desktop workspace for AI agent skills and instructions. Built with React, TypeScript and Tauri 2, with an editorial print identity drawn from the supplied references.

## Open the app

Run `src-tauri/target/release/bundle/nsis/Skill Archive_0.1.0_x64-setup.exe` to install the app for your Windows user. Then open Start, search for **Skill Archive**, and launch it. Right-click the Start result and choose **Pin to taskbar** for everyday access.

The installer creates a Start shortcut targeting `%LOCALAPPDATA%\Skill Archive\skill-archive.exe` with app identity `com.skillarchive.desktop`. The repository's **Start Skill Archive.cmd** remains a development convenience for opening the release executable without Node or a development server.

Windows outputs:

- `src-tauri/target/release/skill-archive.exe` — standalone application.
- `src-tauri/target/release/bundle/nsis/Skill Archive_0.1.0_x64-setup.exe` — per-user installer.

The app uses the installed Microsoft WebView2 runtime. The installer is locally built and unsigned.

The desktop app opens fitted to the screen without a separate Windows title bar. Drag empty space in its header to move it; double-click to fit/restore, or use the fit icon at the top right. **Window options** (the three dots) offers minimize and close. Drag window edges to resize. The workspace scrolls beneath the fixed header; the Atlas has its own labeled sideways-scrolling map.

The opening page keeps search and the skill list in focus. **Filters** reveals status, category and sort. Select a skill to show its preview, then use **Hide preview** to return to the wider list. Existing saved navigation is restored.

## Develop

Requires Node 22.12+ (tested on 22.21), npm, and, for Windows desktop builds, Rust MSVC plus Microsoft C++ Build Tools and WebView2. The desktop script locates and activates the existing Visual Studio developer environment automatically.

```powershell
npm ci
npm run dev
```

Browser development runs at `http://127.0.0.1:1420`. Stop it before running `npm run desktop`, which starts its own Vite server on the same port.

```powershell
npm run desktop
npm run desktop:build
```

The installed npm 10.9.4 encountered an optional-peer resolver crash while updating dependencies. A one-off `npx --yes npm@11 install` resolved the graph; no global package manager configuration was changed. Prefer the checked-in lockfile with `npm ci` for reproducible installation.

Use the browser development server for visual iterations, and group corrections before running the release build. The size-optimized native release profile performs link-time optimization; even an embedded asset change took about four minutes to rebuild on this machine. Native dev mode is suitable for IPC iteration, followed by one packaged-runtime confirmation after the browser checks pass.

## What works

- Dense index, full dossier, relationship atlas and expressive posters over one collection.
- Search across title, description, tags, category and instructions; category/status/pinned filters and sorting.
- Create and edit Markdown instructions, tags, categories, status and explicit relationships.
- Inline status and pin controls, archive/restore, and 30-step session undo.
- Ctrl/Cmd+K command palette, keyboard index navigation, N/E shortcuts, Ctrl/Cmd+S in the editor, and predictable Escape/focus behavior.
- JSON export and reviewed replacement import; individual Markdown file import into an editable draft.
- Serialized local persistence, visible save errors/retry, and previous-valid backup recovery.
- URL back/forward and last-view restoration; separate local appearance preferences.
- Red, orange and x-ray print plates; comfortable/compact density; full/reduced/disabled effects; OS reduced-motion support.
- Narrow-window navigation drawer and full dossier with keyboard focus containment.

The initial 12 skills are editable **starter examples**. This app does not scan installed skill directories, edit agents' configuration files, or execute instructions. Import your own Markdown instructions to build your actual library.

## Data and recovery

Native data lives in the application's Tauri app-data directory. On this Windows machine that is `%APPDATA%\com.skillarchive.desktop\`:

- `workspace-v1.json` — primary workspace.
- `workspace-v1.backup.json` — previous valid workspace.

Browser development uses `localStorage` keys `skill-archive.workspace.v1` and `skill-archive.workspace.backup.v1`. Browser and native data are intentionally independent; transfer with JSON export/import. The browser adapter is for development/single-tab use. The desktop app prevents multiple concurrent instances.

Invalid stored data is never silently replaced by starter records. Choose **Recover backup**, retry, or import a valid export. Save failure retains in-memory edits and offers retry; export them before closing. Undo is session-only and is not a replacement for a durable export.

Workspace version 1 has a 5 MiB limit and a 10,000-record validation ceiling. This ceiling is not a performance guarantee: large libraries have not been profiled. JSON timestamps use canonical UTC ISO strings, for example `2026-09-16T00:00:00.000Z`. Unknown versions are rejected rather than guessed. Markdown preview supports headings, paragraphs and plain list lines; arbitrary HTML is rendered as text. Rich Markdown and installed-folder synchronization are future work.

## Verify

```powershell
npm run typecheck
npm test
npm run build
npm run desktop:test
npm audit
npx prettier --check src docs package.json tsconfig.json vite.config.ts index.html
```

With the dev server running, use the Playwright CLI (Chrome installed on this machine):

```powershell
npx --yes --package @playwright/cli playwright-cli -s=skillarchive open http://127.0.0.1:1420 --headed
npx --yes --package @playwright/cli playwright-cli -s=skillarchive run-code --filename tests/browser-smoke.cjs
npx --yes --package @playwright/cli playwright-cli -s=skillarchive run-code --filename tests/browser-behavior.cjs
npx --yes --package @playwright/cli playwright-cli -s=skillarchive run-code --filename tests/browser-accessibility.cjs
npx --yes --package @playwright/cli playwright-cli -s=skillarchive run-code --filename tests/browser-layout.cjs
```

These snippets use isolated browser contexts. They must remain bare function expressions because the CLI wraps their text; they are excluded from Prettier's semicolon insertion. Screenshots and test downloads go to ignored `output/playwright/`. Accessibility scans complement manual focus, overflow and screenshot checks; they are not a complete accessibility certification.

Native smoke verification uses `tests/native-smoke.cjs` against a development-only WebView2 debugging port 9233. That port is enabled only by a temporary environment variable during QA, not by the packaged configuration or normal launcher. The test restores the pre-test native workspace after exercising saves/import/export.

`tests/native-window.cjs` checks fit/restore, window-option focus and narrow native WebView layout immediately after a QA launch. Native snippets select the `http://tauri.localhost` page explicitly: a WebView download flyout can create another page ahead of the app. Viewport emulation is cleared after narrow checks; actual OS dragging and resizing require the real desktop window.

## Continue development

Read [project state](docs/PROJECT_STATE.md), [design contract](docs/DESIGN_CONTRACT.md), [UX model](docs/UX_MODEL.md) and [architecture](docs/ARCHITECTURE.md) first. See [verification record](docs/VERIFICATION.md) for what was actually checked.

Supplied photographs are used as private reference assets, not claimed as original artwork. Replace or license them before public redistribution. Fontsource font packages carry their upstream font licenses.
