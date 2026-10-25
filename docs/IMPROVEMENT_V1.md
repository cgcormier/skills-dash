# Opt-in skill improvement v1

The workbench records evidence from completed agent tasks and proposes bounded
changes to existing personal `SKILL.md` files. A proposal is not proof of an
improvement. Automatic publication additionally requires an independently
registered behavior check that demonstrates an improvement over the base file.
No-change and insufficient-evidence are first-class review outcomes.

## Start in an isolated profile

Run these commands from the feature checkout. Node 22.12+, npm, Rust MSVC,
Microsoft C++ Build Tools, WebView2, and the installed Codex CLI are required for
development. The reporter needs Node, this checkout, and `npm.cmd ci`; the built
desktop executable runs without Node. Live review uses the existing ChatGPT CLI
login (`codex login status`), without reading or copying credentials.

```powershell
Set-Location C:\Users\ccorm\skills-dash-worktrees\feature-skill-improvement-v1
npm.cmd ci
npm.cmd run profile:init -- my-demo
$env:SKILLS_DASH_TEST_PROFILE = (Resolve-Path .\output\profiles\my-demo).Path
npm.cmd run desktop
```

`profile:init` refuses an existing directory and creates three deliberately
imperfect disposable skills. It does not enable improvement. In **Improvement
settings**, enable the master switch. The initial default is **Propose**, with
five distinct task applications, a daily limit of ten review attempts, and a
120-second timeout. A demonstration can use a threshold of one; that does not
change production defaults or invent additional tasks.

The explicit profile covers `.agents/skills`, `app-data` (lifecycle, legacy
archive, review workspaces and recovery), and `webview` (including localStorage
preferences). Native discovery and publication use that profile's fixed
`.agents/skills` directory. A marker and Windows directory/link guards are
required. Invalid profiles fail closed before opening ordinary data. Production
continues to manage only `%USERPROFILE%\.agents\skills`; this is not an arbitrary
skill-root picker. Test processes do not redirect or focus an installed normal
instance. Do not set USERPROFILE/APPDATA for this feature's profile selection.

Port 1420 must be free for `desktop`; do not leave a separate `npm.cmd run dev`
server running before starting it. Browser mode has no real filesystem/reviewer
access. Browser QA uses isolated browser contexts with test-only IPC fixtures.

To run the built executable directly, with no installation:

```powershell
$env:SKILLS_DASH_TEST_PROFILE = (Resolve-Path .\output\profiles\my-demo).Path
& .\src-tauri\target\release\skill-archive.exe
```

To leave the test selection for a later ordinary run, remove only the
process-local environment value: `Remove-Item Env:SKILLS_DASH_TEST_PROFILE`.
That does not delete any profile data.

## Opt-in agent reporting

Participating agents must select the same profile explicitly. `--profile
personal` selects the ordinary fixed root and ordinary application data; an
absolute initialized profile path selects the test profile. The desktop does not
infer which source profile a report intended. A wrong source path is rejected.

Use this concise instruction only in tasks where recording is wanted:

> After completing the task, report one consolidated use for each personal skill
> applied. Use this request's stable task ID across retries and subagents. Record
> the SHA-256 of the exact raw SKILL.md loaded at task start, a short factual
> outcome or friction report, and existing evidence references. Keep suggestions
> separate. Do not count maintenance reviews or validation runs. Write a v1
> report JSON, then run `npm.cmd run report:use -- --profile <explicit profile> --input <report.json>` from this checkout. If Off or unavailable, report that
> result; do not enable recording on the user's behalf.

Example report (replace the revision with the exact hash actually loaded):

```json
{
  "version": 1,
  "id": "request-2026-10-24-tags-report-1",
  "folder": "improvement-pilot-tags",
  "sourcePath": "C:\\path\\to\\profile\\.agents\\skills\\improvement-pilot-tags\\SKILL.md",
  "sourceKind": "personal",
  "revision": "<64 lowercase hexadecimal SHA-256 characters>",
  "taskId": "request-2026-10-24-tags",
  "kind": "task",
  "observation": "Input Beta, beta returned two beta entries; the task required unique tags.",
  "evidenceRefs": ["C:\\path\\to\\task-output.json"],
  "suggestedImprovement": "Consider enabling the existing uniqueness instruction.",
  "reportedAt": "2026-10-24T21:00:00.000Z"
}
```

