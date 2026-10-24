import { parseDocument } from "yaml";

export type SkillDiagnostic = {
  severity: "error" | "warning";
  message: string;
};

export type SkillInspection = {
  name: string;
  description: string;
  metadata: Record<string, unknown>;
  body: string;
  diagnostics: SkillDiagnostic[];
  raw: string;
};

const MAX_ALIAS_COUNT = 20;
const MAX_METADATA_DEPTH = 64;
const MAX_METADATA_NODES = 10_000;
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Inspect a SKILL.md file without changing or evaluating its source text. */
export function inspectSkill(content: string, folder: string): SkillInspection {
  const diagnostics: SkillDiagnostic[] = [];
  let metadata: Record<string, unknown> = {};
  let body = content;

  const opening = /^(\uFEFF?---)[ \t]*(?:\r\n|\n|\r)/.exec(content);
  if (opening) {
    const yamlStart = opening[0].length;
    const closing = /^---[ \t]*(?:\r\n|\n|\r|$)/gm;
    closing.lastIndex = yamlStart;
    const match = closing.exec(content);
    if (match) {
      body = content.slice(match.index + match[0].length);
      metadata = parseMetadata(
        content.slice(yamlStart, match.index),
        diagnostics,
      );
    } else {
      diagnostics.push({
        severity: "error",
        message: "Frontmatter opening delimiter has no closing --- line.",
      });
      body = content.slice(yamlStart);
      metadata = parseMetadata(body, diagnostics);
      body = content.slice(yamlStart);
    }
  } else {
    diagnostics.push({
      severity: "error",
      message:
        "Skill file must begin with YAML frontmatter delimited by --- lines.",
    });
  }

  const rawName = metadata.name;
  const rawDescription = metadata.description;
  const name = typeof rawName === "string" && rawName.trim() ? rawName : folder;
  const description = typeof rawDescription === "string" ? rawDescription : "";

  if (typeof rawName !== "string" || !rawName.trim()) {
    diagnostics.push({
      severity: "error",
      message: "Frontmatter must contain a nonempty string name.",
    });
  } else {
    if (rawName.length > 64)
      diagnostics.push({
        severity: "warning",
        message: "Skill name exceeds the 64-character convention limit.",
      });
    if (!NAME_PATTERN.test(rawName))
      diagnostics.push({
        severity: "warning",
        message: "Skill name convention is lowercase kebab-case.",
      });
    if (folder && rawName !== folder)
      diagnostics.push({
        severity: "warning",
        message: `Skill name “${rawName}” does not match folder “${folder}”.`,
      });
  }
  if (typeof rawDescription !== "string" || !rawDescription.trim()) {
    diagnostics.push({
      severity: "error",
      message: "Frontmatter must contain a nonempty string description.",
    });
  }
  if (!body.trim())
    diagnostics.push({ severity: "warning", message: "Skill body is empty." });

  return { name, description, metadata, body, diagnostics, raw: content };
}

function parseMetadata(
  source: string,
  diagnostics: SkillDiagnostic[],
): Record<string, unknown> {
  // yaml's parser never constructs application objects for custom tags. Detect
  // them explicitly so users see why a tag was not interpreted.
  if (/(^|(?:^\s*|[:[,]\s*|-\s*))!(?!!)[^\s\][},]*/m.test(source)) {
    diagnostics.push({
      severity: "warning",
      message:
        "Custom YAML tags are treated as inert data and are not executed.",
    });
  }
  try {
    const document = parseDocument(source, {
      uniqueKeys: true,
    });
    for (const error of document.errors)
      diagnostics.push({ severity: "error", message: error.message });
    for (const warning of document.warnings)
      diagnostics.push({ severity: "warning", message: warning.message });
    if (document.errors.length) return {};
    const value: unknown = document.toJS({ maxAliasCount: MAX_ALIAS_COUNT });
    if (!isRecord(value)) {
      diagnostics.push({
        severity: "error",
        message: "YAML frontmatter must be a mapping of metadata fields.",
      });
      return {};
    }
    return projectMetadata(value);
  } catch (error) {
    diagnostics.push({
      severity: "error",
      message: `Could not read YAML frontmatter: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
    return {};
  }
}

function projectMetadata(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const active = new WeakSet<object>();
  let visited = 0;

  const project = (item: unknown, depth: number): unknown => {
    visited += 1;
    if (visited > MAX_METADATA_NODES)
      throw new Error("YAML metadata exceeds the projection size limit.");
    if (depth > MAX_METADATA_DEPTH)
      throw new Error("YAML metadata exceeds the nesting limit.");
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "boolean" ||
      typeof item === "number"
    )
      return item;
    if (item instanceof Date) {
      if (Number.isNaN(item.valueOf()))
        throw new Error("YAML metadata contains an invalid date.");
      return item.toISOString();
    }
    if (typeof item !== "object")
      throw new Error(
        "YAML metadata contains a value that cannot be displayed.",
      );
    if (active.has(item))
      throw new Error("YAML metadata contains a cyclic alias reference.");

    active.add(item);
    try {
      if (Array.isArray(item))
        return item.map((child) => project(child, depth + 1));
      if (!isRecord(item))
        throw new Error("YAML metadata contains an unsupported object value.");
      return Object.fromEntries(
        Object.entries(item).map(([key, child]) => [
          key,
          project(child, depth + 1),
        ]),
      );
    } finally {
      active.delete(item);
    }
  };

  return project(value, 0) as Record<string, unknown>;
}
