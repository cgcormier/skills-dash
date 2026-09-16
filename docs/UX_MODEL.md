# UX model

## Concepts considered before implementation

| Concept | Navigation and default surface | Selection and editing | Search/commands | Expression | Scaling and narrow windows |
| --- | --- | --- | --- | --- | --- |
| Archive workbench (selected) | Collection rail, dense index, contextual dossier; Atlas and Posters alternate projections | One stable selected ID, explicit structured editor, quick favorite/status controls | Global command palette plus persistent collection filters | Limited print plate masthead, ruled records, paper dossier | Dense list handles medium libraries; rail collapses and dossier becomes a dedicated screen |
| Dossier notebook | One document at a time with breadcrumb and previous/next | Full-page Markdown authoring; relationships as backlinks | Command search opens documents | Large editorial covers and marginal metadata | Strong writing focus; weaker comparison and bulk retrieval; naturally narrow |
| Spatial studio | Category map is primary, searchable outline as drawer | Node selection opens edit sheet; drag layout separate from data | Palette jumps to node or collection | X-ray topology and poster groups | Good relationship exploration but poor dense retrieval; needs list substitute on narrow screens |

The workbench best supports repeated retrieval and precise editing. It incorporates the notebook's focused dossier and the studio's explicit relationship projection without making spatial interaction mandatory.

## Domain
User confirmed AI agent skills and instructions. Skills have title, description, category, tags, status, favorite, Markdown instructions, explicit related IDs, and timestamps. Starter records are examples, not measured usage or imported installed skills. No execution or hidden filesystem mutation occurs.

## Interaction contract
- Collection/category/status/search/sort apply to all views. Selection persists by ID; a filtered-out record is not silently substituted.
- Index offers quick favorite/status editing. Dossier offers readable instructions and explicit related links. Edit form uses Save/Cancel with dirty-close confirmation.
- Atlas draws only stored relationships and also provides semantic keyboard-accessible links. Posters are an expressive browsing projection, never the only retrieval surface.
- Ctrl/Cmd+K opens commands; `/` focuses search; arrows move index selection; Enter opens dossier; N creates and E edits outside inputs; Escape closes overlays; Ctrl/Cmd+Z undoes domain edits outside inputs; Ctrl/Cmd+S saves an open editor.
- URL query state supports selection, view, query and filters with browser back/forward. Local preferences are stored independently of domain data.
- Local workspace commits automatically after explicit form saves and quick edits. Save errors remain visible with retry; validation fails before mutation. Import replacement requires a review/confirmation and is undoable. Export is an independent versioned JSON backup.
- Narrow screens collapse navigation into a drawer and open details as a dedicated view, rather than squeezing three columns.
- Reduced effects remove photographic decoration; reduced motion removes transitions. All data and controls remain usable.

## Recovery
Persist versioned validated JSON with one previous-valid backup. Never overwrite invalid storage with seeds. Load failure offers retry, backup recovery and file import. Session undo is capped at 30 states. SQLite is deferred until querying/concurrency scale warrants its maintenance cost.
