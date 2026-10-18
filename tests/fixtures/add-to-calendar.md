---
name: add-to-calendar
description: Create verified calendar events from links, flyers, screenshots, emails, or plain text when the user asks to add or schedule an event. Resolve missing details, check duplicates, and recover missing calendar access without repeated permission attempts.
---

# Add to Calendar

## Authorization and access

Treat "add this to my calendar" as authorization to read the supplied source, inspect the relevant calendar window, and create that event. Carry existing authorization forward; do not require a routine preview approval. Ask only about blockers, consequential ambiguity, or actions beyond that scope. Prefer the user's chosen calendar, otherwise their primary calendar.

If calendar access is missing or denied, invoke the available authorization/connection tool to prompt the user, then wait; tool visibility is not proof of access.

Use only an actually exposed tool. If no connection flow is available, use `request_user_input_async` when available to request the required connection and pause calendar work. A text reply does not establish provider access. Do not change global/plugin permission modes or retry a denied call until access changes. A successful read confirms read access only; respect the write tool's own approval gate.

## Read and resolve

- Use the best available source reader; for a social post whose details are in the image, inspect the flyer. Prefer an available authenticated browser when needed. After an access failure, use one suitable alternative or request the missing source/access; avoid repeated speculative retries.
- Extract title, full date including year, start/end, timezone, location or supplied meeting link, and explicitly stated recurrence. Resolve relative dates from the source's publication context. Do not silently turn an old event into this year's event or infer recurrence from a single occurrence.
- Keep sourced facts separate from assumptions. Bundle unresolved date, time, timezone, event selection, or calendar questions into one tool-based clarification. Use previously approved defaults for minor omissions; if the provider requires an end time and neither a duration nor approved default exists, ask. Do not convert an unknown start time into an all-day event.

## Create and verify

- Search a bounded event window for duplicates and conflicts, using that read as an access check. If the same event already exists, return its link without duplicating it. Report conflicts; preserve the published time of a fixed event. Clarify timing before scheduling a flexible event across a conflict.
- Create only the requested event(s), preserving the source link and any approved assumptions in the description. Keep existing reminder defaults unless requested otherwise. Do not add guests or issue invitations unless requested. For an in-person event, explicitly disable generated conferencing when supported (Google Calendar: `add_google_meet: false`).
- After an ambiguous write failure or timeout, search for the event before retrying. If existence cannot be determined, stop and report uncertainty rather than risk duplicates.
- Verify the returned title, date, times/timezone, location, and event link; re-read only if the response is incomplete or contradictory. Report success only after confirmation. Finish with the event link and essential details, noting any estimated end time or unresolved limitation.
