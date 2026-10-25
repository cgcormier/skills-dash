# Personal workbench - main handoff

The current integration checkout is `C:\Users\ccorm\skills-dash` on `main`.
It contains the `simplified` migration `e6b81b1` and improvement/UI commit
`429c3d9`, integrated through fast-forwards on October 25, 2026. The retained
feature checkout is clean. This release is unrelated to the preserved archive
branch named `v1`. Current build, installation and publication results are in
[project state](PROJECT_STATE.md) and [verification](VERIFICATION.md); the
October 24 cycle and dedicated artifact handoff below are historical evidence.

Ownership is split across pure TypeScript lifecycle/policy/validation in
`src/improvement`, guarded Windows adapters in `src-tauri/src`, the reporter in
`scripts`, React settings/dossier controls, focused tests, and these documents.
The relocated coordination checkout and preserved audit/build directories remain
intact. Nothing was built or implemented in `C:\Users\ccorm\repos\skills-dash`.

## Run and alter it

Development commands run from the primary checkout in PowerShell. The retained
cycle-profile path in the historical verification section is deliberately unchanged.

```powershell
Set-Location C:\Users\ccorm\skills-dash
npm.cmd ci
npm.cmd run profile:init -- my-first-improvement-demo
$env:SKILLS_DASH_TEST_PROFILE = (Resolve-Path .\output\profiles\my-first-improvement-demo).Path
npm.cmd run desktop
```

Requires Node 22.12+, npm, Rust MSVC, Microsoft C++ Build Tools and WebView2.
The desktop scripts activate the Windows compiler environment. Port 1420 must
be free; stop a standalone `npm.cmd run dev` before `npm.cmd run desktop`.
For UI-only development, `npm.cmd run dev` deliberately has no native lifecycle
or reviewer access. Dependencies are installed in this feature checkout.

The new profile starts Off. Open **Improvement settings**, enable recording,
and use the initial **Propose** default. Five distinct skill/request uses trigger
a review; **Review now** supports an explicit earlier review. The three generated
pilot skills are disposable. The normal personal profile stays separate.

See [report format and opt-in agent instruction](IMPROVEMENT_V1.md#opt-in-agent-reporting).
The agent must hash the exact SKILL.md it loaded, finish its task, write the v1
JSON report, then run:

```powershell
Set-Location C:\Users\ccorm\skills-dash
npm.cmd run report:use -- --profile C:\Users\ccorm\skills-dash\output\profiles\my-first-improvement-demo --input C:\absolute\task-report.json
```

This works while the app is closed, once settings have explicitly enabled that
profile. A successful receipt means durable pending import. Processing starts
when the desktop opens. Use the same absolute profile for app and reporter;
the reporter never implicitly follows an environment variable. Its deliberate
ordinary-profile option is `--profile personal`.

## Tests and builds

Routine checks never call a model:

```powershell
Set-Location C:\Users\ccorm\skills-dash
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run desktop:test
npm.cmd run desktop:build
```

Browser fixtures, with `npm.cmd run dev` in a separate terminal:

```powershell
npx.cmd --yes --package @playwright/cli playwright-cli -s=workbench open http://127.0.0.1:1420 --browser chrome
npx.cmd --yes --package @playwright/cli playwright-cli -s=workbench run-code --filename tests/workbench-browser.cjs
npx.cmd --yes --package @playwright/cli playwright-cli -s=workbench run-code --filename tests/improvement-browser.cjs
```

The native runner discovers the installed OpenAI Codex CLI and uses the existing
login. The verified CLI is 0.164.0. Check authentication without reading credentials:

```powershell
& "$env:LOCALAPPDATA\Programs\OpenAI\Codex\bin\codex.exe" login status
```

Live smoke is separately invoked and consumes account usage. Launch the freshly
built executable directly with the explicit profile and QA port, then run smoke
from another terminal. Installing an update is a separate step:

```powershell
Set-Location C:\Users\ccorm\skills-dash
$env:SKILLS_DASH_TEST_PROFILE = (Resolve-Path .\output\profiles\my-first-improvement-demo).Path
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9237'
$testProcess = Start-Process -FilePath .\src-tauri\target\release\skill-archive.exe -WindowStyle Hidden -PassThru
$testProcess.Id
```

```powershell
Set-Location C:\Users\ccorm\skills-dash
npm.cmd run test:live -- --profile C:\Users\ccorm\skills-dash\output\profiles\my-first-improvement-demo --port 9237
```

The smoke checks the native profile and runner with synthetic no-defect evidence;
it does not insert task evidence or prove the complete improvement cycle by itself.
The QA port is never enabled by production configuration. Remove the process-local
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` environment value before an ordinary launch.
Do not redirect USERPROFILE, APPDATA or LOCALAPPDATA. Run only one process per
test profile, and verify the old PID exited when testing restart.

## Historical verified cycle and artifacts - October 24, 2026

The cycle profile is
`C:\Users\ccorm\skills-dash-worktrees\feature-skill-improvement-v1\output\profiles\cycle-v1`.
It contains five reports from actual requested agent tasks. One live slugs proposal
waited in Propose and was manually approved. The first tags review returned
insufficient evidence; a second actual task supplied new evidence, and the next
live proposal passed registered holdouts and was auto-published. A subsequent
agent task loaded both new hashes and produced the expected results. The packaged
app imported those later reports, refused a stale restore, and restored the exact
previous bytes while preserving recovery copies. The profile is left Off with
history retained. Fixture, native, live-model and packaged evidence are separated
in [the verification record](VERIFICATION.md).

Current primary-checkout build outputs:

- `src-tauri/target/release/skill-archive.exe`
- `src-tauri/target/release/bundle/nsis/Skill Archive_0.1.0_x64-setup.exe`
- `dist/` for the frontend bundle.

Historical dedicated handoff:
`C:\Users\ccorm\skills-dash-worktrees\builds\skill-improvement-v1\20261024T222238Z-local`.
Its manifest records the branch, baseline/HEAD, uncommitted source file hashes,
commands, artifact hashes and verification. The source ZIP includes tracked and
new source files; the patch covers tracked modifications. Evidence excludes
WebView browsing data and credentials. The installer is supplied as a build
artifact only. Run `skill-archive.exe` directly with the same profile environment
selection; copying an executable alone never isolates application data.

## Extension points and limits

Change thresholds, timeout and daily limit in settings or `DEFAULT_SETTINGS` in
`src/improvement/types.ts`. Change eligibility through `EvidenceEligibility` in
`engine.ts`. Change bounded prompts and output parsing in `reviewer.ts`, and the
shared provider contract in `review-schema.json`. The model and `ultra` effort are
fixed verified constants in native `reviewer.rs`; changing them requires another
live smoke. Register independent expected behavior in `validation.ts`; never run
reviewer-supplied commands. The three pilots use fixed declarative interpreters
and held-out expected outputs, so they do not establish general prose-skill quality.
Skills without registered checks remain eligible for proposals/manual approval.

Deferred: weighted evidence, background reviews while closed, additional providers,
supporting-file edits, broader skill roots, automatic retention pruning, and
cross-platform native publication. No physical power-loss durability certification
is claimed. CLI tool metadata remains partially exposed, although the verified
runner disables execution backends, rejects tool activity and cannot publish
through its reviewer interface. Full boundary details are in
[IMPROVEMENT_V1.md](IMPROVEMENT_V1.md).
