import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Command,
  FileText,
  Folder,
  Grid2X2,
  HelpCircle,
  List,
  Menu,
  Network,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
  Upload,
  Undo2,
  X,
} from "lucide-react";
import { useWorkspace } from "./hooks/useWorkspace";
import { useViewState, type ViewState } from "./hooks/useViewState";
import {
  createSkill,
  filterSkills,
  parseImport,
  MAX_BYTES,
  type Skill,
  type Status,
} from "./domain/workspace";
import { isDesktop } from "./storage/adapter";
import { Modal } from "./components/Modal";
import { SkillEditor } from "./components/SkillEditor";
import { Dossier } from "./components/Dossier";
import { Atlas, Posters, SkillIndex } from "./components/Views";
import { WindowControls } from "./components/WindowControls";

type Preferences = {
  colorway: "red" | "orange" | "xray";
  effects: "full" | "reduced" | "none";
  density: "comfortable" | "compact";
};
const defaultPreferences: Preferences = {
  colorway: "red",
  effects: "full",
  density: "comfortable",
};
function readPreferences(): Preferences {
  try {
    const p = JSON.parse(
      localStorage.getItem("skill-archive.preferences") || "{}",
    );
    return {
      colorway: ["red", "orange", "xray"].includes(p.colorway)
        ? p.colorway
        : "red",
      effects: ["full", "reduced", "none"].includes(p.effects)
        ? p.effects
        : "full",
      density: p.density === "compact" ? "compact" : "comfortable",
    };
  } catch {
    return defaultPreferences;
  }
}

