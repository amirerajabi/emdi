import { Clock, Keyboard, ZoomIn } from 'lucide-react';
import { useMemo } from 'react';
import { docStats } from '../markdown/render';
import { activeDoc, useDocuments } from '../store/documents';
import { useEditorUi } from '../editor/MarkdownEditor';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useWorkspace } from '../store/workspace';
import { relative } from '../lib/paths';
import { openSettings } from './settings/nav';
import { UpdateChip } from './UpdateChip';

const n = (v: number) => v.toLocaleString();

export function StatusBar() {
  const doc = useDocuments((s) => activeDoc(s));
  const root = useWorkspace((s) => s.root);
  const progress = useUi((s) => s.progress);
  const zoom = useSettings((s) => s.settings.zoom);
  const cursor = useEditorUi((s) => s.cursor);
  const editing = !!doc && doc.mode !== 'view' && !doc.loading;
  const stats = useMemo(() => (doc ? docStats(doc.text) : null), [doc?.text]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <footer className="statusbar" aria-label="Status bar">
      {doc && (
        <span className="sb-item muted" title={doc.path}>
          {doc.untitled ? doc.title : root ? relative(root, doc.path) : doc.path}
        </span>
      )}
      <div className="flex-1" />
      {doc && stats && !doc.loading && (
        <>
          <span className="sb-item muted" title={`${n(stats.chars)} characters, ${n(stats.lines)} lines`}>
            {n(stats.words)} words
          </span>
          <span className="sb-item muted" title="Reading time at 230 words a minute">
            <Clock /> {stats.minutes} min read
          </span>
          {editing ? (
            <span className="sb-item muted" title="Line and column">
              Ln {cursor.line}, Col {cursor.column}
              {cursor.selected > 0 && ` (${cursor.selected} selected)`}
            </span>
          ) : (
            <span className="sb-item muted" title="How far you have read">
              {Math.round(progress * 100)}%
            </span>
          )}
          {zoom !== 100 && (
            <button className="sb-item muted" title="Zoom (Ctrl+0 resets)" onClick={() => useSettings.getState().update({ zoom: 100 })}>
              <ZoomIn /> {zoom}%
            </button>
          )}
          <span className="sb-item muted">UTF-8</span>
          <button className="sb-item muted" title="Reader settings" onClick={() => openSettings('reader')}>
            Markdown
          </button>
        </>
      )}
      <UpdateChip />
      <button className="sb-item" title="Keyboard shortcuts" onClick={() => useUi.getState().set({ shortcutsOpen: true })}>
        <Keyboard />
      </button>
    </footer>
  );
}
