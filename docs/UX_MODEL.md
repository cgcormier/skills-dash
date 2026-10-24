# UX model

The workbench manages real personal skill folders under one root. It opens with
the path header, search and an unselected file list. There is no starter
collection, category rail, Atlas, Posters, lifecycle control or agent run button.
Legacy archive recovery is a separate explicit surface.

## Interaction contract

- Search matches folder/path, name, description and raw instructions/metadata.
- All discovered directories remain visible, including missing/inaccessible
  `SKILL.md` entries. Validation and read errors explain what needs attention.
- Selection reads a fresh disk revision. Request tickets prevent older async
  reads/refreshes from replacing newer selections or snapshots.
- The paper dossier shows actual path, modified time, metadata, instructions and
  supporting paths. HTML and scripts stay inert text.
- The raw editor preserves unknown fields/comments and unchanged source spans.
  Validation is advisory so malformed files can be repaired. Unsaved drafts are
  session-only; export before closing when a durable draft is needed.
- Save applies only to the opened `SKILL.md`, carrying its exact opened content
  for comparison. There is no whole-workspace save or undo. The approved policy
  refuses a competing replacement and keeps recovery copies; the UI explains
  that `SKILL.md` may briefly be absent during publication.
- A save failure keeps the draft and shows the error/recovery paths. Returning
  app focus checks for external changes without replacing the draft. Explicit
  reload requires discarding edits first. A successful save shows recovery access.
- File switching, reload, narrow search navigation and close protect dirty
  drafts. Discovery failures retain the last successful list; no example/browser
  storage fallback occurs.
- Ctrl/Cmd+K or `/` focuses search; narrow selection returns to the list first.
  Arrows/Home/End move list focus; Enter opens. Escape outside text fields returns
  to the list. Ctrl/Cmd+S saves. Dialogs contain and return keyboard focus.
- Narrow windows show list or dossier with Back to list. The native header
  stays sticky. One reduced-effects preference is independent of OS motion
  reduction; paper, typography and rules carry identity without photographs.

## Recovery

The dossier lists the newest 20 file-save transactions with previous/draft export,
including when a failed publication left `SKILL.md` missing. Incomplete or blocked
copies have visible diagnostics. Recovery never automatically overwrites an
external file. Review/export a version for manual restoration, then refresh.

Legacy primary and backup are independently inspectable/exportable, including raw
corrupt JSON. There is no automatic conversion, replacement or deletion. A future
migration decision must separately account for both copies and explicitly map
content to real folders; no mapping is inferred here.
