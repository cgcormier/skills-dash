# Skill Archive motion and UX brainstorming prompt

You are reviewing Skill Archive to propose a substantial improvement in animation
and interaction coherence through a small, carefully chosen set of changes.
Explore widely, including ideas that coordinate several objects or reorganize a
flow, then recommend a restrained result that still feels like this application.

**Mode: report.** This run authorizes inspection, the global skill setup below,
and writing the requested planning report. Application changes belong to a later
explicit implementation request. Do not treat earlier permission for small UI
polish as a switch out of this prompt's report mode.

The governing constraint is:

> Every animation must express a relationship or explain a change.

## Establish context and load the skill

Work in `C:\Users\ccorm\skills-dash-worktrees\feature-skill-improvement-v1`.
Check the active branch and worktree; preserve unrelated changes. Read applicable
`AGENTS.md` instructions, `docs/PROJECT_STATE.md`, `docs/DESIGN_CONTRACT.md`,
`docs/UX_MODEL.md`, and the development/verification commands in `README.md`.
Read the relevant components and state transitions before proposing changes.

Use **$motion-relationships**, stored at:

`C:\Users\ccorm\.agents\skills\motion-relationships\SKILL.md`

It is a general-purpose global skill, not an app-specific design specification.
Read its actual contents and apply it explicitly to every partition below. Load
it once; do not duplicate its full instructions or count each partition as a
separate skill-use request.

If this prompt is used in a fresh environment where the skill is absent, first
create a minimal global `motion-relationships/SKILL.md` under `~/.agents/skills/`.
Include a discoverable name/description, the governing constraint, report as the
default, explicit implementation mode, the four scope levels, separate abstraction
levels, a short inspect -> identify relationship -> compare -> critique ->
recommend workflow, and a structured report guide. Keep app-specific partitions
in this prompt. One concise skill file is enough; add no helper scripts or extra
resource folders without a concrete need. Validate it, read it back, then invoke
and apply it. Reuse a compatible existing skill rather than replacing it blindly.

## Understand the product before designing motion

The current application is a workbench for real personal skill files: a path and
actions header, searchable ruled file list, and warm paper dossier/raw editor.
Opt-in skill improvement extends the dossier and settings. Real files and native
operation results remain authoritative. Browser fixtures are test evidence, not
proof of native integration.

The intended character is precise, calm, and print-like: ink, paper, rules, Anton,
Inter, IBM Plex Mono, and a restrained accent. Read the current revision sections
of the contracts before using historical references to retired surfaces.

Inspect the current application where safely available. Use isolated browser
contexts and test fixtures for states requiring edits or lifecycle activity.
Do not mutate personal skills, enable review, apply/restore proposals, or restart
the user's running application to produce a brainstorming report. If a state is
available only through code or a fixture, label that evidence honestly.

Start with a short journey map: discover -> search -> select -> inspect/edit ->
save/recover, plus evidence -> review -> proposal -> decision. Identify where the
user must mentally reconnect objects, infer an outcome, recover orientation, or
manage competing attention. Good existing behavior is part of the baseline.

## Apply the skill across these explicit partitions

Scope means how much of the interface participates. Abstraction means the lens:
concrete states/geometry, relationships among objects, or structural alternatives
to roles, grouping, and navigation. A larger scope is not automatically better.

For each partition, begin its analysis with a short invocation statement:

`Using $motion-relationships: partition Pn; scope=...; abstraction=...; mode=report.`

This is an analysis brief, not a shell command. Verify the listed anchors against
the current source. An anchor locates behavior; it does not restrict an idea to
that DOM element or file.

| ID  | Explicit partition                                                              | Scope and abstraction                                                   | Inspect and explore                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Refresh files and its outcome                                                   | One control; concrete, then relational                                  | Trace the header action through loading, list changes, and errors. Consider how the initiating control and affected content communicate one operation. Expand participants only when that relationship needs them.                                                                                                                             |
| P2  | Search, result counts, file rows, and keyboard focus                            | One section; relational                                                 | Explore query -> changing results -> clear -> restored context, including zero matches and rapid input. Consider spatial continuity, stable anchors, and whether a static UX repair helps more than motion.                                                                                                                                    |
| P3  | Selecting a file, opening its dossier, switching files, and Back to list        | Whole working page; relational and spatial                              | Consider what should retain identity across list and dossier on wide windows and between single views on narrow windows. Include async reads, loading/error states, focus, scroll position, and dirty-navigation guards.                                                                                                                       |
| P4  | Inspect/edit, draft state, Save file, reload, feedback, and recovery access     | Dossier section; relational                                             | Explore how a file moves between disk version, editable draft, checked save, conflict, and recovery. Link cause to its real outcome; keep the draft, error, and active file understandable throughout.                                                                                                                                         |
| P5  | Evidence, effective mode, reviews, diff, validation, decisions, and restoration | Improvement section; structural within the feature                      | Look at the whole evidence-to-decision sequence. Explore grouping, progressive disclosure, emphasis, and transitions across several controls and information regions. Keep observed evidence, reviewer rationale, validation, and publication outcomes distinct.                                                                               |
| P6  | Settings, legacy recovery, and shared modal attention                           | Dialog sections and their originating controls; concrete and relational | Explore entry/exit, the relationship to the invoking action, focus containment/return, pinned controls, scrolling, and narrow windows. Define what remains anchored while attention changes.                                                                                                                                                   |
| P7  | A consistent movement language across the workbench                             | Whole app; relational                                                   | Reconcile movement direction, anchors, timing, interruption, focus, feedback, and competing transitions. Identify shared rules and places where staying still is valuable.                                                                                                                                                                     |
| P8  | Alternative organization of the working experience                              | Whole app; structural and abstract                                      | Explore at least two genuinely different arrangements of object roles, workspace regions, or navigation that could reduce context changes. Buttons may move with their task, a section may become another region, or several elements may reorganize together. Treat these as structural proposals and trace their effects back through P1-P7. |