```powershell
Set-Location C:\Users\ccorm\skills-dash-worktrees\feature-skill-improvement-v1
npm.cmd run report:use -- --profile C:\absolute\test-profile --input C:\absolute\task-report.json
```

The reporter validates data and effective policy, then syncs an immutable inbox
file. It can run with the app closed. Its receipt means **durably pending app
import**, not reviewed or published. Reopening the app imports reports and starts
eligible work. Reports deferred while Off remain in the inbox. Malformed reports
are retained with visible rejection information. Report IDs and stable
skill/source/task keys consolidate duplicate deliveries, retries and subagents;
they do not increment distinct-use counts. A retry with a conflicting used
revision is rejected rather than silently replacing provenance.

## Controls and state

The global master switch dominates all per-skill overrides. Overrides may inherit
the global default or select Off, Observe, Propose, or Auto-update. Off blocks new
recording, review starts and publication. Observe records only. Propose runs
eligible reviews and waits for approval. Auto-update publishes only validated
registered pilot improvements; other skills can still produce manually reviewed
proposals. Changing policy does not erase pending evidence or completed history.
Manual approval requires structural/scope validation and cannot bypass a failing
registered behavior check. An unavailable behavior check is allowed only for
manual approval.

The dossier shows effective mode, distinct uses, pending evidence, observations,
review status, exact evidence coverage, rationale, proposed diff, validation,
reported token usage, and apply/reject/cancel/retry/recovery actions. Cost is
unavailable, not inferred from token counts or subscription pricing.

One reviewer runs at a time. Automatic reviews start after five distinct pending
uses by default; **Review now** can start earlier. Every attempt counts toward
the configurable UTC-day limit. Failed and cancelled jobs leave evidence pending
and require explicit retry. Insufficient evidence remains visible and is not
automatically reviewed again until the evidence changes. No-change records exact
coverage. A sixth use arriving during a review of uses 1–5 remains pending.
New details on an already covered task are also distinguishable from the exact
snapshot assessed, without manufacturing a second task application.

## Module ownership and extension points

| Area                                                                          | Files                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Types, defaults and effective policy                                          | `src/improvement/types.ts`                                                     |
| Eligibility, recording, jobs and recovery                                     | `src/improvement/engine.ts`                                                    |
| Strict store/report parsing                                                   | `src/improvement/storage.ts`                                                   |
| Reviewer interface, bounded prompt, semantic output validation, fake reviewer | `src/improvement/reviewer.ts`                                                  |
| Shared provider JSON schema                                                   | `src/improvement/review-schema.json`                                           |
| Registered independent behavior procedures                                    | `src/improvement/validation.ts`                                                |
| Native adapter                                                                | `src/improvement/native.ts`                                                    |
| React settings/dossier and diff                                               | `src/components/ImprovementControls.tsx`, `proposalDiff.ts`                    |
| Profile selection, durable CAS, Codex process                                 | `src-tauri/src/profile.rs`, `lifecycle.rs`, `reviewer.rs`                      |
| Reporter and disposable fixture setup                                         | `scripts/report-use.ts`, `lifecycle-profile.ts`, `init-improvement-profile.ts` |

Change thresholds in settings or `DEFAULT_SETTINGS`. Change the bounded reviewer
prompt in `reviewer.ts`; change the shared JSON output contract with its strict
TypeScript parser and live smoke test. Native `MODEL`, `EFFORT`, executable
discovery and flags are fixed verified configuration in `reviewer.rs`.
The model field is shown read-only because arbitrary model strings have not been
verified for this runner. A provider replacement implements the TypeScript
`Reviewer` interface. The deterministic fake reviewer is test-only and is never
selected by the desktop adapter.

