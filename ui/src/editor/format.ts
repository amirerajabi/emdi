// Markdown editing commands on a CodeMirror view: inline marks (bold, italic…) that toggle, line kinds (headings,
// lists, tasks, quotes) that toggle and replace each other, blocks inserted on their own lines with the cursor (or a
// selected placeholder) where typing continues, and table helpers (insert, format, Tab between cells).
import { EditorSelection, type ChangeSpec, type EditorState, type SelectionRange } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

// ------------------------------------------------------------------ inline marks

/**
 * Wraps the selection in a mark, or unwraps it when it is wrapped already (inside or just outside the selection). An
 * empty selection inside a word wraps the word; elsewhere it inserts the pair with the cursor between.
 */
export function toggleInline(view: EditorView, open: string, close = open, placeholder = ''): boolean {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    let r = range;
    if (r.empty) {
      const word = state.wordAt(r.head);
      if (word && !placeholder) r = EditorSelection.range(word.from, word.to);
    }
    const text = state.sliceDoc(r.from, r.to);
    // **text** selected with its marks
    if (text.length >= open.length + close.length && text.startsWith(open) && text.endsWith(close)) {
      const inner = text.slice(open.length, text.length - close.length);
      return { changes: { from: r.from, to: r.to, insert: inner }, range: EditorSelection.range(r.from, r.from + inner.length) };
    }
    // marks right outside the selection
    const before = state.sliceDoc(r.from - open.length, r.from);
    const after = state.sliceDoc(r.to, r.to + close.length);
    if (before === open && after === close && !(open === '*' && state.sliceDoc(r.from - 2, r.from) === '**' && state.sliceDoc(r.to, r.to + 2) === '**')) {
      return {
        changes: [
          { from: r.from - open.length, to: r.from },
          { from: r.to, to: r.to + close.length },
        ],
        range: EditorSelection.range(r.from - open.length, r.to - open.length),
      };
    }
    if (r.empty) {
      const insert = open + placeholder + close;
      return { changes: { from: r.from, insert }, range: EditorSelection.range(r.from + open.length, r.from + open.length + placeholder.length) };
    }
    return {
      changes: [
        { from: r.from, insert: open },
        { from: r.to, insert: close },
      ],
      range: EditorSelection.range(r.from + open.length, r.to + open.length),
    };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
  view.focus();
  return true;
}

export const toggleBold = (v: EditorView) => toggleInline(v, '**');
export const toggleItalic = (v: EditorView) => toggleInline(v, '*');
export const toggleStrike = (v: EditorView) => toggleInline(v, '~~');
export const toggleHighlight = (v: EditorView) => toggleInline(v, '==');
export const toggleCode = (v: EditorView) => toggleInline(v, '`');
export const toggleSub = (v: EditorView) => toggleInline(v, '~');
export const toggleSup = (v: EditorView) => toggleInline(v, '^');

// ------------------------------------------------------------------ line kinds

export type LineKind = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'bullet' | 'ordered' | 'task' | 'quote';

/** Leading indentation, then a heading / list / task / quote marker. */
const PREFIX = /^(\s*)(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)?/;

