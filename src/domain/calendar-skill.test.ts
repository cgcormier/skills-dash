import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: vi.fn(),
}));
import {
  createSkill,
  filterSkills,
  parseImport,
  validateWorkspace,
} from "./workspace";
import { starterWorkspace } from "../data/seed";
import { loadWorkspace, persistWorkspace } from "../storage/adapter";

// Exact snapshot of the installed skill; archive content is data, never executed.
const body = readFileSync(
  new URL("../../tests/fixtures/add-to-calendar.md", import.meta.url),
  "utf8",
);
const record = createSkill({
  id: "add-to-calendar",
  title: "Add to Calendar",
  summary:
    "Create verified calendar events from supplied sources with tool-based access recovery.",
  category: "Operations",
  tags: ["calendar", "events", "productivity"],
  status: "active",
  body,
});

beforeEach(() => {
  const memory = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
  });
});

describe("calendar skill archive integration", () => {
  it("round-trips the entire Markdown alongside existing records through export/import", () => {
    const original = starterWorkspace();
    const next = validateWorkspace({
      ...original,
      skills: [...original.skills, record],
    });
    const imported = parseImport(JSON.stringify(next));
    expect(imported.skills.slice(0, -1)).toEqual(original.skills);
    expect(imported.skills.at(-1)).toEqual(record);
    expect(imported.skills.at(-1)?.body).toBe(body);
  });

  it("saves the new record and retains the previous workspace as recovery data", async () => {
    const original = starterWorkspace();
    await persistWorkspace(original);
    await persistWorkspace({
      ...original,
      skills: [...original.skills, record],
    });
    expect((await loadWorkspace())?.skills.at(-1)).toEqual(record);
    expect(await loadWorkspace(true)).toEqual(original);
  });

  it("finds the skill in Operations by event/access terms after reload", async () => {
    await persistWorkspace({ version: 1, skills: [record] });
    const loaded = await loadWorkspace();
    const found = filterSkills(loaded!.skills, {
      query: "calendar authorization",
      category: "Operations",
      status: "active",
      favoritesOnly: false,
      sort: "title",
    });
    expect(found.map((skill) => skill.id)).toEqual(["add-to-calendar"]);
  });
});