export default function App() {
  const store = useWorkspace();
  const [view, setView] = useViewState();
  const [preferences, setPreferences] = useState(readPreferences);
  const [editor, setEditor] = useState<{ skill: Skill; isNew: boolean } | null>(
    null,
  );
  const [palette, setPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [pendingImport, setPendingImport] = useState<{
    text: string;
    name: string;
    count: number;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skills = store.workspace?.skills ?? [];
  const visible = useMemo(
    () =>
      filterSkills(skills, {
        query: view.query,
        category: view.category,
        status: view.status,
        favoritesOnly: view.collection === "pinned",
        sort: view.sort,
      }),
    [skills, view],
  );
  const selected = skills.find((s) => s.id === view.selected);
  const categories = [...new Set(skills.map((s) => s.category))].sort();
  const filtersActive =
    !!view.query ||
    !!view.category ||
    !!view.status ||
    view.collection === "pinned";

  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5500);
  }
  function attempt(action: () => void) {
    try {
      action();
    } catch (error) {
      notify(String(error));
    }
  }
  function newSkill() {
    if (!store.workspace) {
      notify("Recover or import a workspace before creating a skill.");
      return;
    }
    setEditor({ skill: createSkill({ title: "" }), isNew: true });
  }

  useEffect(() => {
    if (!navOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = sidebarRef.current;
    const controls = () => [
      ...(sidebar?.querySelectorAll<HTMLElement>("button, a[href]") ?? []),
    ];
    controls()[0]?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setNavOpen(false);
      }
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    function resize() {
      if (window.innerWidth > 680) setNavOpen(false);
    }
    sidebar?.addEventListener("keydown", trap);
    window.addEventListener("resize", resize);
    return () => {
      sidebar?.removeEventListener("keydown", trap);
      window.removeEventListener("resize", resize);
      previous?.focus();
    };
  }, [navOpen]);
  function openSkill(id: string) {
    setView({ selected: id, view: "dossier" });
  }
  function selectSkill(id: string) {
    setView({
      selected: id,
      ...(window.innerWidth < 1180 ? { view: "dossier" as const } : {}),
    });
  }
  function clearFilters() {
    setView({ query: "", category: "", status: "", collection: "all" });
  }
  function updatePreferences(next: Preferences) {
    setPreferences(next);
    try {
      localStorage.setItem("skill-archive.preferences", JSON.stringify(next));
    } catch {
      notify("Preferences apply for this session. Storage is unavailable.");
    }
  }
  function exportFile() {
    if (!store.workspace) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(store.workspace, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `skill-archive-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Workspace export prepared.");
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > MAX_BYTES)
        throw new Error("Choose a file smaller than 5 MB.");
      const text = await file.text();
      if (/\.md$/i.test(file.name)) {
        const heading = text.match(/^#\s+(.+)$/m)?.[1];
        setEditor({
          skill: createSkill({
            title: (heading || file.name.replace(/\.md$/i, "")).slice(0, 160),
            body: text,
            summary: "Imported Markdown instructions. Review before saving.",
          }),
          isNew: true,
        });
      } else {
        const data = parseImport(text);
        setPendingImport({ text, name: file.name, count: data.skills.length });
      }
    } catch (error) {
      notify(String(error));
    }
    if (importRef.current) importRef.current.value = "";
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const typing =
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable;
      const modalOpen =
        editor ||
        palette ||
        settings ||
        help ||
        pendingImport ||
        document.querySelector("dialog[open]");
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        !editor &&
        !settings &&
        !help &&
        !pendingImport &&
        (!document.querySelector("dialog[open]") || palette)
      ) {
        event.preventDefault();
        setPalette((value) => !value);
        setCommandQuery("");
        return;
      }
      if (typing || modalOpen || !store.workspace) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key.toLowerCase() === "n" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        newSkill();
      }
      if (
        event.key.toLowerCase() === "e" &&
        !event.ctrlKey &&
        !event.metaKey &&
        selected
      )
        setEditor({ skill: selected, isNew: false });
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        store.undo();
      }
      if (event.key === "Escape") setNavOpen(false);
      if (event.key === "Enter" && target === document.body && selected)
        openSkill(selected.id);
      if (
        ["ArrowUp", "ArrowDown"].includes(event.key) &&
        view.view === "index" &&
        (target === document.body || !!target.closest(".skill-table"))
      ) {
        event.preventDefault();
        const index = visible.findIndex((s) => s.id === view.selected);
        const next = Math.max(
          0,
          Math.min(
            visible.length - 1,
            index + (event.key === "ArrowDown" ? 1 : -1),
          ),
        );
        if (visible[next]) {
          setView({ selected: visible[next].id }, true);
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLButtonElement>("tr.selected .skill-name")
              ?.focus(),
          );
        }
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const commandItems = [
    { title: "Create a new skill", detail: "ACTION / N", action: newSkill },
    {
      title: "Open skill index",
      detail: "VIEW",
      action: () => setView({ view: "index" }),
    },
    {
      title: "Explore relationship atlas",
      detail: "VIEW",
      action: () => setView({ view: "atlas" }),
    },
    {
      title: "Browse poster collection",
      detail: "VIEW",
      action: () => setView({ view: "posters" }),
    },
    {
      title: "Import instructions or workspace",
      detail: "ACTION",
      action: () => importRef.current?.click(),
    },
    { title: "Export workspace backup", detail: "ACTION", action: exportFile },
    {
      title: "Appearance and preferences",
      detail: "SETTINGS",
      action: () => setSettings(true),
    },
    ...skills.map((skill) => ({
      title: skill.title,
      detail: skill.category.toUpperCase(),
      action: () => openSkill(skill.id),
    })),
  ].filter((item) =>
    item.title.toLowerCase().includes(commandQuery.toLowerCase()),
  );

  const dossierProps = selected
    ? {
        skill: selected,
        skills,
        onEdit: () => setEditor({ skill: selected, isNew: false }),
        onSelect: (id: string) => setView({ selected: id }),
        onExpand: () => setView({ view: "dossier" }),
        onBack: () => setView({ view: "index" }),
        onFavorite: () =>
          attempt(() =>
            store.updateSkill(selected.id, { favorite: !selected.favorite }),
          ),
        onArchive: () =>
          attempt(() => {
            store.updateSkill(selected.id, {
              status: selected.status === "archived" ? "active" : "archived",
            });
            notify(
              selected.status === "archived"
                ? "Skill restored. Undo is available."
                : "Skill archived. Undo is available.",
            );
          }),
        notify,
      }
    : null;

  return (
    <div
      className="app"
      data-colorway={preferences.colorway}
      data-effects={preferences.effects}
      data-density={preferences.density}
      data-native={isDesktop()}
    >
      <a href="#workspace" className="skip-link">
        Skip to workspace
      </a>
      {navOpen && (
        <button
          className="nav-backdrop"
          onClick={() => setNavOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <div
        ref={sidebarRef}
        className={`sidebar ${navOpen ? "open" : ""}`}
        aria-label="Workspace navigation"
        role={navOpen ? "dialog" : "complementary"}
        aria-modal={navOpen ? true : undefined}
      >
        {navOpen && (
          <button
            className="icon-button drawer-close"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation drawer"
          >
            <X size={18} />
          </button>
        )}
        <a
          className="brand"
          href="?view=index"
          onClick={(e) => {
            e.preventDefault();
            setView({ view: "index" });
            setNavOpen(false);
          }}
        >
          <span className="brand-mark">
            S<span>/</span>A
          </span>
          <span>
            SKILL
            <br />
            ARCHIVE<span className="brand-dot">®</span>
          </span>
        </a>
        <button
          className="command-launcher"
          onClick={() => {
            setPalette(true);
            setNavOpen(false);
          }}
        >
          <Search size={15} /> Find anything <kbd>⌃ K</kbd>
        </button>
        <nav>
          <span className="nav-label">WORKSPACE</span>
          <button
            className={`nav-item ${view.collection === "all" && !view.status && !view.category ? "active" : ""}`}
            onClick={() => {
              clearFilters();
              setView({ view: "index" });
              setNavOpen(false);
            }}
          >
            <Archive size={17} />
            <span>All skills</span>
            <b>{String(skills.length).padStart(2, "0")}</b>
          </button>
          <button
            className={`nav-item ${view.collection === "pinned" ? "active" : ""}`}
            onClick={() => {
              setView({
                collection: "pinned",
                category: "",
                status: "",
                view: "index",
              });
              setNavOpen(false);
            }}
          >
            <Star size={17} />
            <span>Pinned</span>
            <b>
              {String(skills.filter((s) => s.favorite).length).padStart(2, "0")}
            </b>
          </button>
          <button
            className={`nav-item ${view.status === "draft" ? "active" : ""}`}
            onClick={() => {
              setView({
                status: "draft",
                category: "",
                collection: "all",
                view: "index",
              });
              setNavOpen(false);
            }}
          >
            <FileText size={17} />
            <span>Drafts</span>
            <b>
              {String(
                skills.filter((s) => s.status === "draft").length,
              ).padStart(2, "0")}
            </b>
          </button>
          <span className="nav-label category-heading">
            COLLECTIONS <span>{categories.length}</span>
          </span>
          {categories.map((category) => (
            <button
              key={category}
              className={`nav-item category-nav ${view.category === category ? "active" : ""}`}
              onClick={() => {
                setView({
                  category,
                  status: "",
                  collection: "all",
                  view: "index",
                });
                setNavOpen(false);
              }}
            >
              <span className="collection-square" />
              <span>{category}</span>
              <b>
                {String(
                  skills.filter((s) => s.category === category).length,
                ).padStart(2, "0")}
              </b>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() => {
              setSettings(true);
              setNavOpen(false);
            }}
          >
            <Settings2 size={16} />
            <span>Preferences</span>
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setHelp(true);
              setNavOpen(false);
            }}
          >
            <HelpCircle size={16} />
            <span>Field guide</span>
            <kbd>?</kbd>
          </button>
          <div className="local-indicator">
            <span className="status-dot" />
            {isDesktop() ? "NATIVE WORKSPACE" : "BROWSER WORKSPACE"}
          </div>
        </div>
      </div>
      <div className="application-body" inert={navOpen}>
        <header
          className="topbar"
          data-tauri-drag-region={isDesktop() ? true : undefined}
          title={
            isDesktop()
              ? "Drag to move · Double-click to fit or restore"
              : undefined
          }
        >
          <div
            className="breadcrumb"
            data-tauri-drag-region={isDesktop() ? true : undefined}
          >
            <button
              className="icon-button mobile-menu"
              onClick={() => setNavOpen(!navOpen)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <Folder size={14} />
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>
              {view.view === "dossier"
                ? "Dossier"
                : view.category ||
                  (view.collection === "pinned"
                    ? "Pinned skills"
                    : "All skills")}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className={`save-state ${store.saveStatus}`} role="status">
              {store.saveStatus === "saved" ? (
                <CheckCircle2 size={13} />
              ) : (
                <span className="status-dot" />
              )}
              {store.saveStatus === "saved"
                ? "Saved locally"
                : store.saveStatus === "saving"
                  ? "Saving…"
                  : store.saveStatus === "loading"
                    ? "Opening…"
                    : "Save needs attention"}
            </span>
            <button
              className="icon-button undo-button"
              onClick={store.undo}
              disabled={!store.canUndo}
              aria-label="Undo last change"
              title="Undo last change (Ctrl+Z)"
            >
              <Undo2 size={17} />
            </button>
            <span className="topbar-divider" />
            <button
              className="topbar-command"
              aria-label="Open command palette"
              onClick={() => setPalette(true)}
            >
              <Command size={14} />
              <kbd>K</kbd>
            </button>
            {isDesktop() && <WindowControls notify={notify} />}
          </div>
        </header>
        <main id="workspace" tabIndex={-1} className="workspace">
          {store.error && (
            <div className="error-banner" role="alert">
              <p>{store.error}</p>
              <div>
                <button onClick={store.retry}>Retry</button>
                <button
                  onClick={() =>
                    void store
                      .recoverBackup()
                      .then(() => notify("Previous backup restored."))
                      .catch((e) => notify(String(e)))
                  }
                >
                  Recover backup
                </button>
                <button onClick={() => importRef.current?.click()}>
                  Import backup
                </button>
              </div>
            </div>
          )}
          {store.loading ? (
            <div className="empty-state">
              <span className="eyebrow">OPENING THE ARCHIVE</span>
              <h1>A moment, please.</h1>
            </div>
          ) : !store.workspace ? (
            <div className="empty-state">
              <Archive size={32} />
              <h1>Your data is still safe.</h1>
              <p>Resolve the storage error above to reopen the workspace.</p>
            </div>
          ) : (
            <>
              {view.view !== "dossier" && (
                <section
                  className="collection-heading"
                  aria-label="Skill archive introduction"
                >
                  <div>
                    <h1>
                      {view.category ||
                        (view.collection === "pinned"
                          ? "Pinned skills"
                          : view.status === "draft"
                            ? "Drafts"
                            : "Your skills")}
                    </h1>
                    <p>Find an instruction. Make it your own.</p>
                  </div>
                </section>
              )}
              <div
                className={`workbench ${view.view === "dossier" ? "dossier-workbench" : dossierProps ? "with-inspector" : ""}`}
              >
                <section
                  className="collection-panel"
                  aria-label="Skill collection"
                >
                  <div className="view-toolbar">
                    <div className="view-tabs" aria-label="Collection views">
                      {(
                        [
                          ["index", List, "Index"],
                          ["atlas", Network, "Atlas"],
                          ["posters", Grid2X2, "Posters"],
                        ] as const
                      ).map(([key, Icon, label]) => (
                        <button
                          key={key}
                          className={view.view === key ? "active" : ""}
                          aria-pressed={view.view === key}
                          onClick={() => setView({ view: key })}
                        >
                          <Icon size={15} />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                    <button className="primary new-skill" onClick={newSkill}>
                      <Plus size={16} />
                      <span>New skill</span>
                    </button>
                  </div>
                  {view.view === "dossier" ? (
                    dossierProps ? (
                      <Dossier {...dossierProps} full />
                    ) : (
                      <div className="empty-state">
                        <h2>Record not found.</h2>
                        <p>
                          It may have been removed or replaced by an import.
                        </p>
                        <button
                          className="secondary"
                          onClick={() => setView({ view: "index" })}
                        >
                          <ArrowLeft size={16} /> Return to index
                        </button>
                      </div>
                    )
                  ) : (
                    <>
                      <div className="filter-toolbar">
                        <div className="search-box">
                          <Search size={16} />
                          <input
                            ref={searchRef}
                            aria-label="Search skills"
                            placeholder="Search skills, tags, instructions…"
                            value={view.query}
                            onChange={(e) =>
                              setView({ query: e.target.value }, true)
                            }
                          />
                          {view.query ? (
                            <button
                              className="icon-button"
                              onClick={() => setView({ query: "" }, true)}
                              aria-label="Clear search"
                            >
                              <X size={14} />
                            </button>
                          ) : (
                            <kbd>/</kbd>
                          )}
                        </div>
                        <button
                          className="secondary filter-toggle"
                          aria-expanded={filtersOpen}
                          aria-controls="collection-filters"
                          onClick={() => setFiltersOpen(!filtersOpen)}
                        >
                          <SlidersHorizontal size={14} aria-hidden="true" />{" "}
                          Filters
                          {(view.status ||
                            view.category ||
                            view.sort !== "title") && (
                            <span className="status-dot" />
                          )}
                        </button>
                      </div>
                      <div
                        id="collection-filters"
                        className="filter-options"
                        hidden={!filtersOpen}
                      >
                        <label className="filter-select">
                          <span>Status</span>
                          <select
                            aria-label="Filter status"
                            value={view.status}
                            onChange={(e) =>
                              setView({ status: e.target.value })
                            }
                          >
                            <option value="">All statuses</option>
                            <option value="active">Active</option>
                            <option value="draft">Draft</option>
                            <option value="archived">Archived</option>
                          </select>
                        </label>
                        <label className="filter-select">
                          <span>Category</span>
                          <select
                            aria-label="Filter category"
                            value={view.category}
                            onChange={(e) =>
                              setView({ category: e.target.value })
                            }
                          >
                            <option value="">All categories</option>
                            {categories.map((category) => (
                              <option key={category}>{category}</option>
                            ))}
                          </select>
                        </label>
                        <label className="filter-select">
                          <span>Sort</span>
                          <select
                            aria-label="Sort skills"
                            value={view.sort}
                            onChange={(e) =>
                              setView({
                                sort: e.target.value as ViewState["sort"],
                              })
                            }
                          >
                            <option value="title">A—Z</option>
                            <option value="updated">Recently updated</option>
                          </select>
                        </label>
                      </div>
                      <div className="collection-subhead">
                        <div>
                          <span className="record-count">
                            {visible.length} skills
                            {view.status ? ` · ${view.status}` : ""}
                            {view.category ? ` · ${view.category}` : ""}
                          </span>
                          {filtersActive && (
                            <button
                              className="clear-filters"
                              onClick={clearFilters}
                            >
                              Clear filters <X size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                      {visible.length ? (
                        <>
                          {view.view === "index" && (
                            <SkillIndex
                              skills={visible}
                              allSkills={skills}
                              selectedId={view.selected}
                              onSelect={selectSkill}
                              onOpen={openSkill}
                              onFavorite={(skill) =>
                                attempt(() =>
                                  store.updateSkill(skill.id, {
                                    favorite: !skill.favorite,
                                  }),
                                )
                              }
                              onStatus={(skill, status: Status) =>
                                attempt(() =>
                                  store.updateSkill(skill.id, { status }),
                                )
                              }
                            />
                          )}
                          {view.view === "atlas" && (
                            <Atlas
                              skills={visible}
                              allSkills={skills}
                              selectedId={view.selected}
                              onSelect={selectSkill}
                              onOpen={openSkill}
                            />
                          )}
                          {view.view === "posters" && (
                            <Posters
                              skills={visible}
                              allSkills={skills}
                              selectedId={view.selected}
                              onSelect={selectSkill}
                              onOpen={openSkill}
                            />
                          )}
                        </>
                      ) : (
                        <div className="empty-state">
                          <Search size={30} />
                          <span className="eyebrow">
                            NOTHING IN THIS DRAWER
                          </span>
                          <h2>
                            {skills.length
                              ? "No matching skills."
                              : "A collection starts with one."}
                          </h2>
                          <p>
                            {skills.length
                              ? "Try a different word or loosen the filters."
                              : "Create a skill or import your own Markdown instructions."}
                          </p>
                          <button
                            className="primary"
                            onClick={skills.length ? clearFilters : newSkill}
                          >
                            {skills.length
                              ? "Clear filters"
                              : "Create your first skill"}
                            <ArrowRight size={15} />
                          </button>
                        </div>
                      )}
                      <div className="collection-footer">
                        <span>
                          {String(visible.length).padStart(2, "0")} /{" "}
                          {String(skills.length).padStart(2, "0")} SKILLS
                        </span>
                        <span>
                          <kbd>↑</kbd>
                          <kbd>↓</kbd> Navigate{" "}
                          <span className="footer-separator">/</span>
                          <kbd>E</kbd> Edit
                        </span>
                      </div>
                    </>
                  )}
                  <div className="workspace-tools">
                    <div>
                      <button onClick={() => importRef.current?.click()}>
                        <Upload size={14} /> Import
                      </button>
                      <button onClick={exportFile}>
                        <ArrowDownToLine size={14} /> Export
                      </button>
                    </div>
                  </div>
                </section>
                {view.view !== "dossier" && dossierProps && (
                  <aside className="inspector" aria-label="Skill inspector">
                    <button
                      className="inspector-dismiss"
                      onClick={() => {
                        setView({ selected: "" });
                        requestAnimationFrame(() => searchRef.current?.focus());
                      }}
                    >
                      Hide preview <ArrowRight size={14} aria-hidden="true" />
                    </button>
                    <Dossier {...dossierProps} />
                  </aside>
                )}
              </div>
            </>
          )}
        </main>
      </div>
      <input
        type="file"
        accept=".json,.md,application/json,text/markdown"
        hidden
        ref={importRef}
        onChange={(event) => void importFile(event.target.files?.[0])}
      />
      {editor && (
        <SkillEditor
          skill={editor.skill}
          skills={skills}
          isNew={editor.isNew}
          onClose={() => setEditor(null)}
          onSave={(skill) => {
            if (editor.isNew) store.addSkill(skill);
            else store.updateSkill(skill.id, skill);
            setView({ selected: skill.id });
            setEditor(null);
            notify(
              editor.isNew
                ? "Skill added to your archive."
                : "Skill updated. Undo is available.",
            );
          }}
        />
      )}
      {palette && (
        <Modal
          title="Find your next move."
          className="command-modal"
          onClose={() => setPalette(false)}
        >
          <div className="command-search">
            <Search size={20} />
            <input
              autoFocus
              aria-label="Search commands and skills"
              value={commandQuery}
              onChange={(e) => setCommandQuery(e.target.value)}
              placeholder="Search skills or type a command…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && commandItems[0]) {
                  setPalette(false);
                  commandItems[0].action();
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  document
                    .querySelector<HTMLButtonElement>(".command-results button")
                    ?.focus();
                }
              }}
            />
          </div>
          <div
            className="command-results"
            onKeyDown={(e) => {
              const buttons = [...e.currentTarget.querySelectorAll("button")];
              const index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                buttons[
                  Math.max(
                    0,
                    Math.min(
                      buttons.length - 1,
                      index + (e.key === "ArrowDown" ? 1 : -1),
                    ),
                  )
                ]?.focus();
              }
            }}
          >
            {commandItems.length ? (
              commandItems.map((item, index) => (
                <button
                  key={`${item.title}-${index}`}
                  onClick={() => {
                    setPalette(false);
                    item.action();
                  }}
                >
                  <span>
                    {item.title}
                    <small>{item.detail}</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))
            ) : (
              <p className="command-empty">No matching skills or commands.</p>
            )}
          </div>
          <div className="command-footer">
            <kbd>↑ ↓</kbd> Navigate <kbd>Enter</kbd> Open <kbd>Esc</kbd> Close
          </div>
        </Modal>
      )}
      {settings && (
        <Modal
          title="Make it yours."
          onClose={() => setSettings(false)}
          className="settings-modal"
        >
          <div className="form-body">
            <p className="settings-intro">
              Same collection. A different print run.
            </p>
            <fieldset>
              <legend>Print plate</legend>
              <div className="colorway-options">
                {(["red", "orange", "xray"] as const).map((colorway) => (
                  <button
                    className={`colorway-option ${preferences.colorway === colorway ? "selected" : ""}`}
                    key={colorway}
                    aria-pressed={preferences.colorway === colorway}
                    onClick={() =>
                      updatePreferences({ ...preferences, colorway })
                    }
                  >
                    <span className={`swatch ${colorway}`} />
                    {colorway === "xray"
                      ? "X-ray blue"
                      : colorway === "red"
                        ? "Washed red"
                        : "Signal orange"}
                    {preferences.colorway === colorway && <Check size={14} />}
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              Visual effects
              <select
                aria-label="Visual effects"
                value={preferences.effects}
                onChange={(e) =>
                  updatePreferences({
                    ...preferences,
                    effects: e.target.value as Preferences["effects"],
                  })
                }
              >
                <option value="full">Full — photographic print surfaces</option>
                <option value="reduced">Reduced — quieter imagery</option>
                <option value="none">None — typography and data only</option>
              </select>
            </label>
            <label>
              Index density
              <select
                aria-label="Index density"
                value={preferences.density}
                onChange={(e) =>
                  updatePreferences({
                    ...preferences,
                    density: e.target.value as Preferences["density"],
                  })
                }
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <p className="settings-note">
              Motion follows your operating system’s reduced-motion preference.
              Appearance changes never change your skills.
            </p>
          </div>
          <div className="modal-footer">
            <button className="primary" onClick={() => setSettings(false)}>
              Done <Check size={16} />
            </button>
          </div>
        </Modal>
      )}
      {help && (
        <Modal title="Field guide." onClose={() => setHelp(false)}>
          <div className="form-body help-content">
            <p>
              A local home for the instructions that make your AI agents useful.
            </p>
            <h3>Three views. One collection.</h3>
            <p>
              <strong>Index</strong> finds and compares. <strong>Atlas</strong>{" "}
              reveals saved relationships. <strong>Posters</strong> makes room
              for browsing. Select a record for its dossier and use Edit skill
              to refine it.
            </p>
            <h3>Keep your work</h3>
            <p>
              Changes save on this device. Export a JSON backup to move the
              archive between browser and desktop. Import a Markdown file to
              create one skill, or a JSON export to replace the collection after
              confirmation.
            </p>
            <p>
              The initial 12 records are editable starter examples. They are not
              a scan of installed skills, and changing them does not modify
              agent configuration files.
            </p>
            <h3>Keyboard</h3>
            <dl className="keyboard-guide">
              {[
                ["Ctrl / ⌘ K", "Search skills and commands"],
                ["/", "Focus collection search"],
                ["↑ / ↓", "Move through index records"],
                ["N", "Create a skill"],
                ["E", "Edit selected skill"],
                ["Ctrl / ⌘ S", "Save the open editor"],
                ["Ctrl / ⌘ Z", "Undo a workspace change"],
                ["Esc", "Close the current overlay"],
              ].map(([key, description]) => (
                <div key={key}>
                  <dt>
                    <kbd>{key}</kbd>
                  </dt>
                  <dd>{description}</dd>
                </div>
              ))}
            </dl>
            <p className="settings-note">
              Undo covers the last 30 changes in this session. A previous saved
              workspace is retained as a recovery backup. Markdown headings and
              paragraphs are displayed safely; arbitrary HTML is never executed.
            </p>
          </div>
        </Modal>
      )}
      {pendingImport && (
        <Modal
          title="Replace this collection?"
          onClose={() => setPendingImport(null)}
        >
          <div className="form-body">
            <p>
              <strong>{pendingImport.name}</strong> contains{" "}
              {pendingImport.count} valid skills. Importing replaces the current{" "}
              {skills.length} records.
            </p>
            <p>
              Export your current collection first if you need a durable copy.
              You can also undo this import during this session.
            </p>
            <button className="secondary" onClick={exportFile}>
              <ArrowDownToLine size={15} /> Export current workspace
            </button>
          </div>
          <div className="modal-footer">
            <button
              className="secondary"
              onClick={() => setPendingImport(null)}
            >
              Cancel
            </button>
            <button
              className="primary"
              onClick={() =>
                attempt(() => {
                  const first = parseImport(pendingImport.text).skills[0];
                  store.importWorkspace(pendingImport.text);
                  setPendingImport(null);
                  setView({
                    selected: first?.id || "",
                    view: "index",
                    query: "",
                    category: "",
                    status: "",
                    collection: "all",
                  });
                  notify("Workspace imported. Undo is available.");
                })
              }
            >
              Replace collection <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          <span>{toast}</span>
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Dismiss message"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
