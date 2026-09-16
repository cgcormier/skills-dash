import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: vi.fn(),
}));
import {
  BACKUP_KEY,
  loadWorkspace,
  persistWorkspace,
  STORAGE_KEY,
} from "./adapter";
import { starterWorkspace } from "../data/seed";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
};
beforeEach(() => {
  memory.clear();
  vi.stubGlobal("localStorage", storage);
});
describe("browser persistence", () => {
  it("distinguishes missing data from corrupt data and never silently resets", async () => {
    expect(await loadWorkspace()).toBeNull();
    memory.set(STORAGE_KEY, "invalid");
    await expect(loadWorkspace()).rejects.toThrow("valid JSON");
    expect(memory.get(STORAGE_KEY)).toBe("invalid");
  });
  it("keeps the previous valid version as backup", async () => {
    const first = starterWorkspace();
    await persistWorkspace(first);
    const next = structuredClone(first);
    next.skills[0].title = "Changed";
    await persistWorkspace(next);
    expect(await loadWorkspace()).toEqual(next);
    expect(await loadWorkspace(true)).toEqual(first);
  });
  it("preserves an existing valid backup when replacing corrupt primary storage", async () => {
    const backup = starterWorkspace();
    memory.set(BACKUP_KEY, JSON.stringify(backup));
    memory.set(STORAGE_KEY, "broken");
    const next = structuredClone(backup);
    next.skills[0].title = "Recovered";
    await persistWorkspace(next);
    expect(await loadWorkspace(true)).toEqual(backup);
    expect(await loadWorkspace()).toEqual(next);
  });
  it("surfaces a quota failure without losing the existing primary", async () => {
    const original = starterWorkspace();
    memory.set(STORAGE_KEY, JSON.stringify(original));
    vi.stubGlobal("localStorage", {
      ...storage,
      setItem: () => {
        throw new DOMException("Full", "QuotaExceededError");
      },
    });
    await expect(persistWorkspace({ version: 1, skills: [] })).rejects.toThrow(
      "Full",
    );
    expect(memory.get(STORAGE_KEY)).toBe(JSON.stringify(original));
  });
});
