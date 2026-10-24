import { describe, expect, it } from "vitest";
import { inspectSkill } from "./skillFiles";

describe("inspectSkill", () => {
  it("preserves BOM, CRLF, multiline values, nested metadata, and the exact raw file", () => {
    const raw =
      "\uFEFF---\r\nname: sample-skill\r\ndescription: >-\r\n  A useful\r\n  description.\r\ncustom:\r\n  nested:\r\n    values: [one, two]\r\n---  \r\n# Body\r\n\r\nKeep this exactly.\r\n";
    const result = inspectSkill(raw, "sample-skill");

    expect(result.raw).toBe(raw);
    expect(result.name).toBe("sample-skill");
    expect(result.description).toBe("A useful description.");
    expect(result.metadata.custom).toEqual({
      nested: { values: ["one", "two"] },
    });
    expect(result.body).toBe("# Body\r\n\r\nKeep this exactly.\r\n");
    expect(result.diagnostics).toEqual([]);
  });

  it("retains valid unknown fields and nested data without rewriting source", () => {
    const raw = [
      "---",
      "name: a-skill",
      "description: Does useful work.",
      "allowed-tools:",
      "  - Read",
      "metadata:",
      "  author: Carter",
      "  flags: { reviewed: true, revision: 2 }",
      "---",
      "Body",
    ].join("\n");
    const result = inspectSkill(raw, "a-skill");

    expect(result.metadata["allowed-tools"]).toEqual(["Read"]);
    expect(result.metadata.metadata).toEqual({
      author: "Carter",
      flags: { reviewed: true, revision: 2 },
    });
    expect(result.raw).toBe(raw);
  });

  it("returns the folder fallback and visible diagnostics for malformed YAML", () => {
    const raw = "---\nname: [broken\ndescription: x\n---\nBody";
    const result = inspectSkill(raw, "folder-name");

    expect(result.name).toBe("folder-name");
    expect(result.raw).toBe(raw);
    expect(result.body).toBe("Body");
    expect(result.diagnostics.some((item) => item.severity === "error")).toBe(
      true,
    );
  });

  it("reports duplicate keys, non-mapping roots, and missing closing delimiters", () => {
    const duplicate = inspectSkill(
      "---\nname: first\nname: second\ndescription: x\n---\nBody",
      "folder",
    );
    const nonMapping = inspectSkill("---\n- one\n- two\n---\nBody", "folder");
    const unclosed = inspectSkill(
      "---\nname: x\ndescription: y\nBody",
      "folder",
    );

    expect(
      duplicate.diagnostics.some((item) => /unique/i.test(item.message)),
    ).toBe(true);
    expect(
      nonMapping.diagnostics.some((item) => /mapping/i.test(item.message)),
    ).toBe(true);
    expect(
      unclosed.diagnostics.some((item) => /no closing/i.test(item.message)),
    ).toBe(true);
    expect(unclosed.name).toBe("folder");
    expect(unclosed.raw).toContain("Body");
  });

  it("bounds alias expansion and leaves custom tags inert", () => {
    const aliases = [
      "---",
      "name: alias-case",
      "description: Alias test.",
      "seed: &seed [x]",
      "a: *seed",
      "b: *seed",
      "c: *seed",
      "d: *seed",
      "e: *seed",
      "f: *seed",
      "g: *seed",
      "h: *seed",
      "i: *seed",
      "j: *seed",
      "k: *seed",
      "l: *seed",
      "m: *seed",
      "n: *seed",
      "o: *seed",
      "p: *seed",
      "q: *seed",
      "r: *seed",
      "s: *seed",
      "t: *seed",
      "u: *seed",
      "v: *seed",
      "---",
      "Body",
    ].join("\n");
    const aliasResult = inspectSkill(aliases, "alias-case");
    const tagged = inspectSkill(
      "---\nname: tagged\ndescription: Tag test.\nvalue: !custom injected\n---\nBody",
      "tagged",
    );

    expect(
      aliasResult.diagnostics.some((item) => item.severity === "error"),
    ).toBe(true);
    expect(tagged.diagnostics.some((item) => item.severity === "warning")).toBe(
      true,
    );
    expect(tagged.raw).toContain("!custom injected");
  });

  it("rejects cyclic and deeply nested projections without losing raw source", () => {
    const cyclicRaw =
      "---\nname: cyclic\ndescription: Alias cycle.\nmetadata: &metadata\n  self: *metadata\n---\nBody";
    const deepValue = Array.from(
      { length: 70 },
      (_, index) => `${"  ".repeat(index + 1)}level${index}:`,
    ).join("\n");
    const deepRaw = [
      "---",
      "name: deeply-nested",
      "description: Deep metadata.",
      "metadata:",
      deepValue,
      "---",
      "Body",
    ].join("\n");
    const cyclic = inspectSkill(cyclicRaw, "cyclic");
    const deeplyNested = inspectSkill(deepRaw, "deeply-nested");

    expect(cyclic.raw).toBe(cyclicRaw);
    expect(cyclic.diagnostics.some((item) => item.severity === "error")).toBe(
      true,
    );
    expect(deeplyNested.raw).toBe(deepRaw);
    expect(
      deeplyNested.diagnostics.some((item) => item.severity === "error"),
    ).toBe(true);
  });

  it("warns on conventions and errors on missing required string fields", () => {
    const result = inspectSkill(
      "---\nname: Has Spaces\ndescription: '  '\n---\n",
      "other-folder",
    );

    expect(result.name).toBe("Has Spaces");
    expect(result.diagnostics.some((item) => item.severity === "warning")).toBe(
      true,
    );
    expect(
      result.diagnostics.filter((item) => item.severity === "error"),
    ).toHaveLength(1);
    expect(result.diagnostics.some((item) => /empty/i.test(item.message))).toBe(
      true,
    );
  });
});
