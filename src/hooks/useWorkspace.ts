import { useEffect, useRef, useState } from "react";
import {
  createSkill,
  parseImport,
  removeSkill as remove,
  validateWorkspace,
  type Skill,
  type Workspace,
} from "../domain/workspace";
import { starterWorkspace } from "../data/seed";
import { loadWorkspace, persistWorkspace } from "../storage/adapter";

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const current = useRef<Workspace | null>(null);
  const history = useRef<Workspace[]>([]);
  const queue = useRef(Promise.resolve());
  const generation = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "loading" | "saved" | "saving" | "error"
  >("loading");
  const [canUndo, setCanUndo] = useState(false);

  function save(next: Workspace) {
    const ticket = ++generation.current;
    setSaveStatus("saving");
    setError(null);
    queue.current = queue.current
      .catch(() => {})
      .then(() => persistWorkspace(next))
      .then(() => {
        if (ticket === generation.current) {
          setSaveStatus("saved");
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (ticket === generation.current) {
          setSaveStatus("error");
          setError(
            `Could not save your changes: ${String(reason)}. Your current edits are still available. Export a backup or retry.`,
          );
        }
      });
  }

  function commit(next: Workspace, record = true) {
    const valid = validateWorkspace(next);
    if (record && current.current)
      history.current = [...history.current.slice(-29), current.current];
    current.current = valid;
    setWorkspace(valid);
    setCanUndo(history.current.length > 0);
    save(valid);
  }

  async function initialize() {
    setLoading(true);
    setError(null);
    try {
      const stored = await loadWorkspace();
      const next = stored ?? starterWorkspace();
      current.current = next;
      setWorkspace(next);
      setSaveStatus("saved");
      if (!stored) save(next);
    } catch (reason) {
      setError(
        `Workspace could not be opened: ${String(reason)}. The stored data has been left untouched.`,
      );
      setSaveStatus("error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void initialize();
  }, []); // One provider owns one serialized storage queue.

  return {
    workspace,
    loading,
    error,
    saveStatus,
    canUndo,
    updateSkill(id: string, patch: Partial<Skill>) {
      if (!current.current) throw new Error("Workspace is not loaded.");
      commit({
        version: 1,
        skills: current.current.skills.map((s) =>
          s.id === id
            ? {
                ...s,
                ...patch,
                id: s.id,
                createdAt: s.createdAt,
                updatedAt: new Date().toISOString(),
              }
            : s,
        ),
      });
    },
    addSkill(input: Partial<Skill> = {}) {
      if (!current.current)
        throw new Error(
          "Recover or import a workspace before adding a skill. Existing stored data has not been changed.",
        );
      const skill = createSkill(input);
      commit({
        version: 1,
        skills: [...(current.current?.skills ?? []), skill],
      });
      return skill;
    },
    removeSkill(id: string) {
      if (current.current) commit(remove(current.current, id));
    },
    importWorkspace(json: string) {
      commit(parseImport(json));
    },
    undo() {
      const previous = history.current.pop();
      if (previous) commit(previous, false);
    },
    retry() {
      if (current.current) save(current.current);
      else void initialize();
    },
    async recoverBackup() {
      const backup = await loadWorkspace(true);
      if (!backup)
        throw new Error(
          "No previous backup is available. Import an exported workspace instead.",
        );
      commit(backup);
    },
  };
}
