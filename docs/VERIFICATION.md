# Verification record

## Interface refinement — 2026-09-23

Latest source: compact opening heading, no promotional masthead, on-demand filters and preview, consistent accessible tab names, visible scrollbars and sticky app header. Native window permissions are reviewed in ARCHITECTURE.md.

- `npm test`: 24 passing domain/storage cases.
- `tests/browser-layout.cjs`: 27 passing assertions covering fresh selection, filters, preview focus/history, 375x600, 390x844, 768x600 and 1280x720 layouts, keyboard reachability, header visibility, narrow dossier, map scrolling and reduced effects/motion.
- Updated browser smoke/behavior: 25 + 10 assertions passed. Accessibility: zero axe violations in nine states.
- Browser production build/typecheck and formatting passed. Desktop/narrow screenshots (`cleanup-desktop.png`, `cleanup-375.png`) were opened and inspected.
- First native build: startup fit, restore/maximize IPC, window-options focus and Close action were exercised. The actual app was visually inspected without the separate OS title strip. Native save/reload, backup, Markdown import and JSON download passed; native test data was restored.
- Physical header dragging, edge resizing and minimize/relaunch remain unverified. Early interaction attempts encountered a WebView download flyout. The user then stopped Computer Use with physical Escape; no further desktop input was attempted.
- The final native-window test adds a Ctrl+K modal-guard assertion and a 375px WebView viewport check, clearing emulation afterward. These additions still require a native run on the final package and are not counted as passed above.
- The installed copy has not been updated. Earlier binary sizes and installed-app notes below describe the original release.
- Final `npm run desktop:build`: passed after the Ctrl+K guard change. Updated outputs are `src-tauri/target/release/skill-archive.exe` and `src-tauri/target/release/bundle/nsis/Skill Archive_0.1.0_x64-setup.exe`. The final package has not been installed or rerun natively after Computer Use was stopped.

Native snippets select the `http://tauri.localhost` page explicitly: a download flyout can become the first CDP page. This was verified during export QA and is captured in the existing project tests/docs.

Skill audit: **not applicable**. Skill file: **none**. Existing skills cover the workflow; project tests/docs capture the native findings without another skill. One Luna/medium worker completed a read-only review, then hit quota on its test follow-up. Root completed implementation and browser checks. Peak active agents: two; token/cost telemetry unavailable. The efficiency review favored existing CLI checks and one bounded reviewer over additional agents or a new QA framework; savings are unmeasured.

## Original release — 2026-09-15

Verified on Windows 11, Node 22.21, Rust 1.94 MSVC, Chrome and the native WebView2 runtime, September 15, 2026 (local time).

## Checks

| Surface                                 | Evidence                                                                                                 | Result                                                                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript and browser production build | `npm run build`                                                                                          | Pass; all source typechecked, bundled JS about 277 kB / 87 kB gzip                                                                                                                |
| Domain and browser storage              | `npm test`                                                                                               | 24 passing cases: schema/version/IDs, canonical timestamps, Unicode size, query/filter semantics, link cleanup, backups/corruption/quota errors                                   |
| Native storage                          | `npm run desktop:test`                                                                                   | 3 passing cases, including canonical timestamp and UTF-16 validation plus atomic backup/corruption handling                                                                       |
| Browser workflows                       | `tests/browser-smoke.cjs`                                                                                | 25 assertions passed; isolated context                                                                                                                                            |
| Focus/history/error recovery            | `tests/browser-behavior.cjs`                                                                             | 10 assertions passed; isolated context                                                                                                                                            |
| Accessibility                           | `tests/browser-accessibility.cjs`                                                                        | Zero axe violations in 9 states: index, atlas, posters, palette, preferences, editor, full dossier, mobile index and mobile drawer                                                |
| Narrow widths                           | 375 and 390 CSS px                                                                                       | No page-level horizontal overflow; full-effects and reduced-effects screenshots inspected                                                                                         |
| Native runtime                          | `tests/native-smoke.cjs` against a temporary QA-only CDP port                                            | Real Tauri marker and saved-local status; create writes native file, reload persists, previous backup exists, Markdown file import and JSON download work; original data restored |
| Windows packaging                       | `npm run desktop:build`                                                                                  | Final executable and NSIS installer built; latest bundled stylesheet confirmed in native WebView; second launch exits with one running instance                                   |
| Dependencies                            | `npm audit`                                                                                              | Zero reported vulnerabilities                                                                                                                                                     |
| Formatting                              | `npx prettier --check src docs README.md AGENTS.md package.json tsconfig.json vite.config.ts index.html` | Pass                                                                                                                                                                              |

