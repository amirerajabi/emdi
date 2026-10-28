// Find in the document (Ctrl+F): every match is painted with the CSS Custom Highlight API (no DOM changes), the current
// one in a stronger colour and scrolled into view. Enter / Shift+Enter (F3 / Shift+F3) move between matches.
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useUi } from '../store/ui';
import { useDocuments } from '../store/documents';
import { readerBody, readerScroll } from './DocumentView';

interface HighlightRegistry {
  set(name: string, h: unknown): void;
  delete(name: string): void;
}
const highlights = (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
const HighlightCtor = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;

function findRanges(root: HTMLElement, query: string, caseSensitive: boolean): Range[] {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const out: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => ((n.parentElement?.closest('.md-code-head, .katex-mathml') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)),
  });
  for (let n = walker.nextNode(); n && out.length < 5000; n = walker.nextNode()) {
    const text = caseSensitive ? n.textContent ?? '' : (n.textContent ?? '').toLowerCase();
    for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + needle.length)) {
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + needle.length);
      out.push(r);
    }
  }
  return out;
}

export function FindBar() {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCase] = useState(false);
  const [ranges, setRanges] = useState<Range[]>([]);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const text = useDocuments((s) => s.docs.find((d) => d.path === s.active)?.text);

  useEffect(() => {
    input.current?.focus();
    const sel = window.getSelection()?.toString();
    if (sel && sel.length < 100 && !sel.includes('\n')) setQuery(sel);
    const refocus = () => {
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener('folio:find', refocus);
    return () => {
      window.removeEventListener('folio:find', refocus);
      highlights?.delete('folio-find');
      highlights?.delete('folio-find-current');
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const body = readerBody();
      const r = body ? findRanges(body, query, caseSensitive) : [];
      setRanges(r);
      setIndex(0);
    }, 80);
    return () => clearTimeout(t);
  }, [query, caseSensitive, text]);

  useEffect(() => {
    if (!highlights || !HighlightCtor) return;
    highlights.set('folio-find', new HighlightCtor(...ranges));
    const cur = ranges[index];
    if (cur) {
      highlights.set('folio-find-current', new HighlightCtor(cur));
      const scroller = readerScroll();
      const rect = cur.getBoundingClientRect();
      const box = scroller?.getBoundingClientRect();
      if (scroller && box && (rect.top < box.top + 60 || rect.bottom > box.bottom - 20)) scroller.scrollBy({ top: rect.top - box.top - box.height / 3 });
    } else highlights.delete('folio-find-current');
  }, [ranges, index]);

  const move = (d: number) => ranges.length && setIndex((i) => (i + d + ranges.length) % ranges.length);
  const close = () => useUi.getState().set({ findOpen: false });

  return (
    <div className="find-bar" role="search">
      <input
        ref={input}
        className="input find-input"
        placeholder="Find in document"
        value={query}
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'F3') move(e.shiftKey ? -1 : 1);
          else if (e.key === 'Escape') close();
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      />
      <span className="find-count muted">{query ? (ranges.length ? `${index + 1} of ${ranges.length}` : 'No results') : ''}</span>
      <button className={`icon-btn sm${caseSensitive ? ' on' : ''}`} title="Match case" aria-pressed={caseSensitive} onClick={() => setCase(!caseSensitive)}>
        <span style={{ fontSize: 11, fontWeight: 600 }}>Aa</span>
      </button>
      <button className="icon-btn sm" title="Previous (Shift+Enter)" disabled={!ranges.length} onClick={() => move(-1)}>
        <ChevronUp size={15} />
      </button>
      <button className="icon-btn sm" title="Next (Enter)" disabled={!ranges.length} onClick={() => move(1)}>
        <ChevronDown size={15} />
      </button>
      <button className="icon-btn sm" title="Close (Escape)" onClick={close}>
        <X size={15} />
      </button>
    </div>
  );
}
