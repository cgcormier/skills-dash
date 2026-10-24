# Proposed changes from the save-policy side conversation

Date: October 18, 2026.

## Purpose and status

This side conversation explored how skills-dash can safely edit ordinary personal
`SKILL.md` files while remaining simple and compatible with agents that read and
edit those files directly. The user wanted to understand the consequences of the
save-policy choice, compare it with CPU-style locking, and brainstorm simpler
ways to coordinate readers and writers.

This document records proposals for the main implementation chat to consider.
It is not an implementation specification or authorization to adopt every idea.
The side conversation made no application-code changes and ran no filesystem
concurrency experiments. Implementation status must be checked in the main chat.

The user's selected policy remains: strictly refuse to replace another writer's
file, accepting a brief missing-file interval while publishing. The ideas below
supplement that choice; they do not silently change it.

## Five practical proposals

### 1. Assume occasional saves, then handle conflicts well

Keep ordinary `SKILL.md` files as the authority. Compare disk content with the
version opened by the editor before saving. If another writer changed it, stop
and preserve the user's draft, with explicit reload/export options. Ordinary
skill use generally reads instructions; task-output writes are different from
rewriting the skill itself. No measurement of this user's skill-write frequency
was performed, so constant simultaneous editing should not be assumed.

### 2. Keep saving manual

Separate editable drafts from installed content. Optionally autosave drafts to
app-owned recovery storage, but change the installed `SKILL.md` only when the
user explicitly saves or publishes. This reduces write contention and keeps
unfinished instructions from becoming active. Draft autosave is a proposal,
not a verified existing feature; storage failures must remain visible.

### 3. Add a lightweight writer agreement later

If simultaneous app/agent edits become common, use a shared per-skill writer
lock through a small editing helper. Participating writers acquire that lock,
check the expected revision, save, then release it. Ordinary readers need not
change. External editors or agents using ordinary file tools can bypass a
cooperative agreement, so external-change checks remain necessary. A lock-file
design also needs an explicit interrupted-process/stale-lock recovery policy.

### 4. Make interrupted-save recovery obvious

If publishing is interrupted after preserving the original but before installing
the draft, show the affected folder as an interrupted save with recovery content
available. Keep previous content and the draft identifiable. Do not silently
choose a version or overwrite a file another writer has since created. Recovery
should require a fresh check of the destination; the user must understand which
version is being restored.

### 5. Use Git as an additional history layer

Optionally use Git to inspect changes and recover earlier skill revisions.
This supplements the filesystem save/recovery protocol: Git does not prevent
simultaneous edits, preserve every uncommitted change, or make an interrupted
write atomic. This proposal does not authorize repository initialization,
automatic commits, staging, pushing, or changing the personal skill root.

## Mutex and read/write-lock proposition

The user proposed a CPU-like lock and then refined it to exclusive write access
while preserving read access to the content that existed before the lock.
The relevant concepts are a writer mutex and a readers-writer lock.

The intended behavior was:

1. One writer acquires the per-skill write lock.
2. Readers continue seeing the previously published content.
3. The writer prepares a complete replacement separately.
4. The replacement is published and the lock is released.

A cooperative writer lock can coordinate participating tools. It does not
control programs that ignore it, and it does not alter Windows file-handle
sharing or rename rules. Existing readers may permit or block replacement
depending on their open/share flags. An in-process mutex alone cannot coordinate
independent agent processes. A readers-writer lock alone also does not give
readers a stable old snapshot if the writer changes the same file in place.

The main conversation reported native Windows tests where excluding external
replacement also blocked the app's replacement operation. Those results were
context for this discussion, not independently reverified here. Any chosen
protocol still needs direct native tests for its actual guarantees.

### Version-pointer alternative considered

An immutable-version design would write `versions/003.md`, flush it, then switch
a small `current.txt` pointer from `versions/002.md` to `versions/003.md`.
Existing readers could finish reading version 002 while new readers open 003.
The pointer switch itself still requires safe publication/retry, and old versions
must remain available for readers and recovery.

This adds a custom reading convention: ordinary agents opening
`my-skill/SKILL.md` would not automatically follow `current.txt`. Updating an
ordinary `SKILL.md` mirror reintroduces its publication problem. The side
conversation therefore favored ordinary files, manual saves, preserved drafts,
and the selected recoverable-publish policy over introducing a pointer store.
Cooperative writer locking remains an optional later addition if actual
contention justifies it.
