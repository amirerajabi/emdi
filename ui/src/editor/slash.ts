// The / menu: typing / at the start of a line or after a space lists every block the editor can insert (EDITOR_ITEMS),
// grouped, with icons and keys, filtered as you type ("/tab" → Table). Enter inserts it in place of the "/…" text.
import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fuzzy } from '../lib/fuzzy';
import { EDITOR_ITEMS, type EditorItem } from './items';
import { keyText } from './keys';

const GROUP_ORDER = ['Headings', 'Lists', 'Blocks', 'Alerts', 'Media', 'Diagrams', 'Advanced', 'Text'];
const SLASH_ITEMS = EDITOR_ITEMS.filter((i) => i.slash);
const iconCache = new Map<string, string>();

function iconOf(item: EditorItem): string {
  let svg = iconCache.get(item.id);
  if (!svg) {
    svg = renderToStaticMarkup(createElement(item.Icon, { size: 16, strokeWidth: 1.8 }));
    iconCache.set(item.id, svg);
  }
  return svg;
}

const IN_CODE = new Set(['FencedCode', 'CodeBlock', 'InlineCode', 'CodeText', 'HTMLBlock', 'CommentBlock']);

function slashSource(ctx: CompletionContext): CompletionResult | null {
  const m = ctx.matchBefore(/(?:^|\s)\/[\p{L}\p{N}-]*$/u);
  if (!m) return null;
  for (let n: SyntaxNode | null = syntaxTree(ctx.state).resolveInner(ctx.pos, -1); n; n = n.parent) if (IN_CODE.has(n.name)) return null;
  const from = m.from + m.text.lastIndexOf('/');
  const query = ctx.state.sliceDoc(from + 1, ctx.pos);
  const scored = SLASH_ITEMS.map((item) => {
    const byTitle = fuzzy(query, item.title);
    const byWords = byTitle ? null : fuzzy(query, item.keywords ?? '');
    return { item, score: byTitle ? byTitle.score + 20 : byWords ? byWords.score : null };
  }).filter((x) => x.score !== null);
  if (!scored.length) return null;
  if (query) scored.sort((a, b) => b.score! - a.score!);
  else scored.sort((a, b) => GROUP_ORDER.indexOf(a.item.group) - GROUP_ORDER.indexOf(b.item.group));
  const options: Completion[] = scored.map(({ item }, i) => ({
    label: item.title,
    detail: item.key ? keyText(item.key) : undefined,
    type: item.id,
    boost: -i,
    section: query ? undefined : { name: item.group, rank: GROUP_ORDER.indexOf(item.group) },
    apply: (view, _c, a, b) => {
      view.dispatch({ changes: { from: a, to: b, insert: '' } });
      void item.run(view);
    },
  }));
  return { from, options, filter: false };
}

export const slashMenu = () =>
  autocompletion({
    override: [slashSource],
    icons: false,
    maxRenderedOptions: 80,
    closeOnBlur: true,
    tooltipClass: () => 'folio-slash',
    addToOptions: [
      {
        position: 20,
        render: (c) => {
          const item = SLASH_ITEMS.find((i) => i.id === c.type);
          const el = document.createElement('span');
          el.className = 'folio-slash-icon';
          if (item) el.innerHTML = iconOf(item);
          return el;
        },
      },
    ],
  });
