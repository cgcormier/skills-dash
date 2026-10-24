import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ native: true, invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => api.native,
  invoke: api.invoke,
}));
import {
  discoverSkills,
  readSkill,
  saveSkill,
  listRecoveries,
  readRecovery,
  type SkillFile,
} from "./skillFiles";
import { readLegacy } from "./legacy";

const file: SkillFile = {
  folder: "one",
  path: "C:\\personal\\one\\SKILL.md",
  modifiedMs: 1,
  content: "---\nname: one\ndescription: Original\nextra: retained\n---\nBody",
  supportingFiles: [],
  diagnostics: [],
  recoveryPath: null,
};
beforeEach(() => {
  api.native = true;
  api.invoke.mockReset();
});
describe("personal file boundary", () => {
  it("uses only folder, transaction ID and fixed version for recovery reads", async () => {
    api.invoke.mockResolvedValueOnce([]).mockResolvedValueOnce("previous raw");
    expect(await listRecoveries("one")).toEqual([]);
    expect(await readRecovery("one", "123-456", "previous")).toBe(
      "previous raw",
    );
    expect(api.invoke).toHaveBeenNthCalledWith(1, "list_skill_recoveries", {
      folder: "one",
    });
    expect(api.invoke).toHaveBeenNthCalledWith(2, "read_skill_recovery", {
      folder: "one",
      id: "123-456",
      version: "previous",
    });
    api.invoke.mockRejectedValue("Blocked recovery link");
    await expect(readRecovery("one", "123-456", "draft")).rejects.toBe(
      "Blocked recovery link",
    );
  });
  it("reads folders independently and retains malformed and inaccessible entries", async () => {
    api.invoke.mockImplementation(async (command, args) => {
      if (command === "discover_skills")
        return {
          root: "C:\\personal",
          diagnostics: [],
          entries: ["one", "bad", "gone"].map((folder) => ({
            folder,
            path: folder,
            modifiedMs: 1,
            size: 10,
            problem: null,
          })),
        };
      if (args.folder === "gone") throw new Error("External deletion");
      return {
        ...file,
        folder: args.folder,
        content:
          args.folder === "bad" ? "---\nname: [\n---\nBody" : file.content,
      };
    });
    const result = await discoverSkills();
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].inspection?.metadata.extra).toBe("retained");
    expect(
      result.entries[1].inspection?.diagnostics.some(
        (d) => d.severity === "error",
      ),
    ).toBe(true);
    expect(result.entries[2].problem).toContain("External deletion");
  });
  it("sends only one folder, exact opened content and the raw draft on save", async () => {
    api.invoke.mockResolvedValue({ ...file, content: "draft" });
    await saveSkill(file, "draft");
    expect(api.invoke).toHaveBeenCalledWith("save_skill", {
      folder: "one",
      expectedContent: file.content,
      content: "draft",
    });
    api.invoke.mockRejectedValue("Changed externally");
    await expect(saveSkill(file, "draft")).rejects.toBe("Changed externally");
    expect(file.content).toContain("Original");
  });
  it("does not fall back to browser storage or seed files on native failure", async () => {
    api.invoke.mockRejectedValue("Permission denied");
    await expect(discoverSkills()).rejects.toBe("Permission denied");
    api.native = false;
    await expect(readSkill("one")).rejects.toThrow("desktop app");
    await expect(saveSkill(file, "draft")).rejects.toThrow("desktop app");
    expect(api.invoke).toHaveBeenCalledTimes(1);
  });
  it("exports corrupt legacy primary while independently accounting for backup", async () => {
    api.invoke.mockImplementation(async (_command, args) =>
      args.backup ? '{"version":1,"skills":[]}' : "{broken",
    );
    const copies = await readLegacy();
    expect(copies[0].raw).toBe("{broken");
    expect(copies[0].error).toContain("valid JSON");
    expect(copies[1].count).toBe(0);
    expect(
      api.invoke.mock.calls.every(
        ([command]) => command === "read_legacy_archive",
      ),
    ).toBe(true);
  });
  it("reads browser legacy keys without creating or changing stored copies", async () => {
    api.native = false;
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key.endsWith("backup.v1") ? '{"version":1,"skills":[]}' : null,
      setItem,
    });
    const copies = await readLegacy();
    expect(copies[0].raw).toBeNull();
    expect(copies[1].count).toBe(0);
    expect(setItem).not.toHaveBeenCalled();
    expect(api.invoke).not.toHaveBeenCalled();
  });
});
