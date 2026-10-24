import { describe, expect, it } from "vitest";
import { parseImport, validateWorkspace } from "./workspace";
import { starterWorkspace } from "../../tests/fixtures/legacyWorkspace";

describe("read-only legacy archive validation", () => {
  it("accounts for an existing archive without changing any record", () => {
    const original = starterWorkspace();
    expect(parseImport(JSON.stringify(original))).toEqual(original);
    expect(original.skills).toHaveLength(12);
  });
  it("distinguishes unsupported versions, malformed data and broken references", () => {
    expect(() => parseImport("{broken")).toThrow("valid JSON");
    expect(() => validateWorkspace({ version: 2, skills: [] })).toThrow(
      "version",
    );
    const original = starterWorkspace();
    original.skills[0].relatedIds = ["missing"];
    expect(() => validateWorkspace(original)).toThrow("missing");
  });
  it("preserves validation boundaries for old timestamps and content limits", () => {
    const original = starterWorkspace();
    original.skills[0].updatedAt = "2026-02-31T00:00:00.000Z";
    expect(() => validateWorkspace(original)).toThrow("timestamp");
    expect(() => parseImport("x".repeat(5 * 1024 * 1024 + 1))).toThrow("5 MB");
  });
});
