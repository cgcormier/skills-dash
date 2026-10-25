# Project state

## Main integration - October 25, 2026

The primary checkout is `C:\Users\ccorm\skills-dash` on `main`. It now includes
the published workbench migration `e6b81b1` and the previously uncommitted
improvement/UI implementation, committed as `429c3d9`. Both integrations were
fast-forwards. The feature checkout is clean and remains available; all other
branches, worktrees, ignored artifacts and persistent personal data are preserved.
The pre-integration relocation note is retained in [LOCAL_GIT_LAYOUT.md](LOCAL_GIT_LAYOUT.md)
and a named Git stash. Earlier milestone sections below are historical.

Fresh integration checks passed: 59 frontend tests, 48 native tests, production
web build/typecheck, and a clean dependency installation with zero reported
vulnerabilities. The three browser suites passed 42/34/35 assertions. A fresh
Windows release executable and NSIS installer were built from this checkout.
The standalone executable passed 30 packaged checks, duplicate-profile refusal,
three close-guard checks and a live reviewer smoke. The installer completed in
update mode; its installed executable passed the same 30 checks after process
restart, three close-guard checks, nine isolated native save/conflict/recovery/
export checks and 11 read-only checks against all 25 actual personal skill folders.
Both legacy archive files remain byte-identical to their pre-install backups.

The installed payload differs from the standalone executable only in Tauri's
three-byte bundle marker (`UNK` to `NSS`). Exact hashes and application Git tree
IDs are recorded in ignored `output/integration-20261025/build-receipt.json`.
The application source is unchanged from `429c3d9`; the integration follow-up
changes documentation only. Remote publication is confirmed by Git refs in the
final handoff. No personal skill was edited and no worktree was removed.

Skill audit: not applicable; the integration and bundle-marker findings are
project-specific verification facts captured in these docs. Skill file: none.
The optional audit/history helper became unavailable, so the audit was completed
manually and its absence logged through the missing-skill workflow. Existing
checks and ignored QA snippets were reused rather than adding maintained tooling.

## Historical feature milestone - October 24, 2026

Updated October 24, 2026. The current implementation is on
`feature/skill-improvement-v1`, based on `develop` commit
`e6b81b16e42a5fd5e2ab2bc4bf386b9877949ee4`, in the relocated isolated worktree
`C:\Users\ccorm\skills-dash-worktrees\feature-skill-improvement-v1`.
The feature adds an opt-in skill improvement lifecycle to the personal skills
workbench. Source changes remain local; this record does not claim a commit,
remote publication, installer execution, or installed-copy update.

Completed final checks: 59 frontend tests (including 35 lifecycle/core tests),
typecheck, 48 native tests, 33 baseline browser assertions and 31 feature browser
assertions. A clean `npm.cmd ci` succeeded with zero reported vulnerabilities.
The final `npm.cmd run desktop:build` produced the release executable and NSIS
installer. The executable passed 30 packaged checks, a three-assertion close-guard
test, duplicate-profile refusal, a live reviewer smoke, and another actual process
restart with all five reports and recovery history retained. The complete actual
agent-to-review-to-publication cycle is demonstrated; scope limits remain explicit.
See [verification](VERIFICATION.md) and [handoff](IMPLEMENTATION_HANDOFF.md).

## Small UI refinements - October 24, 2026

A subsequent presentation pass keeps the ink/paper layout, fonts and print accent.
The header uses a readable title, a Skills folder label and grouped actions that
fit a two-column toolbar in narrow windows. The file list names its counts, shows
filtered matches and provides a keyboard-accessible Clear search action that
returns focus to search. Healthy status text is neutral; actual problems retain
warning text and tint. Small file labels are larger, focus colors suit dark and
paper surfaces, and paper forms use native light controls. Settings keep their
title/close control visible while scrolling, with focused fields below the pinned
header. Effective mode and reviewer rationale now have explicit labels.