Likely source anchors include `src/App.tsx`, `src/styles.css`,
`src/components/WorkbenchHeader.tsx`, `src/components/WorkbenchHeader.css`,
`src/components/ImprovementControls.tsx`, and `src/components/Modal.tsx`.
Inspect domain/native behavior only as needed to understand an interaction's
guarantees. Do not redesign storage, publication, or reviewer policy.

## Iterate through exploration, critique, and synthesis

### Pass 1: Observe and diverge

For each partition, name the actual relationship or change before naming an
effect. Identify the main object, supporting objects, stable anchors, user intent,
and uncertainty. Include at least one important non-happy-path state when it
changes the idea. Separate code-observed facts, UI-observed facts, and hypotheses.

Where a useful opportunity exists, explore a quiet improvement and a more
inventive alternative. Keep the static/current baseline eligible. A partition
may reasonably end with "leave this alone" and an explanation.

Think in roles and sequences: what originates an action, what is transformed,
what makes room, what remains visible, and what should retain identity? Consider
movement of several participants, redistribution of space, emphasis, grouping,
progressive disclosure, and reversibility. Let static UX improvements carry part
of the upgrade. Treat the earlier row-to-dossier example as one hypothesis among
many; do not make it the predetermined design.

Generate before committing to an animation library or individual CSS properties.
The constraint concerns meaning; ordinary CSS remains available. A larger
technical stack is not evidence of a better concept.

### Pass 2: Critique and revise

Revisit the candidates as a skeptical product user. For each serious candidate:

- What becomes clearer or easier, and for which task?
- Can the same benefit be achieved by simpler layout, wording, or no movement?
- Does the idea preserve orientation and the identity of the active file/draft?
- What happens if the user acts again, changes direction, navigates away, receives
  an error, or gets an async result out of order?
- Does the experience still work with keyboard input, a narrow window, and
  reduced motion? What is the meaningful static equivalent?
- Which other participants or partitions must change, and which ideas conflict?
- Is the likely implementation/maintenance cost proportionate to its value?

Describe before -> transition -> after for the strongest ideas. State the role
of each participant; "fade/slide everything" is not a sufficient specification.
Use rough sequence sketches or a small diagram when it resolves spatial ambiguity.
Avoid polished mockups until a concrete design uncertainty warrants them.

Revise or remove weak ideas after this critique. Record a few meaningful
rejections and reasons so the final recommendation shows selection, not just
accumulation. Do not invent numerical quality scores or unmeasured gains.

### Pass 3: Recompose the whole app

Compare at least two coherent directions assembled from the surviving ideas.
Describe how each supports the same core tasks and what it costs in complexity.
Resolve conflicting directions, anchors, spatial metaphors, timings, and attention
demands across partitions. Avoid adding one independently clever effect per area.

Recommend one small first package: approximately one signature relationship plus
one to three supporting UX/motion changes, or fewer when the evidence supports it.
Explain why the package works together and why the larger ideas should wait.
Group linked changes by user-visible behavior rather than by CSS selector.

Choose what stays still. Keep actions usable immediately, give the user control
over pacing, and keep reading/editing surfaces calm after the transition ends.

## Keep the existing contract visible

The existing motion contract uses deterministic 140-200ms opacity/transform,
no loops, and OS reduced-motion support. Effects reduction is independent.
Work within that baseline first. If a stronger concept needs a different timing,
new navigation, rearranged controls, or another contract change, state the exact
deviation, benefit, tradeoff, and affected areas separately. A brainstorming idea
does not authorize changing the contract.

Preserve visible errors, honest pending/success states, dirty-draft protection,
checked file saves, accessible focus, and browser/native distinctions. Animation
must follow real state and must not fabricate progress, conceal a failure, hold
up a completed operation, or drive publication/review behavior.

Avoid ambient spectacle, gratuitous perspective, continuous movement, scroll
hijacking, and moving text while the user reads or edits. These boundaries should
focus invention on useful relationships rather than eliminate ambitious ideas.

## Deliver the report and implementation handoff

Write `docs/MOTION_UX_REVIEW.md` after completing the passes. Keep it practical:

1. Product intent, inspected evidence, journey map, and important unknowns.
2. P1-P8 findings with their scope/abstraction and stable candidate IDs; make
   cross-partition dependencies explicit and avoid duplicate recommendations.
3. Concise alternatives and the critique that changed or eliminated ideas.
4. Two coherent directions, the recommended small package, and what stays still.
5. Detailed before/transition/after sequences for the recommended package,
   including state ownership, focus, interruption, failures, and reduced motion.
6. Qualitative value/effort/risk/confidence, likely files, dependencies, proposed
   contract deviations, and a short phased implementation plan with acceptance
   checks using the repository's existing commands and isolated browser workflow.
7. Deferred structural ideas and remaining decisions, with concrete reasons.

Use the skill's structured report guide without filling it mechanically for
every button. Report what was inspected and what remains a hypothesis. Update
`docs/PROJECT_STATE.md` only with verified planning/implementation state.

Finish with a short recommendation and the report link. This run ends with the
report; it does not implement the proposed UI or launch another task.

For a later explicit implementation request, reuse the chosen candidate IDs and
the same skill in implement mode. Apply the authorized package in reviewable
stages, validate real behavior, and update the contracts to match the result.
Broader ideas remain proposals unless included in that implementation request.
