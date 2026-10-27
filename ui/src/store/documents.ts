// Open documents (the tabs): the text being read or written and the text on disk, the mode (view, edit or split), the
// scroll position, and the preview tab (a single click in the explorer replaces it; a double click, a scroll or an edit
// keeps it). New documents are "untitled" until they are saved somewhere. Auto Save writes edited files after a pause or
// when the window loses focus; closing a tab or the window with unsaved changes asks first.
import { create } from 'zustand';
import { basename, dirname, join, samePath } from '../lib/paths';
import { loadRaw, save } from '../lib/storage';
import { platform } from '../platform';
import { useSettings } from './settings';
import { askConfirm, toast, useUi } from './ui';
import { useWorkspace } from './workspace';

export type DocMode = 'view' | 'edit' | 'split';

export interface Doc {
  path: string;
  title: string;
  /** The text shown and edited. */
  text: string;
  /** The text as last read from or written to disk; text !== saved means unsaved changes. */
  saved: string;
  mtime: number;
  loading: boolean;
  error?: string;
  preview: boolean;
  /** A new document that has no file yet (path is untitled:N). */
  untitled: boolean;
  mode: DocMode;
  /** Restored when the tab is shown again. */
  scrollTop: number;
}

interface OpenOptions {
  preview?: boolean;
  /** A heading slug (#section) to scroll to once the document is shown. */
  anchor?: string;
  background?: boolean;
  mode?: DocMode;
}

interface DocumentsState {
  docs: Doc[];
  active: string | null;
  /** Set by open() with an anchor; the view scrolls there and clears it. */
  pendingAnchor: string | null;
  /** A source line to put the editor's cursor on (double-click in the preview). */
  pendingLine: number | null;
  open(path: string, opts?: OpenOptions): Promise<void>;
  newDocument(text?: string): void;
  reload(path: string, quiet?: boolean): Promise<void>;
  setText(path: string, text: string): void;
  setMode(path: string, mode: DocMode, line?: number): void;
  save(path?: string): Promise<boolean>;
  saveAs(path?: string): Promise<boolean>;
  saveAll(opts?: { quiet?: boolean; skipUntitled?: boolean }): Promise<boolean>;
  activate(path: string): void;
  /** Closes tabs, asking about unsaved changes; false when the user cancelled. */
  close(path: string): Promise<boolean>;
  closeMany(paths: string[]): Promise<boolean>;
  pin(path: string): void;
  move(from: number, to: number): void;
  setScroll(path: string, top: number): void;
  /** A file or folder was renamed or moved on disk (the explorer): its tabs follow. */
  renamed(from: string, to: string): void;
}

export const isDirty = (d: Doc) => !d.loading && d.text !== d.saved;
const isMarkdown = (p: string) => /\.(md|markdown|mdown|mkd|mdx)$/i.test(p);

const persistSession = (s: { docs: Doc[]; active: string | null }) => {
  const real = s.docs.filter((d) => !d.untitled && (!d.preview || d.path === s.active));
  save('session.docs', { paths: real.map((d) => d.path), modes: Object.fromEntries(real.map((d) => [d.path, d.mode])), active: s.active });
};

/** Recently shown documents, newest first (Recent Files, Ctrl+E). */
const recent: string[] = [];
export const recentDocs = () => [...recent];
function touch(path: string) {
  const i = recent.findIndex((p) => samePath(p, path));
  if (i >= 0) recent.splice(i, 1);
  if (!path.startsWith('untitled:')) recent.unshift(path);
  recent.length = Math.min(recent.length, 50);
}

/** Editors keep their state (undo history, selection) per path; they follow a Save As or a rename. */
const renameListeners = new Set<(from: string, to: string) => void>();
export function onDocRenamed(cb: (from: string, to: string) => void): () => void {
  renameListeners.add(cb);
  return () => renameListeners.delete(cb);
}