Verified for this pass: 59 frontend tests, typecheck and production web build;
42 workbench, 34 improvement and 35 header browser assertions. The browser
checks cover search clearing/empty results, at least 3:1 focus contrast, visible
settings focus, narrow layouts, independent reduced effects/motion and zero axe
violations in the checked list, dossier and settings states. Screenshots are in
ignored `output/playwright/`. Browser fixtures do not establish native integration.
The native/packaged checks described elsewhere on this page predate these UI
changes; the desktop executable and installer have not been rebuilt for this pass.

## Motion and UX planning resources

The [brainstorming prompt](MOTION_UX_BRAINSTORM_PROMPT.md) applies the global
`motion-relationships` skill to eight explicit partitions, from a single control
to structural alternatives for the whole app. The skill defaults to a structured
report. The prompt defines observation, divergent ideas, critique and synthesis
before selecting a small coherent package. Creating these planning resources
does not implement an animation redesign or complete the proposed app review.

## Mission and implemented behavior

A desktop workbench for actual personal skills in `%USERPROFILE%\.agents\skills`,
currently `C:\Users\ccorm\.agents\skills`. Folders and real `SKILL.md` files are
authoritative. Plugin/system roots, arbitrary skill roots, supporting-file editing
and general agent execution are excluded. The opt-in feature invokes only its
restricted Codex reviewer; imported skill text and supporting scripts stay inert.

### Opt-in improvement v1

- Recording starts disabled. A global master switch dominates per-skill Off,
  Observe, Propose and Auto-update modes. First activation defaults to Propose,
  five distinct task applications, ten review attempts per UTC day and a
  120-second timeout. The demonstration used a threshold of one and later restored
  five; it did not change the production defaults.
- Participating agents load a personal `SKILL.md`, hash the exact raw bytes, finish
  a real task, then submit one factual v1 report per skill/request through
  `npm.cmd run report:use -- --profile <explicit profile> --input <report.json>`.
  Stable source/task keys consolidate retries and subagents. Maintenance and
  validation runs do not count toward task eligibility. The reporter only writes
  a durable inbox; a receipt means pending desktop import, not review or publication.
- TypeScript owns policy, eligibility, immutable evidence snapshots, the global
  review slot, attempts, decisions and publication recovery. The desktop is the
  authoritative lifecycle writer. Native adapters persist immutable synced
  generations with an exclusive lock and compare-and-swap checks, outside every
  skill file and separate from the existing `skill-history.sqlite3` ledger.
  Corrupt or conflicting storage remains visible and blocks writes.
- The native runner invokes the installed Codex CLI directly with a fixed
  `gpt-6.1-sol` model and `ultra` effort, read-only sandbox, bounded empty work
  directory, strict output schema, restricted environment and disabled tool
  features. Output indicating tool activity is rejected. A Windows job controls
  the suspended child and its process tree. Codex CLI 0.164.0 is the verified
  version; its exposed tool metadata is not a claim that tool use is allowed.
- Propose retains a diff for explicit approval. Auto-update additionally requires
  an independently registered pilot behavior procedure to pass candidate holdouts
  and fail at least one baseline holdout. A proposal alone is not improvement
  proof. Manual approval cannot bypass a failing registered check. Insufficient
  evidence and no-change are visible outcomes; the same insufficient snapshot
  does not automatically loop.
- Publication rechecks policy and exact source revision, journals intent, then
  uses the existing checked per-file save. Recovery compares actual source bytes
  with old/proposed revisions without blindly repeating a save. Restoration is
  another checked write and refuses a newer external revision.
- An initialized `SKILLS_DASH_TEST_PROFILE` isolates disposable skills, lifecycle
  data and WebView preferences. Participating reporters select that same absolute
  profile explicitly. Invalid profiles fail closed before ordinary data access;
  ordinary runs retain the fixed personal root. The feature does not select a
  profile by overriding `USERPROFILE` or `APPDATA`.

See [setup, reporting and extension points](IMPROVEMENT_V1.md) for the implemented
contract and deferred work.

### Retained personal workbench

- Fixed-root discovery, diagnostics, searchable list and paper dossier/raw editor.
- Real paths, disk modified times, YAML metadata and supporting-file inventory.
  Malformed/inaccessible skills remain visible; unknown metadata, comments and
  unchanged raw spans are preserved. Viewing never executes content or scripts.
