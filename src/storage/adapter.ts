import { isTauri, invoke } from '@tauri-apps/api/core';
import { parseImport, type Workspace } from '../domain/workspace';
export const STORAGE_KEY = 'skill-archive.workspace.v1';
export const BACKUP_KEY = 'skill-archive.workspace.backup.v1';
export const isDesktop = () => isTauri();

export async function loadWorkspace(backup = false): Promise<Workspace | null> {
  const value = isDesktop() ? await invoke<string | null>(backup ? 'recover_workspace' : 'load_workspace') : localStorage.getItem(backup ? BACKUP_KEY : STORAGE_KEY);
  return value === null ? null : parseImport(value);
}

export async function persistWorkspace(workspace: Workspace): Promise<void> {
  const json = JSON.stringify(workspace);
  if (isDesktop()) { await invoke('save_workspace', { data: json }); return; }
  const previous = localStorage.getItem(STORAGE_KEY);
  if (previous) {
    try { parseImport(previous); localStorage.setItem(BACKUP_KEY, previous); }
    catch (error) { if (error instanceof DOMException) throw error; /* Preserve existing valid backup over corrupt primary. */ }
  }
  localStorage.setItem(STORAGE_KEY, json);
}