let untitledSeq = 0;
const autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useDocuments = create<DocumentsState>((set, get) => {
  const commit = (p: Partial<DocumentsState>) => {
    set(p);
    persistSession(get());
    void watchOpen();
  };
  const update = (path: string, fn: (d: Doc) => Partial<Doc>) => set({ docs: get().docs.map((d) => (samePath(d.path, path) || d.path === path ? { ...d, ...fn(d) } : d)) });
  const find = (path: string) => get().docs.find((d) => d.path === path || samePath(d.path, path));

  const write = async (d: Doc, target: string): Promise<boolean> => {
    const text = d.text;
    try {
      const r = await platform.writeFile(target, text);
      update(d.path, () => ({ saved: text, mtime: r.mtime }));
      return true;
    } catch (e) {
      toast('error', `Could not save ${basename(target)}`, e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e));
      return false;
    }
  };

  return {
    docs: [],
    active: null,
    pendingAnchor: null,
    pendingLine: null,
    open: async (path, opts = {}) => {
      const preview = (opts.preview ?? false) && useSettings.getState().settings.previewTabs;
      const existing = find(path);
      if (existing) {
        if (!preview && existing.preview) get().pin(existing.path);
        if (opts.mode) update(existing.path, () => ({ mode: opts.mode! }));
        if (!opts.background) {
          commit({ active: existing.path, pendingAnchor: opts.anchor ?? null });
          touch(existing.path);
        }
        return;
      }
      const mode = opts.mode ?? (isMarkdown(path) ? useSettings.getState().settings.openMode : 'edit');
      const doc: Doc = { path, title: basename(path), text: '', saved: '', mtime: 0, loading: true, preview, untitled: false, mode, scrollTop: 0 };
      let docs = get().docs;
      // the preview tab is replaced, in place (unless it has unsaved changes)
      const old = preview ? docs.findIndex((d) => d.preview && !isDirty(d)) : -1;
      docs = old >= 0 ? docs.map((d, i) => (i === old ? doc : d)) : [...docs, doc];
      commit({ docs, ...(opts.background ? {} : { active: path, pendingAnchor: opts.anchor ?? null }) });
      if (!opts.background) touch(path);
      useWorkspace.getState().addRecent(path, false);
      await get().reload(path, true);
    },
    newDocument: (text = '') => {
      const n = ++untitledSeq;
      const path = `untitled:${n}`;
      const mode = useSettings.getState().settings.newMode;
      const doc: Doc = { path, title: `Untitled-${n}.md`, text, saved: '', mtime: 0, loading: false, preview: false, untitled: true, mode, scrollTop: 0 };
      commit({ docs: [...get().docs, doc], active: path, pendingAnchor: null });
    },
    reload: async (path, quiet) => {
      const d = find(path);
      if (!d || d.untitled) return;
      try {
        const f = await platform.readFile(d.path);
        const cur = find(path);
        if (!cur) return;
        if (cur.loading || !isDirty(cur)) update(path, () => ({ text: f.text, saved: f.text, mtime: f.mtime, loading: false, error: undefined }));
        else if (f.text !== cur.saved) {
          // changed on disk while edited here: keep the edits, offer the file's version
          update(path, () => ({ mtime: f.mtime }));
          useUi.getState().toast(
            { kind: 'warning', text: `${cur.title} changed on disk`, detail: 'Your unsaved changes are kept. Save to overwrite the file, or reload it and drop your changes.', action: { label: 'Reload from disk', run: () => update(path, () => ({ text: f.text, saved: f.text })) } },
            12000,
          );
        }
      } catch (e) {
        const error = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e);
        update(path, (x) => (x.loading ? { loading: false, error } : {}));
        if (!quiet) toast('error', `Cannot read ${basename(path)}`, error);
      }
    },
    setText: (path, text) => {
      const d = find(path);
      if (!d || d.text === text) return;
      update(path, () => ({ text, preview: false }));
      const s = useSettings.getState().settings;
      if (s.autoSave === 'afterDelay' && !d.untitled) {
        clearTimeout(autoSaveTimers.get(d.path));
        autoSaveTimers.set(
          d.path,
          setTimeout(() => {
            autoSaveTimers.delete(d.path);
            const cur = find(d.path);
            if (cur && isDirty(cur) && !cur.untitled) void write(cur, cur.path);
          }, s.autoSaveDelay),
        );
      }
    },
    setMode: (path, mode, line) => {
      update(path, () => ({ mode }));
      set({ pendingLine: line ?? null });
      persistSession(get());
    },
    save: async (path) => {
      const d = find(path ?? get().active ?? '');
      if (!d) return false;
      if (d.untitled) return get().saveAs(d.path);
      clearTimeout(autoSaveTimers.get(d.path));
      return isDirty(d) ? write(d, d.path) : true;
    },
    saveAs: async (path) => {
      const d = find(path ?? get().active ?? '');
      if (!d) return false;
      const dir = d.untitled ? (useWorkspace.getState().root ?? '') : dirname(d.path);
      const suggested = dir ? join(dir, d.title) : d.title;
      const target = await platform.pickSavePath(d.untitled ? 'Save' : 'Save As', suggested);
      if (!target) return false;
      const other = find(target);
      if (other && other !== d) get().closeMany([other.path]);
      if (!(await write(d, target))) return false;
      const from = d.path;
      update(from, () => ({ path: target, title: basename(target), untitled: false }));
      if (get().active === from) set({ active: target });
      for (const cb of renameListeners) cb(from, target);
      useWorkspace.getState().addRecent(target, false);
      touch(target);
      commit({});
      return true;
    },
    saveAll: async (opts = {}) => {
      let ok = true;
      for (const d of get().docs) {
        if (!isDirty(d) || (d.untitled && opts.skipUntitled)) continue;
        if (d.untitled) {
          get().activate(d.path);
          ok = (await get().saveAs(d.path)) && ok;
        } else ok = (await write(d, d.path)) && ok;
      }
      return ok;
    },
    activate: (path) => {
      commit({ active: path, pendingAnchor: null });
      touch(path);
    },
    close: (path) => get().closeMany([path]),
    closeMany: async (paths) => {
      const closing: Doc[] = [];
      for (const p of paths) {
        const d = find(p);
        if (!d) continue;
        if (isDirty(d) && !(d.untitled && !d.text.trim())) {
          const s = useSettings.getState().settings;
          if (s.autoSave !== 'off' && !d.untitled) {
            if (!(await write(d, d.path))) return false;
          } else {
            get().activate(d.path);
            const answer = await askConfirm({ title: 'Unsaved changes', message: `Save the changes to ${d.title}?`, okLabel: 'Save', altLabel: "Don't save" });
            if (answer === 'cancel') return false;
            if (answer === 'ok' && !(await get().save(d.path))) return false;
          }
        }
        clearTimeout(autoSaveTimers.get(d.path));
        closing.push(find(d.path) ?? d);
      }
      const docs = get().docs;
      const rest = docs.filter((d) => !closing.some((c) => c.path === d.path));
      let active = get().active;
      if (active && closing.some((c) => c.path === active)) {
        const i = docs.findIndex((d) => d.path === active);
        active = (rest[Math.min(i, rest.length - 1)] ?? null)?.path ?? null;
      }
      commit({ docs: rest, active });
      return true;
    },
    pin: (path) => commit({ docs: get().docs.map((d) => (d.path === path ? { ...d, preview: false } : d)) }),
    move: (from, to) => {
      const docs = [...get().docs];
      const [d] = docs.splice(from, 1);
      docs.splice(to, 0, d);
      commit({ docs });
    },
    setScroll: (path, top) => {
      const d = find(path);
      if (d) d.scrollTop = top; // no re-render: only read when the tab is shown again
    },
    renamed: (from, to) => {
      const moves: [string, string][] = [];
      const docs = get().docs.map((d) => {
        const rel = samePath(d.path, from) ? '' : d.path.toLowerCase().startsWith(from.toLowerCase() + (from.includes('\\') ? '\\' : '/')) ? d.path.slice(from.length) : null;
        if (rel === null) return d;
        const next = to + rel;
        moves.push([d.path, next]);
        return { ...d, path: next, title: basename(next) };
      });
      if (!moves.length) return;
      const active = moves.find(([a]) => a === get().active)?.[1] ?? get().active;
      commit({ docs, active });
      for (const [a, b] of moves) for (const cb of renameListeners) cb(a, b);
    },
  };
});