## Browser assertions exercised

There is no separate linter configured; strict TypeScript and formatting checks are provided instead. `npm ci --dry-run --ignore-scripts` also passed with the installed npm 10 using the dependency lockfile.

Initial sample data; multi-term body/metadata search; empty result; collection/status filters; pin/undo; create and reload persistence; dirty-close warning and Ctrl+S; dossier rendering; archive/restore; real atlas links; shared posters; keyboard palette; effects-none and reduced motion; JSON download; malformed import rejection; import cancel; replacement and undo; Markdown review; narrow index/dossier; corrupt-storage preservation and backup recovery; zero runtime exceptions.

Additional checks inject a quota failure and verify current edits remain available, then retry and read the saved result. History back/forward and view restoration are checked. Arrow navigation, Enter opening the selected dossier, drawer Tab containment and Escape focus restoration are checked.

## Visual evidence

Ignored artifacts in `output/playwright/` include:

- `index-desktop.png`, `native-desktop.png`
- `index-mobile-full-effects.png`, `index-mobile.png`, `dossier-mobile.png`
- `dossier.png`, `editor.png`, `atlas.png`, `posters.png`
- `empty.png`, `storage-error.png`, `reduced-effects.png`

Screenshots were opened and inspected, not merely generated. Some workflow screenshots contain explicitly named temporary QA records; isolated browser contexts were closed, and native data was restored. The default delivery screenshots show the 12-record starter collection.

## Corrections found through verification

- Missing favicon request.
- Dirty-editor “Keep editing” action needed to restore focus for Ctrl+S.
- Dossier needed a level-one heading.
- Metadata, keyboard-hint and selected-atlas text needed higher contrast.
- Mobile drawer needed focus containment, focus restoration, an explicit close button and hidden offscreen controls.
- Updated npm optional-peer resolution required a newer one-off npm executable; no peer-check bypass or global package-manager replacement.
- The existing C++ toolchain needed `vcvars64.bat`; filesystem inspection and a real build overruled the incomplete installer status.

## Installed-app follow-up

The existing `Skill Archive_0.1.0_x64-setup.exe` ran with `/S` and registered version 0.1.0 under the current user's uninstall registry. The installed executable exists at `%LOCALAPPDATA%\Skill Archive\skill-archive.exe` (6,413,312 bytes). `Get-StartApps` returns **Skill Archive**, AppID `com.skillarchive.desktop`. The Start Menu shortcut targets that installed executable with no arguments. No installer metadata changes or rebuild were needed.

Computer Use stopped while opening Start because it could not determine the foreground browser URL sufficiently to enforce policy. No further UI input was attempted. Visible Start search, launch from Start, installed native save/reload, taskbar pin/relaunch and sign-out/restart verification remain pending. Neither `workspace-v1.json` nor `workspace-v1.backup.json` was present at the documented native data path before or after installation; existing-data retention was therefore not verified. Earlier native-runtime results above describe the repository executable, not this installed-copy check.

## Limits

Automated accessibility checks are not a full assistive-technology audit. Windows executable/runtime tested; other operating systems not built. Per-user installation and Start registration are verified; installed UI checks listed above and uninstallation are not exercised. The installer is unsigned. Browser multi-tab synchronization and large-library performance are not tested or claimed. User-supplied photographic assets are not cleared for public redistribution. No installed-skill directory scan or live agent configuration synchronization is implemented.

## Workflow audit

Skill audit: **not applicable**. Skill file: **none**. The verified project-specific art, build and QA rules are already captured in the design contract, README and repository AGENTS.md; adding a separate skill would duplicate them. The skill-hierarchy helper recorded the assessment and efficiency review. Both applied skills were recorded once in the shared usage ledger.

## Delivered outputs

- Executable: 6,413,312 bytes; src-tauri/target/release/skill-archive.exe.
- NSIS installer: 2,195,700 bytes; src-tauri/target/release/bundle/nsis/Skill Archive_0.1.0_x64-setup.exe.
- Final native smoke passed after the last release build. Temporary native QA records were removed from the primary and backup data.
- Native app is relaunched without the temporary debugging-port environment; normal launch exposes no QA port.
