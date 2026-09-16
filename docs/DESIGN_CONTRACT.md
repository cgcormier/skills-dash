# Design contract

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
- Identity surfaces may be loud; navigation moderate; repeated data restrained; forms quiet.

## Accessibility and viewport rules
Visible focus, semantic table and buttons, labeled native form fields, modal focus containment/return, Escape handling, high contrast text. Main list remains usable without imagery. At narrow widths hide inspector and open full dossier, collapse rail to drawer; never shrink all columns.

## Assets
Supplied reference images are copied locally for this private implementation. They are not represented as original commissioned artwork. Public redistribution needs appropriate asset rights or replacement artwork. Fonts include their upstream OFL licensing through Fontsource packages.
