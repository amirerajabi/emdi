import { BookOpen, Columns2, PenLine, X } from 'lucide-react';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { copyText } from '../app/actions';
import { keyLabel } from '../app/commands';
import { activeEditor, MarkdownEditor } from '../editor/MarkdownEditor';
import { editorToPreview, previewToEditor } from '../editor/scrollSync';
import { EditorToolbar } from '../editor/Toolbar';
import { basename, dirname, relative } from '../lib/paths';
import { platform } from '../platform';
import { activeDoc, isDirty, useDocuments, type Doc, type DocMode } from '../store/documents';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useWorkspace } from '../store/workspace';
import { FileIcon } from './common/icons';
import { showContextMenu, type MenuItem } from './common/Menu';
import { Splitter } from './common/Splitter';
import { DocumentView, readerScroll, readerStyle } from './DocumentView';
import { revealInExplorer } from './Explorer';

export function DocumentArea() {
  const docs = useDocuments((s) => s.docs);
  const doc = useDocuments((s) => activeDoc(s));
  const focus = useUi((s) => s.focusMode);
  return (
    <section className="workspace" aria-label="Document">
      {docs.length > 0 && !focus && <TabBar />}
      {!doc ? <DocumentEmpty /> : doc.mode === 'view' || doc.loading || doc.error ? <DocumentView key={doc.path} doc={doc} /> : doc.mode === 'edit' ? <EditorPane key={doc.path} doc={doc} centered /> : <SplitView key={doc.path} doc={doc} />}
    </section>
  );
}

/** The toolbar (if shown) over the editor; alone in Edit mode the text is a centred column like the page. */
function EditorPane({ doc, centered, onScroll }: { doc: Doc; centered?: boolean; onScroll?: (v: EditorView) => void }) {
  const s = useSettings((x) => x.settings);
  return (
    <div className={`editor-pane${centered ? ' centered' : ''}`} style={readerStyle(s)}>
      {s.showToolbar && <EditorToolbar />}
      <MarkdownEditor doc={doc} onScroll={onScroll} />
    </div>
  );
}

/** The editor and the live preview side by side, scrolling together. */
function SplitView({ doc }: { doc: Doc }) {
  const ratio = useUi((s) => s.splitRatio);
  const sync = useSettings((s) => s.settings.syncScroll);
  // typing stays smooth on long documents: the preview renders the latest text when the browser has time
  const text = useDeferredValue(doc.text);
  const ref = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState(ratio);
  const lead = useRef<'editor' | 'preview'>('editor');

  // whoever the user touches leads the scrolling
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = (e: Event) => {
      const t = e.target as HTMLElement;
      lead.current = t.closest('.reader') ? 'preview' : t.closest('.md-editor') ? 'editor' : lead.current;
    };
    el.addEventListener('wheel', mark, { passive: true, capture: true });
    el.addEventListener('pointerdown', mark, true);
    el.addEventListener('keydown', mark, true);
    const preview = () => {
      const sc = readerScroll();
      const v = activeEditor();
      if (sync && lead.current === 'preview' && sc && v) previewToEditor(sc, v);
    };
    const sc = () => readerScroll();
    const attach = () => sc()?.addEventListener('scroll', preview, { passive: true });
    attach();
    // the preview's scroller appears once the document is rendered
    const obs = new MutationObserver(() => {
      sc()?.removeEventListener('scroll', preview);
      attach();
    });
    obs.observe(el, { childList: true, subtree: false });
    return () => {
      el.removeEventListener('wheel', mark, true);
      el.removeEventListener('pointerdown', mark, true);
      el.removeEventListener('keydown', mark, true);
      sc()?.removeEventListener('scroll', preview);
      obs.disconnect();
    };
  }, [sync]);

  const onEditorScroll = (v: EditorView) => {
    const sc = readerScroll();
    if (sync && lead.current === 'editor' && sc) editorToPreview(v, sc);
  };

  return (
    <div className="split" ref={ref}>
      <div style={{ flex: `0 0 ${ratio * 100}%`, display: 'flex', minWidth: 0 }}>
        <EditorPane doc={doc} onScroll={onEditorScroll} />
      </div>
      <Splitter
        direction="vertical"
        onDragStart={() => setStart(ratio)}
        onDrag={(d) => useUi.getState().setLayout({ splitRatio: Math.max(0.2, Math.min(0.8, start + d / (ref.current?.offsetWidth ?? 1000))) })}
        onDoubleClick={() => useUi.getState().setLayout({ splitRatio: 0.5 })}
      />
      <DocumentView doc={{ ...doc, text }} />
    </div>
  );
}

const MODES: { mode: DocMode; label: string; Icon: typeof BookOpen; key: string }[] = [
  { mode: 'view', label: 'View', Icon: BookOpen, key: 'Ctrl+Alt+1' },
  { mode: 'edit', label: 'Edit', Icon: PenLine, key: 'Ctrl+Alt+2' },
  { mode: 'split', label: 'Split', Icon: Columns2, key: 'Ctrl+Alt+3' },
];

