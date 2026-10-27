// The outline of the active document (Kod's Structure window): its headings as a tree, filtered by typing, the heading
// in view highlighted. A click scrolls the document there.
import { ListTree, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fuzzy } from '../lib/fuzzy';
import { renderMarkdown } from '../markdown/render';
import { activeDoc, useDocuments } from '../store/documents';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { scrollToHeading } from './DocumentView';

export function useHeadings() {
  const text = useDocuments((s) => activeDoc(s)?.text ?? '');
  const s = useSettings((x) => x.settings);
  return useMemo(() => renderMarkdown(text, { typographer: s.typographer, breaks: s.breaks, linkify: s.linkify, math: s.math }).headings, [text, s.typographer, s.breaks, s.linkify, s.math]);
}

export function Outline() {
  const headings = useHeadings();
  const active = useUi((s) => s.activeHeading);
  const hasDoc = useDocuments((s) => !!s.active);
  const [filter, setFilter] = useState('');
  const top = headings.length ? Math.min(...headings.map((h) => h.level)) : 1;
  const shown = filter ? headings.filter((h) => fuzzy(filter, h.text)) : headings;
  return (
    <div className="dock-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <span className="panel-title">Outline</span>
      </div>
      {headings.length > 0 && (
        <div className="outline-filter">
          <Search size={13} className="muted" />
          <input className="outline-filter-input" placeholder="Filter headings" value={filter} onChange={(e) => setFilter(e.target.value)} spellCheck={false} />
        </div>
      )}
      <div className="panel-body tree" role="tree" aria-label="Headings">
        {!hasDoc && <div className="panel-empty">Open a document to see its outline.</div>}
        {hasDoc && headings.length === 0 && (
          <div className="panel-empty">
            <ListTree size={20} className="muted" />
            <div>This document has no headings.</div>
          </div>
        )}
        {shown.map((h) => (
          <div
            key={h.id}
            role="treeitem"
            aria-selected={h.id === active}
            className={`tree-row outline-row level-${h.level}${h.id === active ? ' selected' : ''}`}
            style={{ paddingLeft: 10 + (filter ? 0 : (h.level - top) * 14) }}
            onClick={() => scrollToHeading(h.id)}
            title={h.text}
          >
            <span className="outline-level">H{h.level}</span>
            <span className="tree-label" dir="auto">
              {h.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
