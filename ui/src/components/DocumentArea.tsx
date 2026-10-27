import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { copyText } from '../app/actions';
import { keyLabel } from '../app/commands';
import { basename, dirname, relative } from '../lib/paths';
import { platform } from '../platform';
import { activeDoc, useDocuments, type Doc } from '../store/documents';
import { useUi } from '../store/ui';
import { useWorkspace } from '../store/workspace';
import { FileIcon } from './common/icons';
import { showContextMenu, type MenuItem } from './common/Menu';
import { DocumentView } from './DocumentView';
import { revealInExplorer } from './Explorer';

export function DocumentArea() {
  const docs = useDocuments((s) => s.docs);
  const doc = useDocuments((s) => activeDoc(s));
  const focus = useUi((s) => s.focusMode);
  return (
    <section className="workspace" aria-label="Document">
      {docs.length > 0 && !focus && <TabBar />}
      {doc ? <DocumentView key={doc.path} doc={doc} /> : <DocumentEmpty />}
    </section>
  );
}

function TabBar() {
  const docs = useDocuments((s) => s.docs);
  const active = useDocuments((s) => s.active);
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
      { label: 'Close', shortcut: keyLabel('Ctrl+W'), run: () => st.close(t.path) },
      { label: 'Close Others', disabled: docs.length < 2, run: () => st.closeMany(docs.filter((x) => x !== t).map((x) => x.path)) },
      { label: 'Close Tabs to the Right', disabled: i === docs.length - 1, run: () => st.closeMany(docs.slice(i + 1).map((x) => x.path)) },
      { label: 'Close All', run: () => st.closeMany(docs.map((x) => x.path)) },
      'separator',
      { label: 'Keep Open', disabled: !t.preview, run: () => st.pin(t.path) },
      { label: 'Reload from Disk', run: () => void st.reload(t.path) },
      'separator',
      { label: 'Copy Path', run: () => void copyText(t.path) },
      ...(root ? [{ label: 'Copy Relative Path', run: () => void copyText(relative(root, t.path)) } as MenuItem] : []),
      ...(root ? [{ label: 'Select in Explorer', run: () => { useUi.getState().showDock('explorer'); void revealInExplorer(t.path); } } as MenuItem] : []),
      ...(platform.kind === 'electron' ? [{ label: platform.os === 'darwin' ? 'Reveal in Finder' : 'Reveal in File Explorer', run: () => platform.reveal(t.path) } as MenuItem] : []),
    ];
  };

  return (
    <div className="tabbar" role="tablist" aria-label="Open documents">
      <div className="tabbar-scroll" ref={scroll} onWheel={(e) => { if (scroll.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) scroll.current.scrollLeft += e.deltaY; }}>
        {docs.map((t, i) => {
          const isActive = t.path === active;
          return (
            <div
              key={t.path}
              role="tab"
              aria-selected={isActive}
              className={`tab${isActive ? ' active' : ''}${t.preview ? ' preview' : ''}${drag === i ? ' dragging' : ''}`}
              title={t.path}
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
                if (e.button === 1) useDocuments.getState().close(t.path);
              }}
              onContextMenu={(e) => showContextMenu(e, menuFor(t, i))}
            >
              <FileIcon path={t.path} size={14} />
              <span className="tab-title">{t.title}</span>
              {dupes.has(t.title) && <span className="tab-dir">{basename(dirname(t.path))}</span>}
              <button
                className="tab-close"
                aria-label={`Close ${t.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  useDocuments.getState().close(t.path);
                }}
              >
                <X />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DocumentEmpty() {
  const rows: [string, string][] = [
    ['Search Everywhere', platform.os === 'darwin' ? '⇧ ⇧' : 'Double Shift'],
    ['Open File', keyLabel('Ctrl+O')],
    ['Open Folder', keyLabel('Ctrl+K Ctrl+O')],
    ['Recent Files', keyLabel('Ctrl+E')],
    ['Go to Heading', keyLabel('Ctrl+Shift+O')],
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
