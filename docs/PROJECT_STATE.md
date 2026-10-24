# Project state

Updated October 23, 2026. The October 18 implementation has been placed on
branch `simplified` from baseline `01e0da8` for review, commit and publication.
The original implementation used managed worktree
`C:\Users\ccorm\.codex\worktrees\8ace\skills-dash`; that temporary checkout
is scheduled for removal after verified publication. The primary `main` checkout
and its unrelated local changes are preserved. No installer update or installed
personal skill content write occurred. October 18 verification below is historical;
publication checks passed: 19 frontend tests, production build/typecheck and
25 native filesystem tests. Browser/WebView checks were not rerun in this handoff.

## Mission and implemented behavior

A desktop workbench for actual personal skills in `%USERPROFILE%\.agents\skills`,
currently `C:\Users\ccorm\.agents\skills`. Folders and real `SKILL.md` files are
authoritative. Plugin/system roots, multiple roots and agent execution are excluded.

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

The side conversation's `proposed_changes.md` was read as discussion/context,
preserved unchanged and not adopted as additional requirements. Manual saves,
explicit conflicts and recovery match the selected direction. Draft autosave,
cooperative writer helpers, version pointers and Git integration remain proposals;
none were added or used to authorize Git operations.

## Verification

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

The test process sets `USERPROFILE`, `APPDATA` and `LOCALAPPDATA` to its disposable
profile. Creating its normal AppData directories and setting APPDATA explicitly
was required for Windows known-folder resolution. These are process-only values,
not user configuration changes. Temporary WebView debug port is QA-only.

## Remaining release limits

- Packaged executable/installer and installed-copy update were not verified or
  performed. Existing release artifacts still contain the old archive app.
- Non-Windows filesystem behavior fails closed. Physical cross-volume rejection
  and EFS-encrypted fixtures were unavailable; same-volume Windows behavior and
  the EFS refusal predicate were tested. Physical power-loss durability is not
  certified. Recovery transactions are not automatically pruned.
- File copies freeze source DACL inheritance against their new parent; original
  moved content keeps its descriptor/streams. Published alternate streams and
  full filesystem metadata preservation are not claimed.
- Large-library performance and physical drag/resize/relaunch remain unverified.
- Legacy primary/backup content still needs user review before a future migration
  or deletion decision. Recovery/export stays available until then.

Skill audit: not applicable; repository-specific filesystem guarantees and
verification procedures belong in docs/tests. Skill file: none. Two bounded
workers used Sol/high for native filesystem safety and Luna/high for YAML parsing;
peak three active agents. Direct serial work was the simpler alternative, but
independent parsing and filesystem ownership reduced review interference. Cost
savings were not measured; monetary usage was unavailable.
