// Split mode: the editor and the preview scroll together. Every rendered block carries its source line (data-line),
// so a position in one maps to the other by interpolating between the blocks around it. The side the user is using
// (wheel, keys, pointer) leads; the other one follows and its own scroll events are ignored.
import type { EditorView } from '@codemirror/view';

interface Anchor {
  line: number;
  top: number;
}

/** The preview's blocks: source line → offset in its scroll container, both increasing. */
function anchors(scroller: HTMLElement): Anchor[] {
  const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
  const out: Anchor[] = [{ line: 0, top: 0 }];
  for (const el of scroller.querySelectorAll<HTMLElement>('.markdown-body [data-line]')) {
    const line = Number(el.dataset.line);
    const top = el.getBoundingClientRect().top - base;
    const last = out[out.length - 1];
    if (line > last.line && top >= last.top) out.push({ line, top });
  }
  out.push({ line: Number.MAX_SAFE_INTEGER / 2, top: scroller.scrollHeight });
  return out;
}

/** The (fractional) source line at the top of the editor. */
function editorTopLine(view: EditorView): number {
  const height = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
  const block = view.lineBlockAtHeight(Math.max(0, height));
  const line = view.state.doc.lineAt(block.from).number - 1;
  return line + Math.min(1, Math.max(0, (height - block.top) / Math.max(1, block.height)));
}

export function editorToPreview(view: EditorView, scroller: HTMLElement): void {
  const line = editorTopLine(view);
  const a = anchors(scroller);
  let i = 0;
  while (i + 1 < a.length && a[i + 1].line <= line) i++;
  const from = a[i];
  const to = a[i + 1] ?? from;
  const frac = to.line > from.line ? (line - from.line) / (to.line - from.line) : 0;
  scroller.scrollTop = from.top + (to.top - from.top) * Math.min(1, frac);
}

export function previewToEditor(scroller: HTMLElement, view: EditorView): void {
  const a = anchors(scroller);
  const y = scroller.scrollTop;
  let i = 0;
  while (i + 1 < a.length && a[i + 1].top <= y) i++;
  const from = a[i];
  const to = a[i + 1] ?? from;
  const lines = view.state.doc.lines;
  const line = Math.min(lines - 1, from.line + (to.top > from.top ? ((y - from.top) / (to.top - from.top)) * (Math.min(to.line, lines) - from.line) : 0));
  const whole = Math.floor(line);
  const block = view.lineBlockAt(view.state.doc.line(whole + 1).from);
  const offset = view.documentTop - view.scrollDOM.getBoundingClientRect().top + view.scrollDOM.scrollTop;
  view.scrollDOM.scrollTop = block.top + (line - whole) * block.height + offset;
}
