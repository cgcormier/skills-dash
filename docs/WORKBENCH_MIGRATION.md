# Personal skills workbench migration

Accepted direction for the October 18, 2026 task. Current verification and exact
remaining release limits are recorded in `PROJECT_STATE.md` and `VERIFICATION.md`.

## Phases

1. Discover immediate personal skill directories and diagnostics.
2. Edit existing `SKILL.md` with exact-content checks and recoverable publication.
3. Retire archive navigation/mutations; preserve legacy recovery/export.
4. Update purpose, ownership, verification and minor tooling documentation.

The UI retirement advanced while the native write-policy question was pending;
legacy storage was preserved throughout. The user then explicitly chose strict
race refusal with a brief missing-file interval, superseding the initial atomic
replacement target. No silent weakening of that original requirement is claimed.

## Smallest boundary

Native resolves `%USERPROFILE%\.agents\skills`; callers cannot supply a root.
`discover_skills()` returns its path, entries, diagnostics and write policy.
`read_skill(folder)` returns raw text, modified time and supporting paths.
`save_skill(folder, expectedContent, content)` edits one existing file through
the guarded protocol in `ARCHITECTURE.md`. Bounded list/read recovery commands
provide explicit previous/draft export. No skill create/delete/move, root picker,
supporting-file mutation, script execution or agent runtime is exposed.

TypeScript parses and validates YAML. Raw text is the editor's authority; unknown
metadata, comments and unchanged raw spans are not reconstructed from a model.
Malformed files remain visible and repairable.

## Compatibility and rollback

Old app-data JSON and browser keys remain untouched. Primary/backup can be
independently inspected/exported, including corrupt raw data. No automatic
conversion or legacy deletion occurs. Starter data is test-only. Per-file save
recovery is independent of the legacy archive backup.

Rollback can run the prior executable against unchanged legacy JSON. Actual
file edits remain ordinary Markdown; review/export a recovery version for manual
restoration without overwriting a newer external file. Supporting contents stay
in place. No commit, push or installer update occurs without a separate request.

## Validation

Use parser/boundary tests, isolated browser layout/keyboard/error checks, and real
native filesystem tests on disposable directories. Verify actual WebView discovery
against the personal root read-only. Save/reload/conflict/recovery IPC checks use
a separate process with `USERPROFILE` pointing at a guarded disposable fixture.
The production API still has no arbitrary-root parameter. Browser mocks do not
prove native behavior, and dev WebView tests do not prove installed packaging.