export function lineKindOf(text: string): LineKind {
  const m = PREFIX.exec(text);
  const p = m?.[2] ?? '';
  if (/^#{1,6}\s/.test(p)) return `h${p.trim().length}` as LineKind;
  if (/\[[ xX]\]/.test(p)) return 'task';
  if (/^[-*+]/.test(p)) return 'bullet';
  if (/^\d/.test(p)) return 'ordered';
  if (p.startsWith('>')) return 'quote';
  return 'paragraph';
}

function selectedLines(state: EditorState, range: SelectionRange) {
  const lines = [];
  const first = state.doc.lineAt(range.from).number;
  const last = state.doc.lineAt(range.to > range.from && state.doc.lineAt(range.to).from === range.to ? range.to - 1 : range.to).number;
  for (let n = first; n <= last; n++) lines.push(state.doc.line(n));
  return lines;
}

/** Makes the selected lines a heading, list, task list or quote, or back to plain text when they are that already. */
export function setLineKind(view: EditorView, kind: LineKind): boolean {
  const { state } = view;
  const changes: ChangeSpec[] = [];
  for (const range of state.selection.ranges) {
    const lines = selectedLines(state, range).filter((l, i, all) => all.length === 1 || l.text.trim() || i === 0);
    const all = lines.every((l) => lineKindOf(l.text) === kind);
    const target = all && kind !== 'paragraph' ? 'paragraph' : kind;
    let n = 1;
    for (const line of lines) {
      const m = PREFIX.exec(line.text)!;
      const indent = m[1];
      const marker =
        target === 'paragraph'
          ? ''
          : target.startsWith('h')
            ? '#'.repeat(Number(target.slice(1))) + ' '
            : target === 'bullet'
              ? '- '
              : target === 'task'
                ? '- [ ] '
                : target === 'ordered'
                  ? `${n++}. `
                  : '> ';
      // headings never keep an indent
      const from = line.from + (target.startsWith('h') ? 0 : indent.length);
      changes.push({ from, to: line.from + m[0].length, insert: marker });
    }
  }
  view.dispatch({ changes, scrollIntoView: true, userEvent: 'input.format' });
  view.focus();
  return true;
}

/** Checks or unchecks the task on the cursor's line. */
export function toggleTaskDone(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const m = /^(\s*[-*+]\s+\[)([ xX])(\])/.exec(line.text);
  if (!m) return false;
  const at = line.from + m[1].length;
  view.dispatch({ changes: { from: at, to: at + 1, insert: m[2] === ' ' ? 'x' : ' ' }, userEvent: 'input.format' });
  return true;
}

// ------------------------------------------------------------------ blocks

/**
 * Inserts a block on its own lines (a blank line before and after it, where the text needs one). In the template
 * `$|` is the cursor and `${placeholder}` text that is selected so typing replaces it; `$SEL` takes the selection.
 */
export function insertBlock(view: EditorView, template: string): boolean {
  const { state } = view;
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to);
  let body = template.replace('$SEL', selected);
  const lineFrom = state.doc.lineAt(range.from);
  let lineTo = state.doc.lineAt(range.to);
  const replaceLine = !lineFrom.text.trim() && lineFrom.number === lineTo.number;
  // in a paragraph, table or list: after the whole of it, not between its lines
  if (!replaceLine && !selected) while (lineTo.number < state.doc.lines && state.doc.line(lineTo.number + 1).text.trim()) lineTo = state.doc.line(lineTo.number + 1);
  const from = replaceLine ? lineFrom.from : selected ? range.from : lineTo.to;
  const to = replaceLine ? lineFrom.to : selected ? range.to : lineTo.to;
  const textBefore = state.sliceDoc(0, from);
  const textAfter = state.sliceDoc(to);
  const lead = !textBefore ? '' : textBefore.endsWith('\n\n') ? '' : textBefore.endsWith('\n') ? '\n' : '\n\n';
  const trail = !textAfter ? '\n' : textAfter.startsWith('\n\n') ? '' : textAfter.startsWith('\n') ? '\n' : '\n\n';
  // cursor / placeholder
  let selFrom = -1;
  let selTo = -1;
  const ph = /\$\{([^}]*)\}|\$\|/.exec(body);
  if (ph) {
    selFrom = ph.index;
    body = body.slice(0, ph.index) + (ph[1] ?? '') + body.slice(ph.index + ph[0].length);
    selTo = selFrom + (ph[1]?.length ?? 0);
  }
  const insert = lead + body + trail;
  const base = from + lead.length;
  const anchor = selFrom >= 0 ? base + selFrom : base + body.length;
  const head = selFrom >= 0 ? base + selTo : anchor;
  view.dispatch({ changes: { from, to, insert }, selection: EditorSelection.range(anchor, head), scrollIntoView: true, userEvent: 'input.insert' });
  view.focus();
  return true;
}

/** Inserts inline text at the cursor (replacing the selection); `$|` / `${…}` / `$SEL` as in insertBlock. */
export function insertInline(view: EditorView, template: string): boolean {
  const { state } = view;
  const r = state.selection.main;
  let body = template.replace('$SEL', state.sliceDoc(r.from, r.to));
  let a = -1;
  let b = -1;
  const ph = /\$\{([^}]*)\}|\$\|/.exec(body);
  if (ph) {
    a = ph.index;
    body = body.slice(0, ph.index) + (ph[1] ?? '') + body.slice(ph.index + ph[0].length);
    b = a + (ph[1]?.length ?? 0);
  }
  const anchor = r.from + (a >= 0 ? a : body.length);
  view.dispatch({ changes: { from: r.from, to: r.to, insert: body }, selection: EditorSelection.range(anchor, a >= 0 ? r.from + b : anchor), scrollIntoView: true, userEvent: 'input.insert' });
  view.focus();
  return true;
}

const URL_LIKE = /^(https?:\/\/|mailto:|www\.)\S+$/i;

