import { invoke, isTauri } from "@tauri-apps/api/core";
import { inspectSkill, type SkillInspection } from "../domain/skillFiles";

export type SkillEntry = {
  folder: string;
  path: string;
  modifiedMs: number | null;
  size: number | null;
  problem: string | null;
};
export type SkillFile = {
  folder: string;
  path: string;
  modifiedMs: number | null;
  content: string;
  supportingFiles: {
    path: string;
    kind: "file" | "directory" | "blocked";
    size: number | null;
  }[];
  diagnostics: string[];
  recoveryPath: string | null;
};
export type SkillRow = SkillEntry & {
  inspection: SkillInspection | null;
};
export type SkillDiscovery = {
  root: string;
  savePolicy: "read-only" | "recoverable-publish";
  entries: SkillEntry[];
  diagnostics: string[];
};
export const isDesktop = () => isTauri();

export type RecoveryEntry = {
  id: string;
  folder: string;
  previousPath: string | null;
  draftPath: string | null;
  createdMs: number | null;
  diagnostics: string[];
};
export async function listRecoveries(folder: string): Promise<RecoveryEntry[]> {
  requireDesktop();
  return invoke("list_skill_recoveries", { folder });
}
export async function readRecovery(
  folder: string,
  id: string,
  version: "previous" | "draft",
): Promise<string> {
  requireDesktop();
  return invoke("read_skill_recovery", { folder, id, version });
}

function requireDesktop() {
  if (!isDesktop())
    throw new Error(
      "Open the desktop app to access your personal skill folders. Browser mode has no filesystem access.",
    );
}
export async function readSkill(folder: string): Promise<SkillFile> {
  requireDesktop();
  return invoke("read_skill", { folder });
}
export async function saveSkill(
  file: SkillFile,
  content: string,
): Promise<SkillFile> {
  requireDesktop();
  return invoke("save_skill", {
    folder: file.folder,
    expectedContent: file.content,
    content,
  });
}
export async function discoverSkills(): Promise<
  Omit<SkillDiscovery, "entries"> & { entries: SkillRow[] }
> {
  requireDesktop();
  const snapshot = await invoke<SkillDiscovery>("discover_skills");
  const entries: SkillRow[] = snapshot.entries.map((entry) => ({
    ...entry,
    inspection: null,
  }));
  // Bound parallel reads; a bad file never hides its neighbors.
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, entries.length) }, async () => {
      while (next < entries.length) {
        const index = next++;
        const entry = entries[index];
        if (entry.problem) continue;
        try {
          const file = await readSkill(entry.folder);
          entries[index] = {
            ...entry,
            modifiedMs: file.modifiedMs,
            inspection: inspectSkill(file.content, file.folder),
          };
        } catch (error) {
          entries[index] = { ...entry, problem: String(error) };
        }
      }
    }),
  );
  return { ...snapshot, entries };
}
