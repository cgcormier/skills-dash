// Read-only legacy v1 archive validation. Personal skill content lives in SKILL.md.
export type Status = "active" | "draft" | "archived";
export type Skill = {
  id: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  status: Status;
  body: string;
  relatedIds: string[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};
export type Workspace = { version: 1; skills: Skill[] };
export const MAX_BYTES = 5 * 1024 * 1024;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function validateWorkspace(input: unknown): Workspace {
  if (!isRecord(input) || input.version !== 1 || !Array.isArray(input.skills))
    throw new Error(
      "This file is not a supported Skill Archive workspace (version 1).",
    );
  if (input.skills.length > 10000)
    throw new Error("A workspace can contain up to 10,000 skills.");
  const skills: Skill[] = input.skills.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Record ${index + 1} is not a skill.`);
    const label = `Skill ${index + 1}`;
    for (const key of [
      "id",
      "title",
      "summary",
      "category",
      "body",
      "createdAt",
      "updatedAt",
    ]) {
      if (typeof item[key] !== "string")
        throw new Error(`${label}: ${key} must be text.`);
    }
    if (
      !(item.id as string).trim() ||
      !(item.title as string).trim() ||
      !(item.category as string).trim()
    )
      throw new Error(`${label}: ID, title and category are required.`);
    if (
      (item.title as string).length > 160 ||
      (item.summary as string).length > 1200 ||
      (item.category as string).length > 80
    )
      throw new Error(
        `${label}: title, summary or category exceeds its length limit.`,
      );
    if (
      !["active", "draft", "archived"].includes(item.status as string) ||
      typeof item.favorite !== "boolean"
    )
      throw new Error(`${label}: invalid status or favorite value.`);
    for (const key of ["tags", "relatedIds"]) {
      if (
        !Array.isArray(item[key]) ||
        !(item[key] as unknown[]).every(
          (x) => typeof x === "string" && x.trim(),
        ) ||
        new Set(item[key] as string[]).size !== (item[key] as string[]).length
      )
        throw new Error(
          `${label}: ${key} must be a list of unique nonempty text values.`,
        );
    }
    if (
      !isTimestamp(item.createdAt as string) ||
      !isTimestamp(item.updatedAt as string)
    )
      throw new Error(`${label}: invalid timestamp.`);
    return {
      id: item.id,
      title: item.title,
      summary: item.summary,
      category: item.category,
      body: item.body,
      status: item.status,
      tags: item.tags,
      relatedIds: item.relatedIds,
      favorite: item.favorite,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    } as Skill;
  });
  const ids = new Set(skills.map((s) => s.id));
  if (ids.size !== skills.length)
    throw new Error("Duplicate skill IDs were found. Import was not applied.");
  for (const skill of skills)
    if (skill.relatedIds.some((id) => !ids.has(id) || id === skill.id))
      throw new Error(
        `${skill.title}: a relationship points to a missing skill or itself.`,
      );
  const workspace: Workspace = { version: 1, skills };
  if (new TextEncoder().encode(JSON.stringify(workspace)).length > MAX_BYTES)
    throw new Error("Workspace exceeds the 5 MB storage limit.");
  return workspace;
}

function isTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

export function parseImport(text: string): Workspace {
  if (new TextEncoder().encode(text).length > MAX_BYTES)
    throw new Error("File exceeds the 5 MB import limit.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "This file is not valid JSON. Choose a Skill Archive export.",
    );
  }
  return validateWorkspace(parsed);
}
