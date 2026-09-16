import type { Skill, Workspace } from '../domain/workspace';

const records: [string, string, string, string, string[], string[]][] = [
  ['interface-design', 'Interface design', 'Design', 'Build interfaces with a point of view. Make every detail earn its place.', ['ui', 'composition', 'accessibility'], ['design-review', 'design-systems']],
  ['design-review', 'Design review', 'Design', 'A critical second look at hierarchy, clarity, contrast and interaction.', ['critique', 'accessibility'], ['interface-design']],
  ['design-systems', 'Design systems', 'Design', 'Turn visual decisions into reusable tokens, patterns and components.', ['tokens', 'components'], ['interface-design', 'frontend-development']],
  ['frontend-development', 'Frontend development', 'Development', 'Translate product intent into maintainable, accessible web interfaces.', ['react', 'typescript', 'web'], ['code-review', 'design-systems']],
  ['code-review', 'Code review', 'Development', 'Find correctness risks before they become production problems.', ['quality', 'review'], ['test-engineering']],
  ['test-engineering', 'Test engineering', 'Development', 'Test observable behavior, failure paths and the contracts that matter.', ['testing', 'verification'], ['code-review']],
  ['research-synthesis', 'Research synthesis', 'Research', 'Connect evidence, surface disagreements and identify what remains unknown.', ['evidence', 'synthesis'], ['technical-writing']],
  ['source-verification', 'Source verification', 'Research', 'Trace important claims back to primary evidence and check their limits.', ['sources', 'fact-check'], ['research-synthesis']],
  ['technical-writing', 'Technical writing', 'Writing', 'Explain complex systems with precise language and useful examples.', ['docs', 'clarity'], ['research-synthesis']],
  ['editorial-review', 'Editorial review', 'Writing', 'Sharpen structure, cut repetition and preserve the author’s intent.', ['editing', 'voice'], ['technical-writing']],
  ['release-readiness', 'Release readiness', 'Operations', 'Verify the build, recovery path and handoff before shipping a change.', ['release', 'checklist'], ['test-engineering']],
  ['workflow-design', 'Workflow design', 'Operations', 'Make repeatable work explicit, inspectable and easier to recover.', ['process', 'automation'], ['release-readiness']],
];

const instructions: Record<string, string> = {
  'interface-design': '# Interface design\n\n## When to use\nUse when creating or refining a product interface, page, component, or interaction.\n\n## Working method\n1. Understand the task, audience and constraints before choosing a style.\n2. Establish a clear information hierarchy and one primary action.\n3. Separate semantic controls from expressive composition.\n4. Build with accessible HTML, visible focus and predictable navigation.\n5. Inspect the rendered result at desktop and narrow widths.\n\n## Quality bar\nTypography should carry the hierarchy. Spacing should express relationships. Decoration must never obscure the work.\n\n## Handoff\nDescribe what changed, what was verified and any remaining limitations.',
  'code-review': '# Code review\n\n## When to use\nReview a focused change before merging or handing it off.\n\n## Working method\n1. Read the intended behavior and relevant call sites.\n2. Trace error handling, boundary inputs and state transitions.\n3. Reproduce a suspected problem before declaring a defect.\n4. Prioritize concrete correctness risks over stylistic preferences.\n\n## Deliverable\nGive each finding a file reference, impact and actionable fix. State which checks were actually run.',
  'research-synthesis': '# Research synthesis\n\n## When to use\nSeveral sources or perspectives must inform a decision.\n\n## Working method\n1. Frame the question and distinguish evidence from assumptions.\n2. Prefer primary sources and record their dates.\n3. Preserve important disagreements rather than forcing consensus.\n4. Compare findings against the actual decision criteria.\n\n## Deliverable\nProvide a concise synthesis, linked evidence, uncertainties and next questions.',
};

export function starterWorkspace(): Workspace {
  const date = new Date().toISOString();
  const skills: Skill[] = records.map(([id, title, category, summary, tags, relatedIds], index) => ({
    id, title, category, summary, tags, relatedIds,
    status: index === 4 || index === 11 ? 'draft' : 'active',
    favorite: index === 0 || index === 3 || index === 6,
    createdAt: date, updatedAt: date,
    body: instructions[id] || `# ${title}\n\n## When to use\n${summary}\n\n## Working method\n1. Read the request and inspect the relevant source material.\n2. Identify constraints, intended outcomes and uncertainty.\n3. Perform the smallest coherent unit of work.\n4. Verify the result against observable criteria.\n\n## Handoff\nReport the outcome, evidence, limitations and next action.\n\n---\nStarter instruction — customize this record for your own workflow.`,
  }));
  return { version: 1, skills };
}
