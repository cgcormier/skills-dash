import { invoke, isTauri } from "@tauri-apps/api/core";
import { createImprovementEngine } from "./engine";
import type { PersistenceRead, Reviewer } from "./types";

export function createNativeImprovementEngine() {
  const requireNative = () => {
    if (!isTauri())
      throw new Error(
        "Open the desktop app to use skill improvement. Browser mode has no native lifecycle storage or reviewer.",
      );
  };
  const reviewer: Reviewer = {
    async review(request, signal) {
      requireNative();
      if (signal.aborted) throw new Error("Review cancelled.");
      return invoke("reviewer_start", request);
    },
    async cancel(id) {
      requireNative();
      const stopped = await invoke<boolean>("reviewer_cancel", { id });
      if (!stopped)
        throw new Error(
          "The native reviewer did not acknowledge this cancellation. Waiting for the original run to exit before starting another review.",
        );
    },
  };
  return createImprovementEngine({
    persistence: {
      async read() {
        requireNative();
        return invoke<PersistenceRead>("lifecycle_read");
      },
      async write(expectedRevision, raw) {
        requireNative();
        return invoke<{ revision: string }>("lifecycle_write", {
          expectedRevision,
          raw,
        });
      },
    },
    skills: {
      async readSkill(folder) {
        requireNative();
        return invoke<{ content: string; path: string }>("read_skill", {
          folder,
        });
      },
      async saveSkill(folder, expectedContent, content) {
        requireNative();
        return invoke<{ recoveryPath: string | null }>("save_skill", {
          folder,
          expectedContent,
          content,
        });
      },
    },
    reviewer,
  });
}
