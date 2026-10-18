# Add to Calendar skill verification

Verified September 24, 2026. Work is local; no commit or push.

## Installed and archived

- Personal skill: `C:\Users\ccorm\.codex\skills\add-to-calendar\SKILL.md`.
- Skill Archive: active record `add-to-calendar`, title **Add to Calendar**, category **Operations**, tags calendar/events/productivity.
- Native workspace increased from 12 to 13 records while Skill Archive was closed. Existing records were preserved exactly after schema normalization. The previous primary is the recovery backup; pre-change primary and backup snapshots are in ignored `output/calendar-skill/`.
- `tests/fixtures/add-to-calendar.md` is an exact snapshot of the installed skill for archive integration tests. Update both deliberately if the skill changes; the archive does not synchronize installed skills automatically.
- Creation was recorded as an update event in the shared skill history. No event-execution use was invented. Applied skill-creator, skill-hierarchy, and openai-docs uses were recorded for this request.

## Behavior specified

"Add this" authorizes reading the supplied source and creating the event without routine preview approval. The skill instructs the agent to call the available authorization/connection tool and wait when calendar access is missing or denied. If no connection flow is exposed, the asynchronous user-input tool can request that the user connect it; text agreement alone does not prove provider access. It distinguishes read and write access and does not authorize broad permission-mode changes.

It also covers source-image inspection, full dates/timezones, approved defaults only, bounded duplicate/conflict checks, explicit no-conferencing for in-person events, and checking for an existing event after an ambiguous write result.

## Checks completed

- Skill Creator `quick_validate.py`: passed.
- `vitest run`: 27 tests passed across three files, including three new integration cases in `src/domain/calendar-skill.test.ts`.
- New cases exercise export/import of the complete Markdown while preserving other records, browser-adapter save/reload and backup, and Operations/category search after reload.
- `npm run build`: TypeScript and Vite production build passed.
- Native saved data was re-read and validated using the project's actual TypeScript schema. Installed skill, fixture, and saved record body matched. Existing records and the recovery backup were checked.
- Static scenario review: already-authorized creation proceeds; missing access calls a real tool and pauses; read access is not write access; unspecified required duration asks instead of assuming; an existing event is not duplicated; a write timeout triggers a search before retry. These are instruction reviews, not independent agent execution tests.

## Limits

Browser UI import/display/reload was attempted but not verified: Chrome navigation initially timed out, the loaded tab then reported an unattached debugger, and the isolated browser was unavailable. No browser content or live calendar was modified by the test. Native IPC/UI launch was not tested in this task; direct schema-validated storage verification is not a native UI smoke test. No actual calendar access denial or new event creation was exercised with the new skill.

## Skill audit

**updated**: `add-to-calendar` captures the requested reusable workflow and tool-based access recovery. One instruction file plus existing archive tests was chosen over new services, helpers, or delegation; expected recurring overhead is lower, but savings are unmeasured. Browser retries stopped after the available interfaces failed.

The skill format follows the [official skill creation guidance](https://developers.openai.com/plugins/build/skills).
