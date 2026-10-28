// The reader: the active document rendered as a page. Links to other Markdown files open them in Folio (with their
// #heading), web links open in the browser, local images are served by the desktop shell, code blocks get a copy button
// and mermaid blocks become diagrams. The heading in view is reported for the outline and the "On this page" list.
import { FileWarning, LoaderCircle } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import { copyText } from '../app/actions';
import { renderMermaid, resetMermaid } from '../markdown/mermaid';
import { renderMarkdown, textDir, type Heading } from '../markdown/render';
import { dirname, extname, fileUrl, resolvePath } from '../lib/paths';
import { platform } from '../platform';
import { useDocuments, type Doc } from '../store/documents';
import { effectiveTheme, useSettings, type Settings } from '../store/settings';
import { useUi } from '../store/ui';
import { FindBar } from './FindBar';
import '../markdown/markdown.css';
import '../markdown/code.css';
import 'katex/dist/katex.min.css';

const MARKDOWN_EXT = new Set(['.md', '.markdown', '.mdown', '.mkd', '.mdx']);
const WIDTHS: Record<Settings['contentWidth'], string> = { narrow: '680px', normal: '820px', wide: '1080px', full: '100%' };
const FONTS: Record<Exclude<Settings['readerFont'], 'custom'>, string> = {
  sans: "'Inter', 'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, 'Vazirmatn', sans-serif",
  serif: "'Charter', 'Iowan Old Style', 'Source Serif Pro', Georgia, 'Vazirmatn', serif",
  system: 'system-ui, -apple-system, sans-serif',
};

/** The page's fonts and sizes as CSS variables (the reader and the editor share them). */
export function readerStyle(s: Settings): CSSProperties {
  const reader = s.readerFont === 'custom' && s.readerFontFamily.trim() ? s.readerFontFamily : FONTS[s.readerFont === 'custom' ? 'sans' : s.readerFont];
  return {
    '--reader-width': WIDTHS[s.contentWidth],
    '--reader-size': `${(s.readerFontSize * s.zoom) / 100}px`,
    '--reader-line': String(s.lineHeight),
    '--font-reader': reader,
    '--font-code': s.codeFontFamily,
    '--font-editor': s.editorFont === 'mono' ? s.codeFontFamily : reader,
    '--editor-size': `${(s.editorFontSize * s.zoom) / 100}px`,
  } as CSSProperties;
}

/** The element that scrolls the active document (Find, the outline and commands use it). */
export const readerScroll = () => document.querySelector<HTMLElement>('.reader-scroll');
export const readerBody = () => document.querySelector<HTMLElement>('.markdown-body');

export function scrollToHeading(id: string, smooth = true): void {
  const el = readerBody()?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
  const scroller = readerScroll();
  if (!el || !scroller) return;
  scroller.scrollTo({ top: el.offsetTop - 16, behavior: smooth ? 'smooth' : 'auto' });
}