/** [text](url): the selection becomes the text (or the URL when it is one), and the part still to fill is selected. */
export function insertLink(view: EditorView, url?: string): boolean {
  const { state } = view;
  const r = state.selection.main;
  const sel = state.sliceDoc(r.from, r.to);
  if (url) return insertInline(view, `[\${${sel || 'text'}}](${url})`);
  if (URL_LIKE.test(sel.trim())) return insertInline(view, `[\${text}](${sel.trim()})`);
  return insertInline(view, sel ? `[${sel}](\${https://})` : '[${text}](https://)');
}

/** A link target as Markdown writes it: <…> around paths with spaces, forward slashes. */
export function linkTarget(path: string): string {
  const p = path.replace(/\\/g, '/');
  return /[\s()<>]/.test(p) ? `<${p}>` : p;
}

export function insertImage(view: EditorView, src = 'https://', alt = 'image'): boolean {
  return insertInline(view, `![\${${alt}}](${linkTarget(src)})`);
}

export function tableTemplate(rows: number, cols: number): string {
  const header = Array.from({ length: cols }, (_, i) => (i === 0 ? '${Column 1}' : `Column ${i + 1}`));
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  const sep = `| ${Array.from({ length: cols }, () => '--------').join(' | ')} |`;
  const body = Array.from({ length: rows }, () => line(Array.from({ length: cols }, () => '        ')));
  return [line(header), sep, ...body].join('\n');
}

export const insertTable = (view: EditorView, rows: number, cols: number) => insertBlock(view, tableTemplate(rows, cols));

/** A footnote: the reference at the cursor and its text at the end of the document, where typing continues. */
export function insertFootnote(view: EditorView): boolean {
  const { state } = view;
  const used = [...state.doc.toString().matchAll(/\[\^(\d+)\]/g)].map((m) => Number(m[1]));
  const n = used.length ? Math.max(...used) + 1 : 1;
  const r = state.selection.main;
  const end = state.doc.length;
  const tail = state.doc.toString();
  const lead = tail.endsWith('\n\n') ? '' : tail.endsWith('\n') ? '\n' : '\n\n';
  const def = `${lead}[^${n}]: `;
  const refLen = `[^${n}]`.length;
  view.dispatch({
    changes: [
      { from: r.to, insert: `[^${n}]` },
      { from: end, insert: def },
    ],
    selection: EditorSelection.cursor(end + refLen + def.length),
    scrollIntoView: true,
    userEvent: 'input.insert',
  });
  view.focus();
  return true;
}

// ------------------------------------------------------------------ tables

interface TableAt {
  from: number;
  to: number;
  lines: { from: number; text: string }[];
}

