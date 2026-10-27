// Open documents (the tabs): their text as read from disk, the scroll position, and the preview tab (a single click in
// the explorer replaces it; a double click or a scroll keeps it). The text lives here, not in the view, so an editor can
// later work on the same documents.
import { create } from 'zustand';
import { basename, samePath } from '../lib/paths';
import { loadRaw, save } from '../lib/storage';
import { platform } from '../platform';
import { useSettings } from './settings';
import { toast } from './ui';
import { useWorkspace } from './workspace';

export interface Doc {
  path: string;
  title: string;
  text: string;
  mtime: number;
  loading: boolean;
  error?: string;
  preview: boolean;
  /** Restored when the tab is shown again. */
  scrollTop: number;
}

interface OpenOptions {
  preview?: boolean;
  /** A heading slug (#section) to scroll to once the document is shown. */
  anchor?: string;
  background?: boolean;
}

interface DocumentsState {
  docs: Doc[];
  active: string | null;
  /** Set by open() with an anchor; the view scrolls there and clears it. */
  pendingAnchor: string | null;
  open(path: string, opts?: OpenOptions): Promise<void>;
  reload(path: string, quiet?: boolean): Promise<void>;
  activate(path: string): void;
  close(path: string): void;
  closeMany(paths: string[]): void;
  pin(path: string): void;
  move(from: number, to: number): void;
  setScroll(path: string, top: number): void;
}

const persistSession = (s: { docs: Doc[]; active: string | null }) => save('session.docs', { paths: s.docs.filter((d) => !d.preview || d.path === s.active).map((d) => d.path), active: s.active });

/** Recently shown documents, newest first (Recent Files, Ctrl+E). */
const recent: string[] = [];
export const recentDocs = () => [...recent];
function touch(path: string) {
  const i = recent.findIndex((p) => samePath(p, path));
  if (i >= 0) recent.splice(i, 1);
  recent.unshift(path);
  recent.length = Math.min(recent.length, 50);
}

export const useDocuments = create<DocumentsState>((set, get) => {
  const commit = (p: Partial<DocumentsState>) => {
    set(p);
    persistSession(get());
    void watchOpen();
  };
  return {
    docs: [],
    active: null,
    pendingAnchor: null,
    open: async (path, opts = {}) => {
      const preview = (opts.preview ?? false) && useSettings.getState().settings.previewTabs;
      const existing = get().docs.find((d) => samePath(d.path, path));
      if (existing) {
        if (!preview && existing.preview) get().pin(existing.path);
        if (!opts.background) {
          commit({ active: existing.path, pendingAnchor: opts.anchor ?? null });
          touch(existing.path);
        }
        return;
      }
      const doc: Doc = { path, title: basename(path), text: '', mtime: 0, loading: true, preview, scrollTop: 0 };
      let docs = get().docs;
      // the preview tab is replaced, in place
      const old = preview ? docs.findIndex((d) => d.preview) : -1;
      docs = old >= 0 ? docs.map((d, i) => (i === old ? doc : d)) : [...docs, doc];
      commit({ docs, ...(opts.background ? {} : { active: path, pendingAnchor: opts.anchor ?? null }) });
      if (!opts.background) touch(path);
      useWorkspace.getState().addRecent(path, false);
      await get().reload(path, true);
    },
    reload: async (path, quiet) => {
      try {
        const f = await platform.readFile(path);
        set({ docs: get().docs.map((d) => (samePath(d.path, path) ? { ...d, text: f.text, mtime: f.mtime, loading: false, error: undefined } : d)) });
      } catch (e) {
        const error = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e);
        set({ docs: get().docs.map((d) => (samePath(d.path, path) ? { ...d, loading: false, error } : d)) });
        if (!quiet) toast('error', `Cannot read ${basename(path)}`, error);
      }
    },
    activate: (path) => {
      commit({ active: path, pendingAnchor: null });
      touch(path);
    },
    close: (path) => get().closeMany([path]),
    closeMany: (paths) => {
      const docs = get().docs;
      const gone = (d: Doc) => paths.some((p) => samePath(p, d.path));
      const rest = docs.filter((d) => !gone(d));
      let active = get().active;
      if (active && paths.some((p) => samePath(p, active))) {
        const i = docs.findIndex((d) => samePath(d.path, active));
        active = (rest[Math.min(i, rest.length - 1)] ?? null)?.path ?? null;
      }
      commit({ docs: rest, active });
    },
    pin: (path) => commit({ docs: get().docs.map((d) => (samePath(d.path, path) ? { ...d, preview: false } : d)) }),
    move: (from, to) => {
      const docs = [...get().docs];
      const [d] = docs.splice(from, 1);
      docs.splice(to, 0, d);
      commit({ docs });
    },
    setScroll: (path, top) => {
      const d = get().docs.find((x) => samePath(x.path, path));
      if (d) d.scrollTop = top; // no re-render: only read when the tab is shown again
    },
  };
});

export const activeDoc = (s = useDocuments.getState()) => s.docs.find((d) => d.path === s.active);

/** Watches the open documents and the folder, so changes on disk show up. */
async function watchOpen(): Promise<void> {
  const root = useWorkspace.getState().root;
  const paths = useDocuments.getState().docs.map((d) => d.path);
  await platform.watch(root ? [root, ...paths.filter((p) => !p.toLowerCase().startsWith(root.toLowerCase()))] : paths).catch(() => undefined);
}
useWorkspace.subscribe((s, prev) => s.root !== prev.root && void watchOpen());

/** The previous session's tabs, if Reopen last session is on. */
export async function restoreSession(): Promise<void> {
  const s = loadRaw<{ paths: string[]; active: string | null } | null>('session.docs', null);
  if (!s) return;
  for (const p of s.paths) if (await platform.stat(p)) await useDocuments.getState().open(p, { background: true });
  const active = s.active && useDocuments.getState().docs.find((d) => samePath(d.path, s.active)) ? s.active : useDocuments.getState().docs[0]?.path;
  if (active) useDocuments.getState().activate(active);
}
