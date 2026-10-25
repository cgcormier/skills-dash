import { inspectSkill } from "../domain/skillFiles";
import { MAX_CONTENT_BYTES, utf8Size } from "./reviewer";
import type { ValidationResult } from "./types";

const pilots: Record<string, string> = {
  "improvement-pilot-slugs": "slug-lines",
  "improvement-pilot-tags": "normalized-tags",
  "improvement-pilot-priorities": "priority-list",
};
function frontmatter(content: string): string | null {
  return (
    /^(?:\uFEFF)?---[^\S\r\n]*(?:\r\n|\n|\r)[\s\S]*?^---[^\S\r\n]*(?:(?:\r\n|\n|\r)|$)/m.exec(
      content,
    )?.[0] ?? null
  );
}
function protectedSections(content: string): string[] {
  const lines = content.split(/\r\n|\n|\r/);
  const sections: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(lines[index]);
    if (
      !heading ||
      !/permission|runtime|budget|validation|security|policy|capabilit|approval/i.test(
        heading[2],
      )
    )
      continue;
    let end = index + 1;
    while (end < lines.length) {
      const next = /^(#{1,6})\s+/.exec(lines[end]);
      if (next && next[1].length <= heading[1].length) break;
      end += 1;
    }
    sections.push(lines.slice(index, end).join("\n"));
    index = end - 1;
  }
  const marked =
    content.match(
      /<!-- improvement:protected:start -->[\s\S]*?<!-- improvement:protected:end -->/g,
    ) ?? [];
  const controlLines = lines.filter((line) =>
    /permission|runtime|budget|validation|security|policy|capabilit|approval|(?:^|\W)(?:tools?|execute|shell|network)(?:\W|$)/i.test(
      line,
    ),
  );
  return [...sections, ...marked, ...controlLines];
}
function taskConfig(
  content: string,
  expectedKind: string,
): Record<string, unknown> {
  const blocks = [
    ...content.matchAll(/^```skill-task\s*\r?\n([\s\S]*?)^```\s*$/gm),
  ];
  if (blocks.length !== 1)
    throw new Error(
      "The registered pilot requires exactly one skill-task JSON block.",
    );
  const parsed: unknown = JSON.parse(blocks[0][1]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Pilot task configuration must be an object.");
  const config = parsed as Record<string, unknown>;
  const booleanKeys =
    expectedKind === "slug-lines"
      ? ["lowercase", "trim", "replaceSpaces", "removePunctuation", "omitEmpty"]
      : expectedKind === "normalized-tags"
        ? ["trim", "lowercase", "unique", "sort"]
        : ["trim", "omitEmpty", "unique"];
  const expectedKeys = [
    "kind",
    ...booleanKeys,
    ...(expectedKind === "priority-list" ? ["sort"] : []),
  ].sort();
  if (
    JSON.stringify(Object.keys(config).sort()) !==
      JSON.stringify(expectedKeys) ||
    config.kind !== expectedKind ||
    booleanKeys.some((key) => typeof config[key] !== "boolean")
  )
    throw new Error(
      "Pilot task configuration has invalid, missing or unknown fields.",
    );
  if (
    expectedKind === "priority-list" &&
    !["ascending", "descending", "none"].includes(String(config.sort))
  )
    throw new Error("Pilot sort must be ascending, descending or none.");
  return config;
}
function interpret(config: Record<string, unknown>, input: string[]): string[] {
  let output = input.map((item) => (config.trim ? item.trim() : item));
  if (config.omitEmpty) output = output.filter(Boolean);
  if (config.lowercase) output = output.map((item) => item.toLowerCase());
  if (config.kind === "slug-lines") {
    if (config.removePunctuation)
      output = output.map((item) => item.replace(/[^a-zA-Z0-9\s-]/g, ""));
    if (config.replaceSpaces)
      output = output.map((item) => item.replace(/\s+/g, "-"));
  }
  if (config.unique) output = [...new Set(output)];
  if (config.sort === true || config.sort === "ascending")
    output = [...output].sort();
  if (config.sort === "descending") output = [...output].sort().reverse();
  return output;
}
const holdouts: Record<string, { input: string[]; expected: string[] }[]> = {
  "slug-lines": [
    {
      input: ["  HELLO World!  ", "", " Mixed   Case ", "A/B & C"],
      expected: ["hello-world", "mixed-case", "ab-c"],
    },
    {
      input: ["Release_Notes 2.0", "   ", "one-two"],
      expected: ["releasenotes-20", "one-two"],
    },
  ],
  "normalized-tags": [
    {
      input: [" Beta ", "alpha", "BETA", " Alpha "],
      expected: ["alpha", "beta"],
    },
    {
      input: [" zebra", "Able ", "zebra", "able"],
      expected: ["able", "zebra"],
    },
  ],
  "priority-list": [
    {
      input: [" 03 later ", "01 first", "", "02 next", "01 first"],
      expected: ["01 first", "02 next", "03 later"],
    },
    { input: ["b", " a", "  ", "c", "a"], expected: ["a", "b", "c"] },
  ],
};
/** Fixed interpreters and expected outputs are app code, never reviewer-provided commands. */
export function validateProposal(
  folder: string,
  previous: string,
  proposed: string,
): ValidationResult {
  const checks: ValidationResult["checks"] = [];
  const inspection = inspectSkill(proposed, folder);
  const syntax =
    utf8Size(proposed) <= MAX_CONTENT_BYTES &&
    !inspection.diagnostics.some((item) => item.severity === "error");
  checks.push({
    name: "SKILL.md syntax",
    passed: syntax,
    detail: syntax
      ? "Bounded UTF-8 content and valid required YAML metadata."
      : inspection.diagnostics
          .filter((item) => item.severity === "error")
          .map((item) => item.message)
          .join("; ") || "Content exceeds 64 KiB.",
  });
  const unchangedFrontmatter =
    frontmatter(previous) !== null &&
    frontmatter(previous) === frontmatter(proposed);
  const unchangedProtected =
    JSON.stringify(protectedSections(previous)) ===
    JSON.stringify(protectedSections(proposed));
  // The auto pilots have one intentionally editable instruction block. All prose
  // outside it, including its validation description, remains immutable.
  const pilotKind = pilots[folder];
  const outside = (content: string) =>
    content.replace(/^```skill-task\s*\r?\n[\s\S]*?^```\s*$/gm, "<TASK>");
  const pilotScope = !pilotKind || outside(previous) === outside(proposed);
  const scope = unchangedFrontmatter && unchangedProtected && pilotScope;
  checks.push({
    name: "Instruction scope",
    passed: scope,
    detail: scope
      ? "Frontmatter, protected policy sections and pilot validation prose are unchanged."
      : "Proposal changes frontmatter, protected policy sections or fixed pilot prose.",
  });
  if (!pilotKind)
    return {
      syntax,
      scope,
      behavioral: "unavailable",
      procedure: null,
      checks,
    };
  try {
    const config = taskConfig(proposed, pilotKind);
    holdouts[pilotKind].forEach((holdout, index) => {
      const actual = interpret(config, holdout.input);
      checks.push({
        name: `${pilotKind} holdout ${index + 1}`,
        passed: JSON.stringify(actual) === JSON.stringify(holdout.expected),
        detail: JSON.stringify({
          input: holdout.input,
          expected: holdout.expected,
          actual,
        }),
      });
    });
    let previousFailures = holdouts[pilotKind].length;
    try {
      const previousConfig = taskConfig(previous, pilotKind);
      previousFailures = holdouts[pilotKind].filter(
        (holdout) =>
          JSON.stringify(interpret(previousConfig, holdout.input)) !==
          JSON.stringify(holdout.expected),
      ).length;
    } catch {
      /* An invalid baseline cannot pass the registered procedure. */
    }
    checks.push({
      name: "Registered behavioral improvement",
      passed: previousFailures > 0,
      detail: `${previousFailures} baseline holdout(s) failed; proposed behavior must pass every holdout.`,
    });
  } catch (error) {
    checks.push({
      name: `${pilotKind} configuration`,
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  return {
    syntax,
    scope,
    behavioral: checks.every((check) => check.passed) ? "passed" : "failed",
    procedure: `${pilotKind}-v1`,
    checks,
  };
}