The three registered pilot procedures interpret a small fixed JSON instruction
block as data. They do not run shell commands, supporting scripts, or arbitrary
code. Expected outputs and executable interpreters belong to the application,
outside the skill. Auto-update requires passing candidate holdouts and at least
one failing baseline holdout. Pilot proposals may change only that instruction
block; ordinary manual proposals must preserve frontmatter and protected policy
sections. These deliberately narrow checks do not prove general improvements to
arbitrary prose skills. Add a procedure only with independent expected outcomes
and meaningful regression tests.

## Persistence and publication guarantees

The versioned app-owned lifecycle store is outside every SKILL.md. It is separate
from the existing `skill-history.sqlite3` ledger: no migration, merged count, or
legacy history rewrite occurs. The desktop engine is the authoritative writer.
The reporter writes only the inbox. Native compare-and-swap writes use an
exclusive OS lock and immutable synced generation files under
`app-data/lifecycle-v1`; they retain interrupted partial files and reject corrupt
or discontinuous generations. An app seeing a conflicting writer stops and
requires a successful lifecycle reload. No starter-state fallback repairs bad
storage. Retention is bounded and failures are visible; automatic pruning is not
implemented.

An exclusive OS session lease permits one desktop process per test profile.
Different test profiles remain independent, and test launches cannot focus an
installed personal instance. A stale lock file is harmless after the owning
process exits; the file is retained. Confirm that the old test process has exited
before a restart test; unsaved-work protection can cancel a close request.
The ordinary profile retains its existing single-instance handoff. Any other
conflicting lifecycle writer still stops writes and requires an explicit reload.

Before publication, the engine validates scope/behavior, compares the exact base
revision to disk, and rechecks effective policy. It durably records publication
intent before calling the existing native `save_skill` protocol. That protocol
preserves previous/draft bytes and refuses competing file/link replacements.
Its brief missing-file interval remains documented; it is not an atomic rename
transaction with the lifecycle ledger.

After interruption, reconciliation compares source bytes to the recorded old and
proposed revisions. Recognized publication is recorded without replaying it.
Unexpected or missing content remains a visible recovery-required state.
The journal retains whether the interrupted operation was publication or
restoration, including after an ambiguous read and later restart. The optional
operation field is compatible with earlier v1 records; legacy `restoring` records
are annotated before reconciliation can make them ambiguous.
Restoration is a new checked save requiring the exact published revision; it
refuses to overwrite newer external content. Missing files retain the existing
raw recovery/export workflow for manual reconciliation. No blind rollback runs.

## Reviewer boundary and limitations

The native runner invokes the discovered installed `codex.exe` directly with
structured arguments, never a shell or reviewer-selected executable. It uses an
empty bounded work directory, read-only sandbox, no daemon, ephemeral session,
fixed reviewer instructions, a strict schema, disabled user/project discovery
and tool features, and an allowlisted child environment. Source content and
observations are data. The process starts suspended inside a Windows job before
resuming; timeout, cancellation, or application exit kills its process tree.
Output is bounded, parsed, and rejected if the event stream contains tool use.

CLI 0.164.0 still exposes some tool metadata even with those features disabled.
Verification found the code-mode execution backend disabled, ephemeral delegation
unavailable, a write-canary unchanged, and successful schema-constrained reviews.
This is not a claim that tool metadata disappears. The final runner rejects tool
activity and never calls the skill publisher. Flags/configuration are sensitive
to CLI upgrades; rerun live integration when upgrading. Official background:
[non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode).

Deferred: weighted scoring, reviews while the app is closed, additional model
providers, supporting-file edits, broader skill roots, retention/pruning and
cross-platform native publishing. Physical power-loss durability and arbitrary
skill behavioral quality are not certified.

## Checks

```powershell
Set-Location C:\Users\ccorm\skills-dash-worktrees\feature-skill-improvement-v1
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run desktop:test
npm.cmd run desktop:build
```

Routine tests never call a model. Live integration is separately invoked and may
consume account usage. See `VERIFICATION.md` and the build handoff manifest for
the actual native, live and packaged runs; browser fixtures do not prove those
surfaces. See `IMPLEMENTATION_HANDOFF.md` for exact final artifact/run commands.