export function DocumentView({ doc }: { doc: Doc }) {
  const s = useSettings((x) => x.settings);
  const findOpen = useUi((x) => x.findOpen);
  const pendingAnchor = useDocuments((x) => x.pendingAnchor);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLElement>(null);
  const rendered = useMemo(() => renderMarkdown(doc.text, { typographer: s.typographer, breaks: s.breaks, linkify: s.linkify, math: s.math }), [doc.text, s.typographer, s.breaks, s.linkify, s.math]);
  const dark = effectiveTheme(s) === 'dark';

  // after every render: local images, then diagrams
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const dir = dirname(doc.path);
    for (const img of body.querySelectorAll<HTMLImageElement>('img[src]')) {
      const src = img.getAttribute('src') ?? '';
      img.loading = 'lazy';
      if (platform.kind === 'electron' && src && !/^([a-z][\w+.-]*:|\/\/)/i.test(src)) img.src = fileUrl(resolvePath(dir, decodeURI(src.split(/[?#]/)[0])));
    }
    if (s.mermaid) void renderMermaid(body);
  }, [rendered, doc.path, s.mermaid]);

  // diagrams follow the theme
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !s.mermaid) return;
    resetMermaid(body);
    void renderMermaid(body);
  }, [dark, s.mermaid]);

  // scroll: back to where this tab was, or to the requested heading
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || doc.loading) return;
    if (pendingAnchor) {
      scrollToHeading(pendingAnchor, false);
      useDocuments.setState({ pendingAnchor: null });
    } else el.scrollTop = doc.scrollTop;
    report();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.path, doc.loading, pendingAnchor]);

  const report = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    let active: string | null = rendered.headings[0]?.id ?? null;
    for (const h of rendered.headings) {
      const node = bodyRef.current?.querySelector<HTMLElement>(`#${CSS.escape(h.id)}`);
      if (node && node.offsetTop - 80 <= el.scrollTop) active = h.id;
      else if (node) break;
    }
    useUi.setState({ activeHeading: active, progress: max > 0 ? el.scrollTop / max : 1 });
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    useDocuments.getState().setScroll(doc.path, el.scrollTop);
    if (doc.preview && el.scrollTop > 400) useDocuments.getState().pin(doc.path);
    requestAnimationFrame(report);
  };

  /** The source line of the block under the pointer, to edit it. */
  const jumpToSource = (e: React.MouseEvent) => {
    const block = (e.target as HTMLElement).closest<HTMLElement>('[data-line]');
    if (!block) return;
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    useDocuments.getState().setMode(doc.path, doc.mode === 'view' ? 'split' : doc.mode, Number(block.dataset.line));
  };

  const onClick = (e: React.MouseEvent) => {
    if (e.altKey && e.button === 0) return jumpToSource(e);
    const target = e.target as HTMLElement;
    const copy = target.closest<HTMLElement>('[data-copy]');
    if (copy) {
      const code = copy.closest('.md-code')?.querySelector('code')?.textContent ?? '';
      void copyText(code, 'Code');
      copy.textContent = 'Copied';
      setTimeout(() => (copy.textContent = 'Copy'), 1400);
      return;
    }
    const a = target.closest<HTMLAnchorElement>('a[href]');
    if (!a) return;
    e.preventDefault();
    followLink(a.getAttribute('href') ?? '', doc.path);
  };

  if (doc.error) {
    return (
      <div className="reader-state">
        <FileWarning size={28} />
        <div>{doc.error}</div>
        <button className="btn" onClick={() => void useDocuments.getState().reload(doc.path)}>
          Try again
        </button>
      </div>
    );
  }

  const style = readerStyle(s);

  return (
    <div className="reader" style={style}>
      {findOpen && <FindBar key={doc.path} />}
      <div className="reader-scroll" ref={scrollRef} onScroll={onScroll} tabIndex={-1}>
        {doc.loading ? (
          <div className="reader-state">
            <LoaderCircle className="spin" size={22} />
          </div>
        ) : (
          <div className="reader-layout" dir={rendered.dir}>
            <article ref={bodyRef} className={`markdown-body${s.numberHeadings ? ' numbered' : ''}`} dir={rendered.dir} onClick={onClick} onAuxClick={onClick} onDoubleClick={(e) => doc.mode === 'split' && jumpToSource(e)}>
              {s.showFrontMatter && rendered.frontMatter && rendered.frontMatter.length > 0 && <FrontMatter rows={rendered.frontMatter} />}
              <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
              {!doc.text.trim() && <p className="md-empty">This document is empty.</p>}
            </article>
            {s.floatingToc && rendered.headings.length > 1 && <PageToc headings={rendered.headings} />}
          </div>
        )}
      </div>
    </div>
  );
}

function FrontMatter({ rows }: { rows: [string, string][] }) {
  return (
    <table className="md-front-matter">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th dir="ltr">{k}</th>
            <td dir={textDir(v)}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** "On this page": the headings beside the text on wide windows, the one in view highlighted. */
function PageToc({ headings }: { headings: Heading[] }) {
  const active = useUi((s) => s.activeHeading);
  const top = Math.min(...headings.map((h) => h.level));
  return (
    <nav className="page-toc" aria-label="On this page">
      <div className="page-toc-title">On this page</div>
      {headings
        .filter((h) => h.level <= top + 2)
        .map((h) => (
          <a
            key={h.id}
            href={`#${h.id}`}
            className={`page-toc-item${h.id === active ? ' active' : ''}`}
            style={{ paddingInlineStart: 10 + (h.level - top) * 12 }}
            onClick={(e) => {
              e.preventDefault();
              scrollToHeading(h.id);
            }}
          >
            <span dir={textDir(h.text)}>{h.text}</span>
          </a>
        ))}
    </nav>
  );
}

/** A link in a document: #heading, a web address, another Markdown file (opened here), or any other local file. */
export function followLink(href: string, from: string): void {
  if (!href) return;
  if (href.startsWith('#')) {
    scrollToHeading(decodeURIComponent(href.slice(1)));
    return;
  }
  if (/^(https?|mailto):/i.test(href)) {
    platform.openExternal(href);
    return;
  }
  if (/^[a-z][\w+.-]*:/i.test(href) && !/^[a-z]:[\\/]/i.test(href)) return; // javascript:, file: and other schemes
  const [pathPart, anchor] = href.split('#');
  const target = resolvePath(dirname(from), decodeURIComponent(pathPart.split('?')[0]));
  if (MARKDOWN_EXT.has(extname(target))) void useDocuments.getState().open(target, { anchor: anchor ? decodeURIComponent(anchor) : undefined });
  else platform.openPath?.(target);
}
