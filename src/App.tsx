import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileText, RefreshCw, Search } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { inspectSkill } from "./domain/skillFiles";
import { updateRawDraft } from "./domain/rawDraft";
import {
  discoverSkills,
  isDesktop,
  readSkill,
  saveSkill,
  listRecoveries,
  readRecovery,
  type RecoveryEntry,
  type SkillFile,
  type SkillRow,
} from "./storage/skillFiles";
import { readLegacy, type LegacyCopy } from "./storage/legacy";
import { Modal } from "./components/Modal";
import { WindowControls } from "./components/WindowControls";

function download(
  name: string,
  raw: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([raw], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function modified(value: number | null) {
  return value === null ? "Unavailable" : new Date(value).toLocaleString();
}
function initialReducedEffects() {
  try {
    return localStorage.getItem("skills-workbench.reduced-effects") === "true";
  } catch {
    return false;
  }
}

export default function App() {
  const [root, setRoot] = useState("%USERPROFILE%\\.agents\\skills");
  const [rows, setRows] = useState<SkillRow[]>([]);
  const [savePolicy, setSavePolicy] = useState<
    "read-only" | "recoverable-publish"
  >("read-only");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [rootDiagnostics, setRootDiagnostics] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<SkillFile | null>(null);
  const [draft, setDraft] = useState("");
  const [opening, setOpening] = useState(false);
  const [fileError, setFileError] = useState("");
  const [externalChange, setExternalChange] = useState(false);
  const [recoveries, setRecoveries] = useState<RecoveryEntry[]>([]);
  const [recoveryError, setRecoveryError] = useState("");
  const [exportingRecovery, setExportingRecovery] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [legacy, setLegacy] = useState<LegacyCopy[] | null>(null);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [reduced, setReduced] = useState(initialReducedEffects);
  const search = useRef<HTMLInputElement>(null);
  const dossier = useRef<HTMLHeadingElement>(null);
  const openTicket = useRef(0);
  const refreshTicket = useRef(0);
  const dirty = file !== null && draft !== file.content;
  const closing = useRef({ dirty, saving });
  closing.current = { dirty, saving };
  const inspection = useMemo(
    () => (file ? inspectSkill(draft, file.folder) : null),
    [file, draft],
  );
  const visible = useMemo(() => {
    const words = query.toLocaleLowerCase().trim().split(/\s+/);
    return rows.filter((row) => {
      const text = [
        row.folder,
        row.path,
        row.problem,
        row.inspection?.name,
        row.inspection?.description,
        row.inspection?.raw,
      ]
        .join(" ")
        .toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [rows, query]);

  async function refresh() {
    const ticket = ++refreshTicket.current;
    setLoading(true);
    setLoadError("");
    try {
      const snapshot = await discoverSkills();
      if (ticket !== refreshTicket.current) return;
      setRoot(snapshot.root);
      setSavePolicy(snapshot.savePolicy ?? "read-only");
      setRows(snapshot.entries);
      setRootDiagnostics(snapshot.diagnostics);
    } catch (error) {
      if (ticket === refreshTicket.current) setLoadError(String(error));
    } finally {
      if (ticket === refreshTicket.current) setLoading(false);
    }
  }
  function mayLeave() {
    return (
      !saving &&
      (!dirty ||
        window.confirm(
          "Discard unsaved edits to this SKILL.md? Export your draft first if you need a copy.",
        ))
    );
  }
  async function refreshRecoveries(
    folder: string,
    ticket = openTicket.current,
  ) {
    try {
      const copies = await listRecoveries(folder);
      if (ticket !== openTicket.current) return;
      setRecoveries(copies);
      setRecoveryError("");
    } catch (error) {
      if (ticket === openTicket.current) setRecoveryError(String(error));
    }
  }
  async function exportRecovery(
    copy: RecoveryEntry,
    version: "previous" | "draft",
  ) {
    setExportingRecovery(true);
    try {
      const raw = await readRecovery(copy.folder, copy.id, version);
      download(`${copy.folder}-${copy.id}-${version}.md`, raw);
    } catch (error) {
      setRecoveryError(String(error));
    } finally {
      setExportingRecovery(false);
    }
  }
  async function open(folder: string) {
    if (!mayLeave()) return;
    const ticket = ++openTicket.current;
    setSelected(folder);
    setFile(null);
    setDraft("");
    setOpening(true);
    setFileError("");
    setExternalChange(false);
    setRecoveries([]);
    setRecoveryError("");
    void refreshRecoveries(folder, ticket);
    setEditing(false);
    setNotice("");
    try {
      const next = await readSkill(folder);
      if (ticket !== openTicket.current) return;
      setFile(next);
      setDraft(next.content);
    } catch (error) {
      if (ticket === openTicket.current) setFileError(String(error));
    } finally {
      if (ticket === openTicket.current) {
        setOpening(false);
        requestAnimationFrame(() => dossier.current?.focus());
      }
    }
  }
  async function save() {
    if (!file || !dirty || saving || savePolicy === "read-only") return;
    setSaving(true);
    setFileError("");
    setNotice("");
    try {
      const next = await saveSkill(file, draft);
      setFile(next);
      setDraft(next.content);
      setExternalChange(false);
      setNotice(
        "Saved SKILL.md. Previous content is available in the recovery copy below.",
      );
      void refresh();
    } catch (error) {
      setFileError(
        `${String(error)} Your draft is still here. Export it or reload the disk version before retrying.`,
      );
    } finally {
      setSaving(false);
      void refreshRecoveries(file.folder);
    }
  }
  async function showLegacy() {
    setLegacyLoading(true);
    setLegacy(await readLegacy());
    setLegacyLoading(false);
  }
  function backToList() {
    if (!mayLeave()) return false;
    ++openTicket.current;
    setSelected(null);
    setFile(null);
    setDraft("");
    setFileError("");
    setOpening(false);
    requestAnimationFrame(() => search.current?.focus());
    return true;
  }
  function toggleReduced(value: boolean) {
    setReduced(value);
    try {
      localStorage.setItem("skills-workbench.reduced-effects", String(value));
    } catch {
      setNotice(
        "Appearance applies for this session; preference storage is unavailable.",
      );
    }
  }
  useEffect(() => {
    void refresh();
    return () => {
      ++refreshTicket.current;
      ++openTicket.current;
    };
  }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (closing.current.dirty || closing.current.saving) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (isDesktop()) {
      void Promise.resolve()
        .then(async () => {
          const stop = await getCurrentWindow().onCloseRequested((event) => {
            if (
              closing.current.saving ||
              (closing.current.dirty &&
                !window.confirm("Discard unsaved SKILL.md edits and close?"))
            )
              event.preventDefault();
          });
          if (disposed) stop();
          else unlisten = stop;
        })
        .catch(() =>
          setNotice(
            "The native close guard could not be registered. Save or export before closing the window.",
          ),
        );
    }
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const input = (event.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable]",
      );
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!legacy) void save();
      } else if (
        !legacy &&
        (((event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "k") ||
          (!input && event.key === "/"))
      ) {
        event.preventDefault();
        if (selected && window.innerWidth <= 680 && !backToList()) return;
        requestAnimationFrame(() => {
          search.current?.focus();
          search.current?.select();
        });
      } else if (!legacy && !input && event.key === "Escape" && selected)
        backToList();
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });
  useEffect(() => {
    if (!file || saving) return;
    let active = true;
    const baseline = file;
    async function checkExternal() {
      try {
        const current = await readSkill(baseline.folder);
        if (active && current.content !== baseline.content)
          setExternalChange(true);
      } catch (error) {
        if (active)
          setFileError(
            `Disk check failed: ${String(error)}. Current draft preserved.`,
          );
      }
    }
    window.addEventListener("focus", checkExternal);
    return () => {
      active = false;
      window.removeEventListener("focus", checkExternal);
    };
  }, [file, saving]);

  return (
    <div
      className="app"
      data-effects={reduced ? "none" : "full"}
      data-detail={!!selected}
    >
      <a className="skip-link" href="#workbench">
        Skip to workbench
      </a>
      <header className="topbar">
        <div className="brand" data-tauri-drag-region>
          <FileText size={20} aria-hidden="true" />
          <span>
            SKILLS<span className="brand-detail"> / PERSONAL WORKBENCH</span>
          </span>
        </div>
        <span className="runtime">
          {isDesktop() ? "DESKTOP · FILES" : "BROWSER · NO FILE ACCESS"}
        </span>
        {isDesktop() && <WindowControls notify={setNotice} />}
      </header>
      <div className="root-header">
        <div>
          <span className="eyebrow">MANAGED PERSONAL ROOT</span>
          <p className="root-path">{root}</p>
        </div>
        <div className="header-actions">
          <button
            className="secondary"
            disabled={loading || saving}
            onClick={() => void refresh()}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {loading ? "Refreshing…" : "Refresh files"}
          </button>
          <button
            className="text-button"
            disabled={legacyLoading}
            onClick={() => void showLegacy()}
          >
            Legacy archive
          </button>
          <label className="effects-control">
            <input
              type="checkbox"
              checked={reduced}
              onChange={(event) => toggleReduced(event.target.checked)}
            />
            Reduce effects
          </label>
        </div>
      </div>
      {isDesktop() && savePolicy === "read-only" && (
        <div className="banner" role="status">
          Saving is unavailable in this runtime. You can inspect files and
          export edited drafts.
        </div>
      )}
      {savePolicy === "recoverable-publish" && (
        <div className="save-policy">
          Saving checks the opened version and preserves recovery copies.
          SKILL.md may briefly be absent while the saved file is published.
        </div>
      )}
      {loadError && (
        <div className="banner error" role="alert">
          {loadError}{" "}
          {rows.length > 0 && "The list below is the last successful snapshot."}
        </div>
      )}
      {rootDiagnostics.length > 0 && (
        <div className="banner" role="status">
          {rootDiagnostics.map((message, index) => (
            <p key={index}>{message}</p>
          ))}
        </div>
      )}
      <main id="workbench" className="workbench" tabIndex={-1}>
        <aside className="skill-list" aria-label="Personal skills">
          <div className="list-heading">
            <h1>Your skills</h1>
            <span className="eyebrow" aria-live="polite">
              {visible.length} / {rows.length}
            </span>
          </div>
          <label className="search">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Search skills</span>
            <input
              ref={search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search files, names, instructions…"
            />
            <kbd aria-hidden="true">Ctrl K</kbd>
          </label>
          <p className="list-note">
            Folders are authoritative. Select a file to inspect it.
          </p>
          <ul
            onKeyDown={(event) => {
              if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
                return;
              const buttons = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button",
                ),
              ];
              const index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (index < 0) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : Math.max(
                        0,
                        Math.min(
                          buttons.length - 1,
                          index + (event.key === "ArrowDown" ? 1 : -1),
                        ),
                      );
              buttons[next]?.focus();
            }}
          >
            {visible.map((row) => {
              const problems =
                (row.inspection?.diagnostics.length ?? 0) +
                (row.problem ? 1 : 0);
              return (
                <li key={row.folder}>
                  <button
                    className="skill-row"
                    aria-current={selected === row.folder ? "true" : undefined}
                    onClick={() => void open(row.folder)}
                    disabled={saving}
                  >
                    <span className="row-title">
                      {row.inspection?.name ?? row.folder}
                    </span>
                    <span className="row-folder">{row.folder}/SKILL.md</span>
                    <span className="row-description">
                      {row.problem ??
                        row.inspection?.description ??
                        "Metadata unavailable"}
                    </span>
                    <span className="row-status">
                      {problems
                        ? `${problems} validation / access ${problems === 1 ? "issue" : "issues"}`
                        : "Ready to inspect"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!loading && visible.length === 0 && (
            <p className="empty-list">
              {query
                ? "No files match your search."
                : isDesktop() && !loadError
                  ? "No skill folders found. No starter files have been created."
                  : "Your installed skills appear here in the desktop app."}
            </p>
          )}
        </aside>
        <section
          id="dossier"
          className="dossier"
          aria-label="Skill dossier"
          tabIndex={-1}
        >
          {!selected ? (
            <div className="empty-dossier">
              <span className="eyebrow">THE WORKING FILE</span>
              <h2>
                Read what your agents
                <br />
                actually use.
              </h2>
              <p>
                Inspect a personal skill, its metadata and supporting files.
                Edit its real SKILL.md with explicit save feedback.
              </p>
              <p className="small">
                Only the personal root is managed. Skill contents and supporting
                scripts are never executed.
              </p>
            </div>
          ) : (
            <>
              <div className="dossier-toolbar">
                <button
                  className="text-button"
                  onClick={backToList}
                  disabled={saving}
                >
                  <ArrowLeft size={15} aria-hidden="true" />
                  Back to list
                </button>
                <span className="file-state" role="status">
                  {saving
                    ? "Saving…"
                    : dirty
                      ? "Unsaved edits"
                      : file
                        ? "Disk version loaded"
                        : opening
                          ? "Reading file…"
                          : "File unavailable"}
                </span>
              </div>
              <h2 ref={dossier} tabIndex={-1}>
                {inspection?.name ?? selected}
              </h2>
              <p className="file-path">
                {file?.path ??
                  rows.find((row) => row.folder === selected)?.path}
              </p>
              {fileError && (
                <div className="paper-banner error" role="alert">
                  {fileError}
                </div>
              )}
              {externalChange && (
                <div className="paper-banner" role="alert">
                  This file changed on disk. Your draft is preserved. Export
                  your draft, then reload to review the other version. Saving
                  checks the opened version and refuses stale content.
                </div>
              )}
              {opening && <p role="status">Reading SKILL.md…</p>}
              {!file && !opening && (
                <button
                  className="secondary"
                  onClick={() => void open(selected)}
                >
                  Retry read
                </button>
              )}
              {file && inspection && (
                <>
                  <dl className="file-facts">
                    <div>
                      <dt>Modified on disk</dt>
                      <dd>{modified(file.modifiedMs)}</dd>
                    </div>
                    <div>
                      <dt>File</dt>
                      <dd>SKILL.md · UTF-8</dd>
                    </div>
                  </dl>
                  <div className="file-actions">
                    <button
                      className={editing ? "secondary" : "primary"}
                      disabled={saving}
                      onClick={() => setEditing(!editing)}
                    >
                      {editing ? "Inspect draft" : "Edit SKILL.md"}
                    </button>
                    <button
                      className="primary"
                      disabled={!dirty || saving || savePolicy === "read-only"}
                      onClick={() => void save()}
                    >
                      {saving ? "Saving…" : "Save file"}
                    </button>
                    <button
                      className="secondary"
                      disabled={saving}
                      onClick={() => void open(file.folder)}
                    >
                      Reload disk version
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        download(
                          `${file.folder}-SKILL${dirty ? "-draft" : ""}.md`,
                          draft,
                        )
                      }
                    >
                      Export {dirty ? "draft" : "file"}
                    </button>
                  </div>
                  <section aria-label="Validation" className="validation">
                    <h3>
                      Validation{" "}
                      <span>
                        {inspection.diagnostics.length + file.diagnostics.length
                          ? "Needs attention"
                          : "No problems found"}
                      </span>
                    </h3>
                    {(inspection.diagnostics.length > 0 ||
                      file.diagnostics.length > 0) && (
                      <ul>
                        {inspection.diagnostics.map((item, index) => (
                          <li key={`metadata-${index}`}>
                            <strong>{item.severity}:</strong> {item.message}
                          </li>
                        ))}
                        {file.diagnostics.map((message, index) => (
                          <li key={`fs-${index}`}>{message}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                  {editing ? (
                    <div className="raw-editor">
                      <label htmlFor="skill-source">Raw SKILL.md</label>
                      <p className="small">
                        Edit the entire source, including frontmatter. Unknown
                        metadata and supporting files are preserved. Validation
                        is advisory so malformed files can be repaired.
                      </p>
                      <textarea
                        id="skill-source"
                        value={draft}
                        onChange={(event) => {
                          const text = event.target.value;
                          setDraft((current) => updateRawDraft(current, text));
                        }}
                        spellCheck={false}
                        disabled={saving}
                      />
                    </div>
                  ) : (
                    <>
                      <section className="metadata">
                        <h3>Metadata</h3>
                        <p>
                          {inspection.description || "No readable description."}
                        </p>
                        <pre>
                          {JSON.stringify(inspection.metadata, null, 2)}
                        </pre>
                      </section>
                      <section className="instructions">
                        <h3>Instructions</h3>
                        <pre>{inspection.body}</pre>
                      </section>
                    </>
                  )}
                  <section className="supporting">
                    <h3>
                      Supporting files{" "}
                      <span>{file.supportingFiles.length}</span>
                    </h3>
                    <p className="small">
                      Paths only. These files are preserved and never run by the
                      workbench.
                    </p>
                    {file.supportingFiles.length ? (
                      <ul>
                        {file.supportingFiles.map((support) => (
                          <li key={support.path}>
                            <span>
                              {support.path}
                              {support.kind === "directory" ? "/" : ""}
                            </span>
                            <span>
                              {support.kind === "blocked"
                                ? "Blocked link / access"
                                : support.kind === "file" &&
                                    support.size !== null
                                  ? `${support.size.toLocaleString()} bytes`
                                  : support.kind}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No supporting files reported.</p>
                    )}
                  </section>
                  {file.recoveryPath && (
                    <section className="recovery">
                      <h3>Previous content recovery</h3>
                      <p className="small">
                        The previous raw file is preserved at:
                      </p>
                      <p className="file-path">{file.recoveryPath}</p>
                    </section>
                  )}
                </>
              )}
              <section className="recovery" aria-label="File recovery">
                <h3>Saved recovery copies</h3>
                <p className="small">
                  Previous versions and save drafts stay available after
                  reopening the app, including interrupted saves. Export a copy
                  for review and manual restoration. Supporting files are
                  preserved.
                </p>
                {recoveryError && (
                  <p className="paper-banner error" role="alert">
                    {recoveryError}
                  </p>
                )}
                {!recoveries.length && !recoveryError && (
                  <p className="small">
                    No recovery copies reported for this folder.
                  </p>
                )}
                <ul>
                  {recoveries.map((copy) => (
                    <li className="recovery-item" key={copy.id}>
                      <p className="small">
                        {modified(copy.createdMs)} · {copy.id}
                      </p>
                      {copy.diagnostics.map((message, index) => (
                        <p className="small" key={index}>
                          {message}
                        </p>
                      ))}
                      {copy.previousPath && (
                        <>
                          <p className="file-path">{copy.previousPath}</p>
                          <button
                            className="secondary"
                            disabled={exportingRecovery}
                            onClick={() =>
                              void exportRecovery(copy, "previous")
                            }
                          >
                            Export previous version
                          </button>
                        </>
                      )}
                      {copy.draftPath && (
                        <button
                          className="text-button"
                          disabled={exportingRecovery}
                          onClick={() => void exportRecovery(copy, "draft")}
                        >
                          Export saved draft
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </section>
      </main>
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button className="text-button" onClick={() => setNotice("")}>
            Dismiss
          </button>
        </div>
      )}
      {legacy && (
        <Modal title="Legacy archive recovery" onClose={() => setLegacy(null)}>
          <div className="form-body">
            <p>
              The old JSON archive is separate from your installed skills. Both
              stored copies are preserved. Export and review them before
              deciding whether any content needs a manual migration.
            </p>
            {legacy.map((copy) => (
              <section className="legacy-copy" key={copy.source}>
                <h3>
                  {copy.source === "primary"
                    ? "Primary archive"
                    : "Previous archive backup"}
                </h3>
                <p>
                  {copy.error ??
                    (copy.raw === null
                      ? "No stored copy found."
                      : `${copy.count} legacy records. Not migrated to skill folders.`)}
                </p>
                {copy.raw !== null && (
                  <button
                    className="secondary"
                    onClick={() =>
                      download(
                        `skill-archive-legacy-${copy.source}.json`,
                        copy.raw!,
                        "application/json",
                      )
                    }
                  >
                    Export {copy.source} {copy.error ? "raw data" : "archive"}
                  </button>
                )}
              </section>
            ))}
            <p className="small">
              No archive data is deleted, imported, replaced or automatically
              converted here. A corrupt copy can still be exported as raw data.
            </p>
            <button className="primary" onClick={() => setLegacy(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
