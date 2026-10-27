import { File, Hash, History, Terminal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { COMMANDS, keyLabel } from '../app/commands';
import { fuzzy } from '../lib/fuzzy';
import { basename, dirname, relative } from '../lib/paths';
import { recentDocs, useDocuments } from '../store/documents';
import { useUi, type PaletteMode } from '../store/ui';
import { useWorkspace } from '../store/workspace';
import { FileIcon } from './common/icons';
import { scrollToHeading } from './DocumentView';
import { textDir } from '../markdown/render';
import { useHeadings } from './Outline';

interface Item {
  key: string;
  label: string;
  hits?: number[];
  detail?: string;
  icon: ReactNode;
  keys?: string;
  run: () => void;
}

const PREFIX: Record<string, PaletteMode> = { '>': 'commands', '#': 'headings' };

function modeOf(text: string): { mode: PaletteMode; query: string } {
  const p = PREFIX[text[0]];
  return p ? { mode: p, query: text.slice(1).trim() } : { mode: 'files', query: text.trim() };
}

function Highlight({ text, hits }: { text: string; hits?: number[] }) {
  if (!hits?.length) return <>{text}</>;
  const set = new Set(hits);
  return (
    <>
      {[...text].map((ch, i) => (set.has(i) ? <b key={i}>{ch}</b> : <span key={i}>{ch}</span>))}
    </>
  );
}

/** Search Everywhere: files (default), > actions, # headings of the document. */
export function CommandPalette() {
  const open = useUi((s) => s.palette);
  const seed = useUi((s) => s.paletteSeed);
  const root = useWorkspace((s) => s.root);
  const headings = useHeadings();
  const [text, setText] = useState('');
  const [sel, setSel] = useState(0);
  const [files, setFiles] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setText(seed);
    setSel(0);
    setTimeout(() => input.current?.focus(), 0);
    if (root) void useWorkspace.getState().loadFiles().then(setFiles).catch(() => setFiles([]));
    else setFiles([]);
  }, [open, seed, root]);

  const special = open === 'recentFiles' ? open : null;
  const { mode, query } = special ? { mode: special, query: text.trim() } : modeOf(text);

  const close = () => useUi.getState().set({ palette: null });
  const openDoc = (p: string) => void useDocuments.getState().open(p);

  const items = useMemo((): Item[] => {
    if (mode === 'commands') {
      return COMMANDS.map((c) => ({ c, m: fuzzy(query, `${c.category}: ${c.title}`) }))
        .filter((x) => x.m)
        .sort((a, b) => b.m!.score - a.m!.score)
        .slice(0, 100)
        .map(({ c, m }) => ({ key: c.id, label: `${c.category}: ${c.title}`, hits: m!.hits, icon: <Terminal size={14} />, keys: c.keys?.[0] ? keyLabel(c.keys[0]) : undefined, run: () => void c.run() }));
    }
    if (mode === 'headings') {
      return headings
        .map((h) => ({ h, m: fuzzy(query, h.text) }))
        .filter((x) => x.m)
        .sort((a, b) => (query ? b.m!.score - a.m!.score : 0))
        .map(({ h, m }) => ({ key: h.id, label: h.text, hits: m!.hits, detail: `H${h.level}`, icon: <Hash size={14} />, run: () => scrollToHeading(h.id) }));
    }
    if (mode === 'recentFiles') {
      const active = useDocuments.getState().active;
      const listed = recentDocs();
      // the current file second, so Enter goes back to the previous one (Rider's Ctrl+E)
      if (active && listed.length > 1 && listed[0] === active) [listed[0], listed[1]] = [listed[1], listed[0]];
      const all = [...listed, ...useWorkspace.getState().recents.filter((r) => !r.isDir && !listed.includes(r.path)).map((r) => r.path)];
      return all
        .map((p) => ({ p, m: query ? fuzzy(query, basename(p)) : { score: 0, hits: [] } }))
        .filter((x) => x.m)
        .map(({ p, m }) => ({ key: p, label: basename(p), hits: m!.hits, detail: relative(root ?? undefined, dirname(p)), icon: <FileIcon path={p} size={14} />, run: () => openDoc(p) }));
    }
    // files: open tabs first when the query is empty
    const pool = [...new Set([...useDocuments.getState().docs.map((d) => d.path), ...files])];
    if (!query) {
      return pool.slice(0, 80).map((p) => ({ key: p, label: basename(p), detail: relative(root ?? undefined, dirname(p)), icon: <FileIcon path={p} size={14} />, run: () => openDoc(p) }));
    }
    const scored: { p: string; score: number; hits: number[] }[] = [];
    for (const p of pool) {
      const m = fuzzy(query, basename(p));
      if (m) {
        scored.push({ p, score: m.score + 10, hits: m.hits });
        continue;
      }
      if (/[\\/]/.test(query)) {
        const mr = fuzzy(query, relative(root ?? undefined, p));
        if (mr) scored.push({ p, score: mr.score, hits: [] });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 100).map(({ p, hits }) => ({ key: p, label: basename(p), hits, detail: relative(root ?? undefined, dirname(p)), icon: <FileIcon path={p} size={14} />, run: () => openDoc(p) }));
  }, [mode, query, files, headings, root, open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setSel(0), [text]);
  useEffect(() => {
    list.current?.querySelector('.palette-item.selected')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;

  const choose = (i: number) => {
    const it = items[i];
    if (!it) return;
    close();
    it.run();
  };

  const placeholder = mode === 'commands' ? 'Find an action' : mode === 'headings' ? 'Go to a heading' : mode === 'recentFiles' ? 'Filter recent files' : 'Search files (> actions, # headings)';
  const modeLabel = { files: 'Files', commands: 'Actions', headings: 'Headings', recentFiles: 'Recent files' }[mode];

  return (
    <div className="overlay soft" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Search everywhere">
        <div className="palette-input-row">
          {mode === 'files' ? <File size={16} /> : mode === 'commands' ? <Terminal size={16} /> : mode === 'headings' ? <Hash size={16} /> : <History size={16} />}
          <input
            ref={input}
            className="palette-input"
            value={text}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              else if (e.key === 'ArrowDown') setSel((s) => Math.min(items.length - 1, s + 1));
              else if (e.key === 'ArrowUp') setSel((s) => Math.max(0, s - 1));
              else if (e.key === 'Enter') choose(sel);
              else if (e.key === 'Tab' && !special) {
                // cycle the modes like Rider's Search Everywhere tabs
                const order = ['', '>', '#'];
                const cur = order.indexOf(text[0] && PREFIX[text[0]] ? text[0] : '');
                setText(order[(cur + 1) % order.length] + query);
              } else return;
              e.preventDefault();
            }}
            spellCheck={false}
          />
          <span className="palette-mode">{modeLabel}</span>
        </div>
        <div className="palette-list" ref={list} role="listbox">
          {items.length === 0 && <div className="palette-empty">{mode === 'headings' && !headings.length ? 'This document has no headings' : root || mode !== 'files' ? 'No matches' : 'Open a folder to search its files'}</div>}
          {items.map((it, i) => (
            <div key={it.key} role="option" aria-selected={i === sel} className={`palette-item${i === sel ? ' selected' : ''}`} onMouseMove={() => setSel(i)} onClick={() => choose(i)}>
              <span className="palette-icon">{it.icon}</span>
              <span className="palette-label" dir={textDir(it.label)}>
                <Highlight text={it.label} hits={it.hits} />
              </span>
              <span className="palette-detail">{it.detail}</span>
              {it.keys && <span className="menu-shortcut">{it.keys}</span>}
            </div>
          ))}
        </div>
        <div className="palette-footer">
          <span>↑↓ to move</span>
          <span>Enter to open</span>
          <span>Tab: files → actions → headings</span>
        </div>
      </div>
    </div>
  );
}