- Per-file explicit saves compare the exact opened revision under Windows
  handles excluding external writes/deletes. The approved recoverable publication
  refuses to overwrite any file/link created during its brief missing-file gap.
- Synced previous/draft copies and preparation/move/publication records provide
  visible recovery after success, conflicts and interruption. Newest-20 recovery
  inventory and raw exports work even when `SKILL.md` is missing. Restoration is
  manual; no automatic rollback overwrites newer external content.
- Windows guards reject path escapes, junctions/symlinks, hardlinks, read-only/EFS
  sources and unsafe permission handling. Source/recovery must share a volume.
  Recovery/stage files preserve source DACL restrictions before bytes are written.
- Dirty navigation/reload/native-close guards, focus-based external-change checks,
  explicit save/error feedback, keyboard access, narrow layout and reduced effects.
- Legacy primary/backup independently inspectable/exportable, including raw
  corrupt JSON. No storage deletion or automatic migration; native archive writes
  retired. Existing app identifier/paths are preserved.
- Atlas, Posters, category navigation, relationship/lifecycle editing,
  whole-workspace saves/undo and excessive appearance controls retired.
  Starter records are test-only; photos are unused, not deleted.
- Stack retained. Added YAML parsing and bounded Windows security API features;
  removed unused direct `time` dependency. Vite ignores security fixtures/build
  outputs and does not follow their deliberate junctions.

## Approved deviation from initial atomic-write target

Real Windows tests showed excluding external replacement also blocks atomic
replacement, including a POSIX-semantics rename probe (sharing error 32). The user
chose strict refusal during a race, accepting a brief missing-file interval.
Implemented behavior therefore uses handle-based move followed by no-replace
publication, with durable recovery copies. It is not an atomic replacement.
See `ARCHITECTURE.md` for the precise guarantees and limitations.

The planned phases were discovery; checked writes; archive UI retirement;
documentation/tooling cleanup. UI retirement advanced while write policy was
pending, preserving legacy storage throughout; the approved write protocol then
completed. No legacy content is assumed migrated or safe to delete.

During that migration, the side conversation's `proposed_changes.md` was read as
discussion/context, preserved unchanged and not adopted as requirements. Draft
autosave, alternative per-skill save schemes and Git integration remained
proposals at that handoff. The later opt-in lifecycle described above is a
separate implementation; its generation store does not replace the approved
per-file publication protocol.

## Current verification

- 48 native tests passed for the guarded file workbench, isolated profile,
  lifecycle persistence and reviewer boundaries.
- The full frontend suite passed 59 tests, including 35 improvement core tests.
  Typecheck, formatting, whitespace checks and a clean dependency install passed.
- Baseline browser QA passed 33 assertions; improvement browser QA passed 31.
  These use isolated test-only IPC fixtures and do not establish native behavior.
- Actual agent tasks produced launch-note slugs and content-index tags while the
  app was closed, with exact loaded source hashes and durable reporter receipts.
  The running native app imported the initial reports and used live Codex reviews.
- Slugs in Propose passed registered validation and waited without changing the
  source until explicit manual approval applied the proposal.
- Tags first returned visible insufficient evidence and did not retry the same
  snapshot. A second distinct requested release-index task supplied another
  factual report; the eligible live review then validated and auto-published the
  uniqueness change.
- A subsequent real documentation-content-pack task freshly loaded both revised
  files. Its slugs and unique lowercase sorted tags matched the requested outputs.
  Its reported hashes matched the exact proposed-content hashes. The packaged
  native process loaded all five observations and five imported receipts, with
  three review decisions retained.
- Fresh Windows release packaging produced `src-tauri/target/release/skill-archive.exe`
  and `src-tauri/target/release/bundle/nsis/Skill Archive_0.1.0_x64-setup.exe`.
  After every debug process was confirmed stopped, release process 39120 loaded
  the expected history, settings and published source revisions. The installer
  was not run. An earlier restart attempt was invalid because an old debug
  process survived Close; the later packaged-process check supersedes it.
