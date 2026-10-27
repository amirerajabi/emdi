import { ChevronDown, ChevronRight, Copy, Eye, EyeOff, ExternalLink, FolderOpen, ListCollapse, RefreshCw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { create } from 'zustand';
import { copyText, openFolder } from '../app/actions';
import { extname, isUnder, norm, relative, samePath } from '../lib/paths';
import { platform, type FsEntry } from '../platform';
import { useDocuments } from '../store/documents';
import { textDir } from '../markdown/render';
import { useSettings } from '../store/settings';
import { toast } from '../store/ui';
import { useWorkspace } from '../store/workspace';
import { FileIcon } from './common/icons';
import { showContextMenu, type MenuItem } from './common/Menu';

interface ExplorerState {
  children: Record<string, FsEntry[] | undefined>;
  expanded: Record<string, boolean>;
  selected: string | null;
  load(dir: string): Promise<void>;
  toggle(dir: string, open?: boolean): void;
  select(path: string | null): void;
  reset(): void;
}

export const useExplorer = create<ExplorerState>((set, get) => ({
  children: {},
  expanded: {},
  selected: null,
  load: async (dir) => {
    try {
      const list = await platform.listDir(dir, { all: useSettings.getState().settings.showAllFiles });
      set((s) => ({ children: { ...s.children, [norm(dir)]: list } }));
    } catch (e) {
      set((s) => ({ children: { ...s.children, [norm(dir)]: [] } }));
      toast('error', 'Cannot list folder', e instanceof Error ? e.message : String(e));
    }
  },
  toggle: (dir, open) => {
    const key = norm(dir);
    const next = open ?? !get().expanded[key];
    set((s) => ({ expanded: { ...s.expanded, [key]: next } }));
    if (next && !get().children[key]) void get().load(dir);
  },
  select: (path) => set({ selected: path }),
  reset: () => set({ children: {}, expanded: {}, selected: null }),
}));

/** Expands the folders down to a file and selects it (auto-reveal of the active tab). */
export async function revealInExplorer(path: string): Promise<void> {
  const root = useWorkspace.getState().root;
  if (!root || !isUnder(path, root)) return;
  const segs = relative(root, path).split(/[\\/]/);
  let dir = root;
  const st = useExplorer.getState();
  for (const seg of segs.slice(0, -1)) {
    dir = `${dir}${dir.includes('\\') ? '\\' : '/'}${seg}`;
    if (!st.children[norm(dir)]) await st.load(dir);
    useExplorer.setState((s) => ({ expanded: { ...s.expanded, [norm(dir)]: true } }));
  }
  useExplorer.getState().select(path);
  requestAnimationFrame(() => document.querySelector(`[data-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: 'nearest' }));
}

interface Row {
  entry: FsEntry;
  depth: number;
}

const MARKDOWN = new Set(['.md', '.markdown', '.mdown', '.mkd', '.mdx']);

export function Explorer() {
  const root = useWorkspace((s) => s.root);
  const { children, expanded, selected } = useExplorer();
  const active = useDocuments((s) => s.active);
  const showAll = useSettings((s) => s.settings.showAllFiles);
  const treeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    useExplorer.getState().reset();
    if (root) {
      void useExplorer.getState().load(root);
      useExplorer.setState({ expanded: { [norm(root)]: true } });
    }
  }, [root, showAll]);

  // keep loaded folders in step with the disk
  useEffect(
    () =>
      platform.onFsChanged((c) => {
        const st = useExplorer.getState();
        for (const d of c.dirs) if (st.children[norm(d)]) void st.load(d);
        if (c.dirs.length) useWorkspace.getState().invalidateFiles();
      }),
    [],
  );

  // follow the active document
  useEffect(() => {
    if (active) void revealInExplorer(active);
  }, [active]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    if (!root) return out;
    const walk = (dir: string, depth: number) => {
      for (const entry of children[norm(dir)] ?? []) {
        out.push({ entry, depth });
        if (entry.isDir && expanded[norm(entry.path)]) walk(entry.path, depth + 1);
      }
    };
    walk(root, 0);
    return out;
  }, [root, children, expanded]);

  if (!root) {
    return (
      <div className="dock-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="panel-header">
          <span className="panel-title">Explorer</span>
        </div>
        <div className="panel-empty" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <span>No folder is open.</span>
          <button className="btn" onClick={() => void openFolder()}>
            <FolderOpen size={15} /> Open Folder…
          </button>
        </div>
      </div>
    );
  }

  const menuFor = (entry: FsEntry): MenuItem[] => [
    ...(!entry.isDir && MARKDOWN.has(extname(entry.path)) ? [{ label: 'Open', run: () => void useDocuments.getState().open(entry.path) } as MenuItem, 'separator' as const] : []),
    { label: 'Copy Path', icon: <Copy size={14} />, run: () => void copyText(entry.path) },
    { label: 'Copy Relative Path', run: () => void copyText(relative(root, entry.path)) },
    ...(platform.kind === 'electron'
      ? [
          { label: platform.os === 'darwin' ? 'Reveal in Finder' : 'Reveal in File Explorer', icon: <ExternalLink size={14} />, run: () => platform.reveal(entry.path) } as MenuItem,
          ...(!entry.isDir && !MARKDOWN.has(extname(entry.path)) ? [{ label: 'Open with Default App', run: () => platform.openPath?.(entry.path) } as MenuItem] : []),
        ]
      : []),
  ];

  const activate = (entry: FsEntry, pin: boolean) => {
    useExplorer.getState().select(entry.path);
    if (entry.isDir) useExplorer.getState().toggle(entry.path);
    else if (MARKDOWN.has(extname(entry.path))) void useDocuments.getState().open(entry.path, { preview: !pin });
    else if (pin) platform.openPath?.(entry.path);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const i = rows.findIndex((r) => samePath(r.entry.path, selected));
    const row = rows[i];
    const go = (k: number) => {
      const r = rows[Math.max(0, Math.min(rows.length - 1, k))];
      if (r) {
        useExplorer.getState().select(r.entry.path);
        document.querySelector(`[data-path="${CSS.escape(r.entry.path)}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'ArrowRight' && row?.entry.isDir) useExplorer.getState().toggle(row.entry.path, true);
    else if (e.key === 'ArrowLeft' && row) {
      if (row.entry.isDir && expanded[norm(row.entry.path)]) useExplorer.getState().toggle(row.entry.path, false);
      else go(rows.findLastIndex((r, k) => k < i && r.depth < row.depth));
    } else if (e.key === 'Enter' && row) activate(row.entry, true);
    else return;
    e.preventDefault();
  };

  return (
    <div className="dock-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <span className="panel-title" title={root}>
          {root.split(/[\\/]/).filter(Boolean).pop()}
        </span>
        <button
          className={`icon-btn sm${showAll ? ' on' : ''}`}
          title={showAll ? 'Show All Files: on' : 'Show All Files (not only Markdown)'}
          aria-pressed={showAll}
          onClick={() => useSettings.getState().update({ showAllFiles: !showAll })}
        >
          {showAll ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
        <button className="icon-btn sm" title="Refresh" onClick={() => Object.keys(useExplorer.getState().children).forEach((d) => void useExplorer.getState().load(d))}>
          <RefreshCw size={14} />
        </button>
        <button className="icon-btn sm" title="Collapse all" onClick={() => useExplorer.setState({ expanded: { [norm(root)]: true } })}>
          <ListCollapse size={15} />
        </button>
        <button className="icon-btn sm" title="Close folder" onClick={() => useWorkspace.getState().close()}>
          <X size={15} />
        </button>
      </div>
      <div className="panel-body tree" ref={treeRef} tabIndex={0} onKeyDown={onKeyDown} role="tree" aria-label="Files">
        {rows.length === 0 && children[norm(root)] && <div className="panel-empty">No Markdown files in this folder.</div>}
        {rows.map(({ entry, depth }) => {
          const open = entry.isDir && !!expanded[norm(entry.path)];
          const md = entry.isDir || MARKDOWN.has(extname(entry.path));
          return (
            <div
              key={entry.path}
              data-path={entry.path}
              role="treeitem"
              aria-expanded={entry.isDir ? open : undefined}
              aria-selected={samePath(selected, entry.path)}
              className={`tree-row${samePath(selected, entry.path) ? ' selected' : ''}${md ? '' : ' excluded'}`}
              style={{ paddingLeft: 6 + depth * 14 }}
              onClick={() => activate(entry, false)}
              onDoubleClick={() => !entry.isDir && activate(entry, true)}
              onContextMenu={(e) => {
                useExplorer.getState().select(entry.path);
                showContextMenu(e, menuFor(entry));
              }}
              title={entry.path}
            >
              <span className="tree-chevron">{entry.isDir ? open ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : null}</span>
              <FileIcon path={entry.path} isDir={entry.isDir} open={open} />
              <span className="tree-label" dir={textDir(entry.name)}>
                {entry.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