export const activeDoc = (s = useDocuments.getState()) => s.docs.find((d) => d.path === s.active);

/** Watches the open documents and the folder, so changes on disk show up. */
async function watchOpen(): Promise<void> {
  const root = useWorkspace.getState().root;
  const paths = useDocuments.getState().docs.filter((d) => !d.untitled).map((d) => d.path);
  await platform.watch(root ? [root, ...paths.filter((p) => !p.toLowerCase().startsWith(root.toLowerCase()))] : paths).catch(() => undefined);
}
useWorkspace.subscribe((s, prev) => s.root !== prev.root && void watchOpen());

/** The previous session's tabs, if Reopen last session is on. */
export async function restoreSession(): Promise<void> {
  const s = loadRaw<{ paths: string[]; modes?: Record<string, DocMode>; active: string | null } | null>('session.docs', null);
  if (!s) return;
  for (const p of s.paths) if (await platform.stat(p)) await useDocuments.getState().open(p, { background: true, mode: s.modes?.[p] });
  const active = s.active && useDocuments.getState().docs.find((d) => samePath(d.path, s.active)) ? s.active : useDocuments.getState().docs[0]?.path;
  if (active) useDocuments.getState().activate(active);
}

/** Auto Save "when focus changes", and saving everything before the window closes. */
export function installAutoSave(): void {
  window.addEventListener('blur', () => {
    if (useSettings.getState().settings.autoSave !== 'off') void useDocuments.getState().saveAll({ quiet: true, skipUntitled: true });
  });
  platform.onBeforeClose?.(async () => {
    if (useSettings.getState().settings.autoSave !== 'off') await useDocuments.getState().saveAll({ quiet: true, skipUntitled: true });
  });
  // what is still unsaved (untitled documents, Auto Save off) makes the shell ask before quitting
  window.addEventListener('beforeunload', (e) => {
    if (useDocuments.getState().docs.some((d) => isDirty(d) && !(d.untitled && !d.text.trim()))) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}