const isRow = (t: string) => /^\s*\|.*\|\s*$/.test(t) || (t.includes('|') && /^\s*\S/.test(t) && !/^\s*```/.test(t));
const isSep = (t: string) => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(t);

function tableAt(state: EditorState, pos: number): TableAt | null {
  const line = state.doc.lineAt(pos);
  if (!isRow(line.text)) return null;
  let a = line.number;
  let b = line.number;
  while (a > 1 && isRow(state.doc.line(a - 1).text)) a--;
  while (b < state.doc.lines && isRow(state.doc.line(b + 1).text)) b++;
  const lines = [];
  for (let n = a; n <= b; n++) lines.push({ from: state.doc.line(n).from, text: state.doc.line(n).text });
  if (lines.length < 2 || !isSep(lines[1].text)) return null;
  return { from: state.doc.line(a).from, to: state.doc.line(b).to, lines };
}

function splitRow(t: string): string[] {
  let s = t.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim());
}

/** Lines the table at the cursor up: every column as wide as its widest cell, alignment colons kept. */
export function formatTable(view: EditorView): boolean {
  const t = tableAt(view.state, view.state.selection.main.head);
  if (!t) return false;
  const rows = t.lines.map((l) => splitRow(l.text));
  const cols = Math.max(...rows.map((r) => r.length));
  const align = rows[1].map((c) => (c.startsWith(':') && c.endsWith(':') ? 'c' : c.endsWith(':') ? 'r' : c.startsWith(':') ? 'l' : ''));
  const width = Array.from({ length: cols }, (_, i) => Math.max(3, ...rows.filter((_, k) => k !== 1).map((r) => [...(r[i] ?? '')].length)));
  const pad = (s: string, w: number, a: string) => {
    const gap = w - [...s].length;
    if (a === 'r') return ' '.repeat(gap) + s;
    if (a === 'c') return ' '.repeat(Math.floor(gap / 2)) + s + ' '.repeat(Math.ceil(gap / 2));
    return s + ' '.repeat(gap);
  };
  const out = rows.map((r, k) => {
    if (k === 1) return `| ${width.map((w, i) => (align[i] === 'c' ? ':' + '-'.repeat(w - 2) + ':' : align[i] === 'r' ? '-'.repeat(w - 1) + ':' : align[i] === 'l' ? ':' + '-'.repeat(w - 1) : '-'.repeat(w))).join(' | ')} |`;
    return `| ${width.map((w, i) => pad(r[i] ?? '', w, align[i] ?? '')).join(' | ')} |`;
  });
  const text = out.join('\n');
  if (text === view.state.sliceDoc(t.from, t.to)) return true;
  // keep the cursor in the same cell
  const head = view.state.selection.main.head;
  const lineIdx = view.state.doc.lineAt(head).number - view.state.doc.lineAt(t.from).number;
  const cell = view.state.sliceDoc(t.lines[lineIdx].from, head).split(/(?<!\\)\|/).length - 1;
  let pos = t.from;
  for (let k = 0; k < lineIdx; k++) pos += out[k].length + 1;
  const cellStart = nthCellStart(out[lineIdx], Math.max(1, cell));
  view.dispatch({ changes: { from: t.from, to: t.to, insert: text }, selection: EditorSelection.cursor(pos + cellStart), userEvent: 'input.format' });
  return true;
}

function nthCellStart(row: string, n: number): number {
  let seen = 0;
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '|' && row[i - 1] !== '\\') {
      seen++;
      if (seen === n) return Math.min(row.length, i + 2);
    }
  }
  return row.length;
}

/** Tab / Shift+Tab in a table: the next / previous cell, selected (a new row after the last cell). */
export function moveCell(view: EditorView, dir: 1 | -1): boolean {
  const { state } = view;
  const head = state.selection.main.head;
  const t = tableAt(state, head);
  if (!t) return false;
  // each cell: the span between its bars, and its content (what Tab selects)
  const cells: { start: number; end: number; from: number; to: number }[] = [];
  t.lines.forEach((l, row) => {
    if (row === 1) return;
    const bars: number[] = [];
    for (let i = 0; i < l.text.length; i++) if (l.text[i] === '|' && l.text[i - 1] !== '\\') bars.push(i);
    for (let k = 0; k + 1 < bars.length; k++) {
      const raw = l.text.slice(bars[k] + 1, bars[k + 1]);
      const lead = raw.length - raw.trimStart().length;
      const content = raw.trim();
      const from = l.from + bars[k] + 1 + (content ? lead : Math.min(1, raw.length));
      cells.push({ start: l.from + bars[k] + 1, end: l.from + bars[k + 1], from, to: from + content.length });
    }
  });
  const cur = cells.findIndex((c) => head >= c.start && head <= c.end);
  const next = cells[cur + dir];
  if (!next) {
    if (dir < 0) return true;
    // after the last cell: a new empty row
    const cols = splitRow(t.lines[0].text).length;
    const row = `\n| ${Array.from({ length: cols }, () => '   ').join(' | ')} |`;
    view.dispatch({ changes: { from: t.to, insert: row }, selection: EditorSelection.cursor(t.to + 3), scrollIntoView: true });
    return true;
  }
  view.dispatch({ selection: EditorSelection.range(next.from, next.to), scrollIntoView: true });
  return true;
}

// ------------------------------------------------------------------ what the cursor is in (toolbar state)

export interface FormatState {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  highlight: boolean;
  link: boolean;
  line: LineKind;
}

/** Marks around the cursor, read from the text of its line (fast, and right for the toolbar's on/off states). */
export function formatAt(state: EditorState): FormatState {
  const r = state.selection.main;
  const line = state.doc.lineAt(r.head);
  const before = line.text.slice(0, r.from - line.from);
  const after = line.text.slice(r.to - line.from);
  const inside = (open: string, close = open) => {
    const sel = state.sliceDoc(r.from, r.to);
    if (sel.startsWith(open) && sel.endsWith(close) && sel.length >= open.length + close.length) return true;
    const count = (s: string) => s.split(open).length - 1;
    return count(before) % 2 === 1 && after.includes(close);
  };
  const bold = inside('**') || inside('__');
  const beforeNoBold = before.replace(/\*\*/g, '');
  const afterNoBold = after.replace(/\*\*/g, '');
  const italic = ((beforeNoBold.split('*').length - 1) % 2 === 1 && afterNoBold.includes('*')) || inside('_');
  return {
    bold,
    italic,
    strike: inside('~~'),
    code: inside('`'),
    highlight: inside('=='),
    link: /\[[^\]]*$/.test(before) || /\]\([^)]*$/.test(before),
    line: lineKindOf(line.text),
  };
}