- Actual packaged recovery restored both pilot files to their exact original
  bytes through checked saves and retained the replaced proposals in recovery
  copies. A deliberately newer test marker first caused stale restoration to
  refuse while preserving that marker; a checked save removed only the owned
  marker before the separate restore. The isolated profile was left globally Off.
- `tests/improvement-packaged.cjs` passed 30 repeatable final checks. Native
  keyboard focus survived 15 Tab presses, Ctrl+K and Escape; 390/768/1280 layouts
  had no page overflow, and reduced effects/motion checks passed. Early harness
  locator and asynchronous-checkbox timing failures were corrected before the
  passing run; they are not counted as product failures or extra task uses.
- The final rebuild includes cancellation with blocked storage, retry evidence,
  durable recovery intent, the native Close permission, and a lifetime profile
  lease. Process 18244 passed the packaged checks and live smoke. A duplicate
  profile process exited with the expected refusal. The close-guard test passed
  three assertions with controlled confirmation answers and real native IPC.
  After its OS process exited, process 45188 passed the packaged checks again.
  Both final test processes were closed normally; no installer was run.

The real task outputs and receipts are under `output/agent-tasks/initial`,
`output/agent-tasks/second-index` and `output/agent-tasks/revised-use`. These are
ignored local evidence, not shipped skill contents. No monetary savings or cost
estimate is inferred from the reviewer token telemetry.

## Historical personal workbench verification — October 18

The original fixed-root migration used
`C:\Users\ccorm\.codex\worktrees\8ace\skills-dash` and was later handed off on
`simplified` from `01e0da8`. The following counts describe that earlier milestone,
not additional passes for the current feature.

- 19 frontend tests; production build/typecheck and formatting/whitespace checks.
- 33 isolated browser assertions, including conflicts, draft/recovery exports,
  missing-file recovery, dirty navigation, keyboard/focus and 375/390/768/1440
  layouts. Two narrow accessibility states have zero axe violations.
  Visual reduction and OS motion reduction are verified independently.
- 25 native filesystem tests on disposable Windows fixtures: success/reload,
  stale/deleted sources, file/junction gap races, interruption/partial-copy
  diagnostics, locked handles, raw/BOM preservation and protected DACL copies.
- 11 actual Tauri WebView read-only assertions against the real personal root:
  all 25 folders discovered, actual raw file/path/supporting inventory and legacy
  recovery surface verified without installed content changes.
- 9 actual Tauri WebView save/reload/conflict/recovery assertions against a
  disposable process profile. CRLF, supporting inventory, previous/draft recovery
  bytes, recovery download and unchanged legacy copies verified; fixture restored.

That historical test process set `USERPROFILE`, `APPDATA` and `LOCALAPPDATA` to its disposable
profile. Creating its normal AppData directories and setting APPDATA explicitly
was required for Windows known-folder resolution. These are process-only values,
not user configuration changes. Temporary WebView debug port is QA-only.

## Remaining release limits

- The final release executable includes the verified lifecycle fixes and was
  tested directly. The NSIS installer has not been run and the installed copy
  was not updated.
- Only the registered disposable pilot procedures can qualify an automatic
  publication. Broader skill quality, additional providers, supporting-file edits,
  broader roots, closed-app review and automatic retention/pruning are deferred.
- Non-Windows filesystem behavior fails closed. Physical cross-volume rejection
  and EFS-encrypted fixtures were unavailable; same-volume Windows behavior and
  the EFS refusal predicate were tested. Physical power-loss durability is not
  certified. Recovery transactions are not automatically pruned.
- File copies freeze source DACL inheritance against their new parent; original
  moved content keeps its descriptor/streams. Published alternate streams and
  full filesystem metadata preservation are not claimed.
- Large-library performance and physical dragging/resizing remain unverified.
  Process exit and relaunch with retained feature state were verified above.
- Legacy primary/backup content still needs user review before a future migration
  or deletion decision. Recovery/export stays available until then.

The October 18 skill audit found no additional skill capture necessary because
the project-specific filesystem guarantees and checks belonged in docs/tests.
Current feature audit/history is consolidated by the coordinating task; this
documentation maintenance is not a pilot task application.
