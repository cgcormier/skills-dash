import { describe, expect, it } from "vitest";
import {
  createSkill,
  filterSkills,
  parseImport,
  relationshipEdges,
  removeSkill,
  validateWorkspace,
  type Workspace,
} from "./workspace";
import { starterWorkspace } from "../data/seed";

describe("workspace boundary", () => {
  it("round-trips starter data without changing explicit links", () => {
    const original = starterWorkspace();
    expect(parseImport(JSON.stringify(original))).toEqual(original);
  });
  it.each([
    [{ version: 2, skills: [] }, /version/],
    [{ version: 1, skills: [{ id: "incomplete" }] }, /must be text/],
    [
      {
        version: 1,
        skills: [createSkill({ id: "same" }), createSkill({ id: "same" })],
      },
      /Duplicate/,
    ],
    [
      { version: 1, skills: [createSkill({ relatedIds: ["missing"] })] },
      /missing/,
    ],
    [
      {
        version: 1,
        skills: [createSkill({ id: "self", relatedIds: ["self"] })],
      },
      /itself/,
    ],
    [
      { version: 1, skills: [createSkill({ tags: ["same", "same"] })] },
      /unique/,
    ],
    [{ version: 1, skills: [createSkill({ title: "  " })] }, /required/],
    [
      { version: 1, skills: [createSkill({ updatedAt: "tomorrow" })] },
      /timestamp/,
    ],
    [
      { version: 1, skills: [createSkill({ status: "unknown" as never })] },
      /status/,
    ],
  ])("rejects invalid imports before mutation", (input, message) =>
    expect(() => validateWorkspace(input)).toThrow(message as RegExp),
  );
  it("reports malformed and oversized input", () => {
    expect(() => parseImport("{not-json")).toThrow("valid JSON");
    expect(() => parseImport("x".repeat(5 * 1024 * 1024 + 1))).toThrow("5 MB");
  });
  it.each(["2026-02-31T00:00:00.000Z", "2026-09-16", "2026-09-16T00:00:00Z"])(
    "rejects noncanonical timestamp %s",
    (updatedAt) => {
      expect(() =>
        validateWorkspace({ version: 1, skills: [createSkill({ updatedAt })] }),
      ).toThrow("timestamp");
    },
  );
  it("counts unicode payload bytes, not just code units", () => {
    expect(() =>
      validateWorkspace({
        version: 1,
        skills: [createSkill({ body: "漢".repeat(2 * 1024 * 1024) })],
      }),
    ).toThrow("5 MB");
  });
});

describe("retrieval and relationships", () => {
  const filters = {
    query: "",
    category: "",
    status: "",
    favoritesOnly: false,
    sort: "title" as const,
  };
  it("searches instructions and tags using all query words without mutating the source", () => {
    const skills = starterWorkspace().skills;
    const before = skills.map((s) => s.id);
    const result = filterSkills(skills, {
      ...filters,
      query: "RESEARCH evidence",
    });
    expect(result.some((s) => s.id === "research-synthesis")).toBe(true);
    expect(
      result.every((s) =>
        /evidence/i.test([s.title, s.summary, s.body, ...s.tags].join(" ")),
      ),
    ).toBe(true);
    expect(skills.map((s) => s.id)).toEqual(before);
  });
  it("combines category, status and favorite constraints", () => {
    const result = filterSkills(starterWorkspace().skills, {
      ...filters,
      category: "Design",
      status: "active",
      favoritesOnly: true,
    });
    expect(result.map((s) => s.id)).toEqual(["interface-design"]);
  });
  it("removes incoming links when a record is deleted", () => {
    const workspace = starterWorkspace();
    const next = removeSkill(workspace, "interface-design");
    expect(
      next.skills.some(
        (s) =>
          s.id === "interface-design" ||
          s.relatedIds.includes("interface-design"),
      ),
    ).toBe(false);
    expect(() => validateWorkspace(next)).not.toThrow();
    expect(workspace.skills).toHaveLength(12);
  });
  it("deduplicates reciprocal relationships and excludes filtered-out nodes", () => {
    const skills = [
      createSkill({ id: "a", relatedIds: ["b", "c"] }),
      createSkill({ id: "b", relatedIds: ["a"] }),
      createSkill({ id: "c" }),
    ];
    expect(relationshipEdges(skills)).toEqual([
      ["a", "b"],
      ["a", "c"],
    ]);
    expect(relationshipEdges(skills.slice(0, 2))).toEqual([["a", "b"]]);
    expect(relationshipEdges(skills.slice(2))).toEqual([]);
  });
  it("accepts a deliberately empty archive", () =>
    expect(
      validateWorkspace({ version: 1, skills: [] } as Workspace).skills,
    ).toEqual([]));
});