function ModeSwitch({ doc }: { doc: Doc }) {
  return (
    <div className="mode-switch" role="radiogroup" aria-label="Mode">
      {MODES.map(({ mode, label, Icon, key }) => (
        <button key={mode} type="button" role="radio" aria-checked={doc.mode === mode} className={doc.mode === mode ? 'on' : ''} title={`${label} (${keyLabel(key)})`} onClick={() => useDocuments.getState().setMode(doc.path, mode)}>
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
}

function SaveState({ doc }: { doc: Doc }) {
  const auto = useSettings((s) => s.settings.autoSave);
  if (doc.mode === 'view' && !isDirty(doc)) return null;
  const dirty = isDirty(doc);
  return <span className="save-state" title={doc.untitled ? 'Not saved yet' : auto !== 'off' ? 'Auto Save is on' : undefined}>{doc.untitled ? 'Not saved' : dirty ? (auto === 'afterDelay' ? 'Saving…' : 'Edited') : 'Saved'}</span>;
}

function TabBar() {
  const docs = useDocuments((s) => s.docs);
  const active = useDocuments((s) => s.active);
  const doc = useDocuments((s) => activeDoc(s));
  const root = useWorkspace((s) => s.root);
  const [drag, setDrag] = useState<number | null>(null);
  const scroll = useRef<HTMLDivElement>(null);

  // keep the active tab visible
  useEffect(() => {
    const el = scroll.current?.querySelector('.tab.active') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  // two tabs with the same file name show their folder
  const dupes = new Set(docs.map((t) => t.title).filter((t, i, a) => a.indexOf(t) !== i));

  const menuFor = (t: Doc, i: number): MenuItem[] => {
    const st = useDocuments.getState();
    return [
      { label: 'Close', shortcut: keyLabel('Ctrl+W'), run: () => void st.close(t.path) },
      { label: 'Close Others', disabled: docs.length < 2, run: () => void st.closeMany(docs.filter((x) => x !== t).map((x) => x.path)) },
      { label: 'Close Tabs to the Right', disabled: i === docs.length - 1, run: () => void st.closeMany(docs.slice(i + 1).map((x) => x.path)) },
      { label: 'Close All', run: () => void st.closeMany(docs.map((x) => x.path)) },
      'separator',
      { label: 'Save', shortcut: keyLabel('Ctrl+S'), disabled: !isDirty(t) && !t.untitled, run: () => void st.save(t.path) },
      { label: 'Save As…', run: () => void st.saveAs(t.path) },
      { label: 'Keep Open', disabled: !t.preview, run: () => st.pin(t.path) },
      { label: 'Reload from Disk', disabled: t.untitled, run: () => void st.reload(t.path) },
      'separator',
      ...(!t.untitled
        ? ([
            { label: 'Copy Path', run: () => void copyText(t.path) },
            ...(root ? [{ label: 'Copy Relative Path', run: () => void copyText(relative(root, t.path)) } as MenuItem] : []),
            ...(root ? [{ label: 'Select in Explorer', run: () => { useUi.getState().showDock('explorer'); void revealInExplorer(t.path); } } as MenuItem] : []),
            ...(platform.kind === 'electron' ? [{ label: platform.os === 'darwin' ? 'Reveal in Finder' : 'Reveal in File Explorer', run: () => platform.reveal(t.path) } as MenuItem] : []),
          ] as MenuItem[])
        : []),
    ];
  };

  return (
    <div className="tabbar" role="tablist" aria-label="Open documents">
      <div className="tabbar-scroll" ref={scroll} onWheel={(e) => { if (scroll.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) scroll.current.scrollLeft += e.deltaY; }}>
        {docs.map((t, i) => {
          const isActive = t.path === active;
          const dirty = isDirty(t);
          return (
            <div
              key={t.path}
              role="tab"
              aria-selected={isActive}
              className={`tab${isActive ? ' active' : ''}${t.preview ? ' preview' : ''}${drag === i ? ' dragging' : ''}`}
              title={t.untitled ? 'Not saved yet' : t.path}
              draggable
              onDragStart={(e) => {
                setDrag(i);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (drag === null || drag === i) return;
                e.preventDefault();
                useDocuments.getState().move(drag, i);
                setDrag(i);
              }}
              onDragEnd={() => setDrag(null)}
              onClick={() => useDocuments.getState().activate(t.path)}
              onDoubleClick={() => useDocuments.getState().pin(t.path)}
              onAuxClick={(e) => {
                if (e.button === 1) void useDocuments.getState().close(t.path);
              }}
              onContextMenu={(e) => showContextMenu(e, menuFor(t, i))}
            >
              <FileIcon path={t.title} size={14} />
              <span className="tab-title">{t.title}</span>
              {dupes.has(t.title) && !t.untitled && <span className="tab-dir">{basename(dirname(t.path))}</span>}
              <button
                className={`tab-close${dirty ? ' dirty' : ''}`}
                aria-label={`Close ${t.title}`}
                title={dirty ? 'Unsaved changes' : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  void useDocuments.getState().close(t.path);
                }}
              >
                <span className="tab-dirty-dot" />
                <X />
              </button>
            </div>
          );
        })}
      </div>
      {doc && !doc.loading && !doc.error && (
        <>
          <SaveState doc={doc} />
          <ModeSwitch doc={doc} />
        </>
      )}
    </div>
  );
}

function DocumentEmpty() {
  const rows: [string, string][] = [
    ['Search Everywhere', platform.os === 'darwin' ? '⇧ ⇧' : 'Double Shift'],
    ['New Document', keyLabel('Ctrl+N')],
    ['Open File', keyLabel('Ctrl+O')],
    ['Open Folder', keyLabel('Ctrl+K Ctrl+O')],
    ['Recent Files', keyLabel('Ctrl+E')],
    ['Find Action', keyLabel('Ctrl+Shift+A')],
  ];
  return (
    <div className="editor-empty">
      <div className="editor-empty-inner">
        {rows.map(([label, key]) => (
          <div key={label} style={{ display: 'contents' }}>
            <span style={{ textAlign: 'right' }}>{label}</span>
            <span className="kbd-group k">
              {key.split(' ').map((k, i) => (
                <kbd key={i}>{k}</kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
