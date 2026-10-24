import { invoke, isTauri } from "@tauri-apps/api/core";
import { parseImport } from "../domain/workspace";

export type LegacyCopy = {
  source: "primary" | "backup";
  raw: string | null;
  count: number | null;
  error: string | null;
};

// Read raw copies independently so corrupt primary content remains exportable.
// No legacy save, import, recovery commit or delete is exposed by this workbench.
export async function readLegacy(): Promise<LegacyCopy[]> {
  return Promise.all(
    (["primary", "backup"] as const).map(
      async (source): Promise<LegacyCopy> => {
        let raw: string | null = null;
        try {
          raw = isTauri()
            ? await invoke<string | null>("read_legacy_archive", {
                backup: source === "backup",
              })
            : localStorage.getItem(
                source === "backup"
                  ? "skill-archive.workspace.backup.v1"
                  : "skill-archive.workspace.v1",
              );
          return {
            source,
            raw,
            count: raw === null ? null : parseImport(raw).skills.length,
            error: null,
          };
        } catch (error) {
          return { source, raw, count: null, error: String(error) };
        }
      },
    ),
  );
}
