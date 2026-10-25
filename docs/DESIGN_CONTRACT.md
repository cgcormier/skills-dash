# Design contract

## Improvement extension — October 24, 2026

The opt-in lifecycle uses the existing ruled paper dossier and one settings
dialog. It does not add a dashboard/card grid. Diff additions/removals use both
text markers and restrained background colors. Status is stated in text;
observation evidence, model rationale and validation have distinct labels.
Native form controls have explicit labels, visible focus, narrow layouts and
the existing independently reduced effects/motion behavior.

Small labels retain readable sizes at narrow widths. Healthy file rows use muted
neutral status text; attention states use the warm warning tint and explicit issue
counts. Focus uses the bright red print plate on ink and a darker red on paper,
with at least 3:1 contrast against the surrounding surface. Paper forms use native
light controls. Dialog headers stay visible while their contents scroll.
The path header uses a plain Skills folder label, grouped actions and a compact
two-column toolbar at narrow widths; the native window controls remain separate.

## Personal workbench revision — October 18, 2026

Current layout: one root/path header, searchable ruled file list and paper
dossier/editor. Anton, Inter and IBM Plex Mono retain the print identity. One
subtle paper treatment can be disabled; reduced motion remains independent.
Photographs, alternate palettes, density controls, Atlas, Posters and category
navigation are retired from the active interface. At narrow widths show list or
dossier with Back to list, preserving keyboard focus and visible errors. The
existing sticky native header/window controls remain. The reference notes below
record the original design rationale; their old surface names are historical.

## Thesis

Precise information with the physical character of a small-run print archive. Composition carries the identity; distress is restricted to image and display surfaces. Calm forms, sharp ruled lists, generous black negative space, and a warm paper dossier.

## Reference interpretation

1. Lovers Rock: washed red/ink plates, huge compressed type, repeated lettering, deliberate folds; use hierarchy and offset rules, not its copy.
2. Orange silhouette: one flat orange field and asymmetrical negative space; optional orange colorway.
3. Eye: forensic photographic crop, cobalt/cyan and coarse reproduction; key archive visual.
4. X-ray figures: relationship and connection, paired anatomy; dossier and poster image vocabulary.
5. Lust poster: clinical annotations, oversized type, barcode and ruled composition; metadata stays sharp and readable.
6. Black PNG: appears visually empty; informs intentional negative space, not an assumed hidden motif.
7. Smoke/lips: intimate fragment and negative space; supporting poster crop, used sparingly.

## System

- Semantic colors: ink #151514, elevated ink #1d1d1b, text #ece8df, muted #aaa79f, rule #393936, paper #e7e1d4, paper text #242420.
- Print plates: red #f26158, orange #f3a62d, xray #84b9e5. One selected accent across chrome. No glow, rainbow statuses or colored card outlines.
- Type: self-hosted Anton display, Inter body, IBM Plex Mono metadata. Distortion never applies to body copy or controls.
- Geometry: 200px navigation, flexible working surface, 326px inspector; 4px spacing foundation; flat 1px rules; 36–44px controls; no rounded card grid.
- Effects: CSS grayscale/contrast and static gradients on supplied reference images; no per-frame noise, WebGL or runtime image processing. `data-effects` removes/reduces decoration.
- Motion: deterministic 140–200ms opacity/transform; no loops; OS reduced motion disables it.
- Density: comfortable or compact row spacing independent from effects and palette.
- The opening Index is quiet: compact heading, search, a ruled list and one primary create action. No promotional masthead or automatically opened preview. Posters and dossier imagery retain the print identity.
- Status/category/sort controls use an explicit Filters disclosure; active filters remain visible and clearable when collapsed. Repeated slogans and duplicate view numbering are removed.

## Accessibility and viewport rules

Visible focus, semantic table and buttons, labeled native form fields, modal focus containment/return, Escape handling, high contrast text. Main list remains usable without imagery. At narrow widths hide inspector and open full dossier, collapse rail to drawer; never shrink all columns.

Use one document scrollbar for the workspace, with a sticky header and enough scroll padding to keep focused controls visible. Navigation scrolls only when its contents exceed the window. The Atlas keeps its labeled, keyboard-focusable scroll region and a visible sideways-scroll hint. Native windows use the app header as their drag region, open maximized, and offer fit/restore plus Window options without a separate OS title strip.

## Assets

Supplied reference images are copied locally for this private implementation. They are not represented as original commissioned artwork. Public redistribution needs appropriate asset rights or replacement artwork. Fonts include their upstream OFL licensing through Fontsource packages.
