# Preserved local Git layout

This is the verified October 24 relocation record, preserved from the local main
edit before the October 25 integration. Commit IDs describe that historical
snapshot. The current primary checkout remains `C:\Users\ccorm\skills-dash` on
`main`; it now includes the simplified and improvement implementations. See
[project state](PROJECT_STATE.md) for current state. No worktree was removed.

## Local Git layout - 2026-10-24

The primary checkout is now `C:\Users\ccorm\skills-dash` on existing `main`
(`01e0da8`). Shared Git storage remains inside its `.git` directory. Linked
checkouts under `C:\Users\ccorm\skills-dash-worktrees` are `v1` on `v1`
(`01e0da8`), `v2` on `v2`, `ui-ux` on existing `ui/ux`, and `develop` on
`develop` (all three initially `e6b81b1`). Existing `simplified`, all prior
branches, remote-tracking refs and committed history were retained unchanged.

The original primary working files, dependencies, ignored QA output and build
caches were transferred intact into `ui-ux`. The former detached `edb3` worktree
is now `constitution-bridge`, retaining `318f0bb` and eight untracked planning
documents. The empty, unregistered `8ace` folder is preserved as
`legacy-8ace-empty`. Git registration and file hashes, metadata, file identities
and hardlink counts were checked before/after relocation; `git fsck --full`
passed. The old checkout path retains only empty `.git` and `docs` directory
shells because Windows blocked renaming/removing their open directory handles.

The v1 per-worktree Codex environment path was corrected. Runtime scripts use
relative checkout paths and were unchanged. Historical cache/report contents
retain old paths and future builds may invalidate caches. Existing native,
installer, browser, QA and installed-executable snapshots are labeled separately
under `skills-dash-worktrees\builds`; their exact source commits are not assumed.
No application code, app data, installation, rebuild, commit, merge or push was
part of relocation. Runtime behavior was not revalidated by launching an app.
Versions retain the same native application identifier and can share app data.

See the [local layout README](../../skills-dash-worktrees/README.md) for run
commands and task branch creation, and `relocation-audit-2026-10-24` beside it
for manifests and verification. The older project-state sections below retain
their historical scope.
