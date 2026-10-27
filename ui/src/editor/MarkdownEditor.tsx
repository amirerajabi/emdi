// The Markdown editor of a document (Edit and Split modes). Each document keeps its editor state (text, undo history,
// selection, scroll) while its tab is open, so switching tabs or modes loses nothing; the text goes to the documents
// store as it is typed, and comes back when the file is reloaded from disk.
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { onDocRenamed, useDocuments, type Doc } from '../store/documents';
import { useSettings } from '../store/settings';
import { formatAt, type FormatState } from './format';
import { compartments, editorExtensions, settingsExtensions } from './setup';
import './editor.css';

interface EditorUi {
  /** What the cursor is in, for the toolbar. */
  format: FormatState | null;
  cursor: { line: number; column: number; selected: number };
}

export const useEditorUi = create<EditorUi>(() => ({ format: null, cursor: { line: 1, column: 1, selected: 0 } }));

/** Per open document: its editor state, scroll, and the path its edits go to (it follows Save As and renames). */
interface Kept {
  state: EditorState;
  scrollTop: number;
  box: { path: string };
}
const states = new Map<string, Kept>();
let current: EditorView | null = null;
const liveBoxes = new Set<{ path: string }>();

/** Sends a document's edits to the store; one per document, so a kept state stays wired to it. */
function changeListener(box: { path: string }) {
  let frame = 0;
  return EditorView.updateListener.of((u) => {
    if (u.docChanged) useDocuments.getState().setText(box.path, u.state.doc.toString());
    if (u.docChanged || u.selectionSet || u.focusChanged) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => report(u.view));
    }
  });
}

/** The editor that is showing, if any (the toolbar, the menus and the palette act on it). */
export const activeEditor = () => current;

onDocRenamed((from, to) => {
  const s = states.get(from);
  if (s) {
    states.delete(from);
    s.box.path = to;
    states.set(to, s);
  }
  // the editor showing now keeps its box in the closure below
  for (const b of liveBoxes) if (b.path === from) b.path = to;
});
// a closed tab drops its editor state
useDocuments.subscribe((s, prev) => {
  if (s.docs.length < prev.docs.length) for (const p of states.keys()) if (!s.docs.some((d) => d.path === p)) states.delete(p);
});

function report(view: EditorView): void {
  const st = view.state;
  const head = st.selection.main.head;
  const line = st.doc.lineAt(head);
  useEditorUi.setState({
    format: formatAt(st),
    cursor: { line: line.number, column: head - line.from + 1, selected: st.selection.ranges.reduce((n, r) => n + r.to - r.from, 0) },
  });
}

/** Puts the cursor on a source line and shows it (a double-click in the preview, Go to heading). */
export function revealLine(view: EditorView, line: number): void {
  const n = Math.max(1, Math.min(view.state.doc.lines, line + 1));
  const pos = view.state.doc.line(n).from;
  view.dispatch({ selection: EditorSelection.cursor(pos), effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
  view.focus();
}

export function MarkdownEditor({ doc, onScroll }: { doc: Doc; onScroll?: (view: EditorView) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const settings = useSettings((s) => s.settings);
  const pendingLine = useDocuments((s) => s.pendingLine);
  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;

  // create the view (or bring back this document's state)
  useEffect(() => {
    const saved = states.get(doc.path);
    const box = saved?.box ?? { path: doc.path };
    liveBoxes.add(box);
    const state = saved && saved.state.doc.toString() === doc.text ? saved.state : EditorState.create({ doc: doc.text, extensions: editorExtensions(useSettings.getState().settings, changeListener(box)) });
    const view = new EditorView({ state, parent: host.current! });
    viewRef.current = view;
    current = view;
    requestAnimationFrame(() => {
      if (saved) view.scrollDOM.scrollTop = saved.scrollTop;
      view.focus();
      report(view);
    });
    const scroll = () => onScrollRef.current?.(view);
    view.scrollDOM.addEventListener('scroll', scroll, { passive: true });
    return () => {
      view.scrollDOM.removeEventListener('scroll', scroll);
      liveBoxes.delete(box);
      if (useDocuments.getState().docs.some((d) => d.path === box.path)) states.set(box.path, { state: view.state, scrollTop: view.scrollDOM.scrollTop, box });
      if (current === view) current = null;
      view.destroy();
      viewRef.current = null;
      useEditorUi.setState({ format: null });
    };
    // the view is per document; text changes from outside are applied below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.path]);

  // the file changed on disk (reload) or the store's text moved on: replace the editor's text, as one undo step
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur !== doc.text) view.dispatch({ changes: { from: 0, to: cur.length, insert: doc.text }, userEvent: 'reload' });
  }, [doc.text]);

  // settings that change while editing
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const x = settingsExtensions(settings);
    view.dispatch({
      effects: [compartments.wrap.reconfigure(x.wrap), compartments.lineNumbers.reconfigure(x.lineNumbers), compartments.spellcheck.reconfigure(x.spellcheck), compartments.slash.reconfigure(x.slash)],
    });
  }, [settings.wordWrap, settings.lineNumbers, settings.spellcheck, settings.slashCommands]); // eslint-disable-line react-hooks/exhaustive-deps

  // jump to a line asked for by the preview
  useEffect(() => {
    const view = viewRef.current;
    if (!view || pendingLine === null) return;
    revealLine(view, pendingLine);
    useDocuments.setState({ pendingLine: null });
  }, [pendingLine]);

  return <div className="md-editor" ref={host} onFocus={() => viewRef.current && (current = viewRef.current)} />;
}
