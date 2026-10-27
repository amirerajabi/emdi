// Find in Files: the text in every Markdown file of the open folder, grouped by file; a click opens the document at the
// heading above the match.
import { ChevronDown, ChevronRight, LoaderCircle, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { slugify } from '../markdown/render';
import { basename, dirname, relative } from '../lib/paths';
import { platform } from '../platform';
import { useDocuments } from '../store/documents';
import { useWorkspace } from '../store/workspace';
import { FileIcon } from './common/icons';

interface Hit {
  line: number;
  text: string;
  start: number;
  /** The heading above the match, to open the document there. */
  anchor?: string;
}

interface FileHits {
  path: string;
  hits: Hit[];
}

const MAX_HITS = 2000;

export function SearchPanel() {
  const root = useWorkspace((s) => s.root);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FileHits[]>([]);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const run = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = () => input.current?.focus();
    focus();
    window.addEventListener('emdi:find-in-files', focus);
    return () => window.removeEventListener('emdi:find-in-files', focus);
  }, []);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    const id = ++run.current;
    if (!q || q.length < 2) {
      setResults([]);
      setBusy(false);
      return;
    }
    const t = setTimeout(async () => {
      setBusy(true);
      const files = root ? await useWorkspace.getState().loadFiles() : useDocuments.getState().docs.map((d) => d.path);
      const out: FileHits[] = [];
      let total = 0;
      for (const path of files) {
        if (run.current !== id || total >= MAX_HITS) break;
        let text: string;
        try {
          text = (await platform.readFile(path)).text;
        } catch {
          continue;
        }
        if (!text.toLowerCase().includes(q)) continue;
        const hits: Hit[] = [];
        let anchor: string | undefined;
        text.split('\n').forEach((line, i) => {
          const h = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
          if (h) anchor = slugify(h[1]);
          const at = line.toLowerCase().indexOf(q);
          if (at >= 0 && hits.length < 200) hits.push({ line: i, text: line, start: at, anchor });
        });
        total += hits.length;
        out.push({ path, hits });
        if (run.current === id) setResults([...out]);
      }
      if (run.current === id) {
        setResults(out);
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, root]);

  const count = results.reduce((n, f) => n + f.hits.length, 0);
  const snippet = (h: Hit) => {
    const from = Math.max(0, h.start - 30);
    const len = query.trim().length;
    return (
      <>
        {from > 0 && '…'}
        {h.text.slice(from, h.start)}
        <mark>{h.text.slice(h.start, h.start + len)}</mark>
        {h.text.slice(h.start + len, h.start + len + 80)}
      </>
    );
  };

  return (
    <div className="dock-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <span className="panel-title">Find in Files</span>
        {busy && <LoaderCircle size={14} className="spin muted" />}
      </div>
      <div className="outline-filter">
        <Search size={13} className="muted" />
        <input ref={input} className="outline-filter-input" placeholder={root ? 'Search the folder' : 'Search open documents'} value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
      </div>
      {query.trim().length >= 2 && !busy && <div className="search-summary muted">{count ? `${count} result${count === 1 ? '' : 's'} in ${results.length} file${results.length === 1 ? '' : 's'}` : 'No results'}</div>}
      <div className="panel-body tree">
        {results.map((f) => (
          <div key={f.path}>
            <div className="tree-row" onClick={() => setCollapsed((c) => ({ ...c, [f.path]: !c[f.path] }))} title={f.path}>
              <span className="tree-chevron">{collapsed[f.path] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>
              <FileIcon path={f.path} />
              <span className="tree-label">{basename(f.path)}</span>
              <span className="tree-hint">{root ? relative(root, dirname(f.path)) : ''}</span>
              <span className="tree-hint">{f.hits.length}</span>
            </div>
            {!collapsed[f.path] &&
              f.hits.map((h) => (
                <div key={h.line} className="tree-row search-hit" style={{ paddingLeft: 34 }} onClick={() => void useDocuments.getState().open(f.path, { anchor: h.anchor })} title={h.text}>
                  <span className="tree-label" dir="auto">
                    {snippet(h)}
                  </span>
                  <span className="tree-hint">{h.line + 1}</span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
