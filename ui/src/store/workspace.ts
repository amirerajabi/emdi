// The open folder (the explorer's root) and the recent folders and files.
import { create } from 'zustand';
import { basename, samePath } from '../lib/paths';
import { loadRaw, save } from '../lib/storage';
import { platform } from '../platform';

export interface Recent {
  path: string;
  name: string;
  isDir: boolean;
  openedAt: number;
}

interface WorkspaceStore {
  root: string | null;
  recents: Recent[];
  files: string[] | null;
  openFolder(path: string): Promise<void>;
  close(): void;
  addRecent(path: string, isDir: boolean): void;
  removeRecent(path: string): void;
  clearRecents(): void;
  loadFiles(): Promise<string[]>;
  invalidateFiles(): void;
}

export const useWorkspace = create<WorkspaceStore>((set, get) => ({
  root: null,
  recents: loadRaw<Recent[]>('recents', []),
  files: null,
  openFolder: async (path) => {
    set({ root: path, files: null });
    get().addRecent(path, true);
    save('session.root', path);
  },
  close: () => {
    set({ root: null, files: null });
    save('session.root', null);
  },
  addRecent: (path, isDir) => {
    const recents = [{ path, name: basename(path), isDir, openedAt: Date.now() }, ...get().recents.filter((r) => !samePath(r.path, path))].slice(0, 16);
    set({ recents });
    save('recents', recents);
  },
  removeRecent: (path) => {
    const recents = get().recents.filter((r) => !samePath(r.path, path));
    set({ recents });
    save('recents', recents);
  },
  clearRecents: () => {
    set({ recents: [] });
    save('recents', []);
  },
  loadFiles: async () => {
    const cached = get().files;
    if (cached) return cached;
    const root = get().root;
    if (!root) return [];
    const files = await platform.listFiles(root);
    set({ files });
    return files;
  },
  invalidateFiles: () => set({ files: null }),
}));
