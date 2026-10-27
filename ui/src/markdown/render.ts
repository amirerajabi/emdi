// Markdown → HTML: markdown-it with GitHub's extensions (tables, task lists, footnotes, alerts, emoji), math (KaTeX),
// highlighted code blocks and mermaid placeholders. Headings get unique ids (GitHub's slugs) and every block carries its
// source line (data-line) and its direction, from the script most of its letters are in, so Persian, Arabic and Hebrew
// read right-to-left, lists and tables included. The HTML is sanitised.
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import MarkdownIt, { type MarkdownIt as Md, type Token } from 'markdown-it';
import katexModule from '@vscode/markdown-it-katex';
import deflist from 'markdown-it-deflist';
import { full as emoji } from 'markdown-it-emoji';
import footnote from 'markdown-it-footnote';
import frontMatter from 'markdown-it-front-matter';
import alerts from 'markdown-it-github-alerts';
import mark from 'markdown-it-mark';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import taskLists from 'markdown-it-task-lists';
import type { Settings } from '../store/settings';

export interface Heading {
  level: number;
  text: string;
  id: string;
  /** Source line (0-based). */
  line: number;
}

export interface Rendered {
  html: string;
  headings: Heading[];
  frontMatter: [string, string][] | null;
  /** The document's main direction (the page layout follows it; each block also has its own). */
  dir: 'rtl' | 'ltr';
}

export interface DocStats {
  words: number;
  chars: number;
  lines: number;
  /** Minutes at 230 words a minute. */
  minutes: number;
}

type RenderOptions = Pick<Settings, 'typographer' | 'breaks' | 'linkify' | 'math'>;

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** GitHub's heading anchors: lower case, punctuation dropped, spaces to dashes; letters of every script are kept. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

let cached: { key: string; md: Md; fm: { value: string | null } } | null = null;

function instance(o: RenderOptions) {
  const key = JSON.stringify(o);
  if (cached?.key === key) return cached;
  const fm = { value: null as string | null };
  const md = new MarkdownIt({ html: true, linkify: o.linkify, typographer: o.typographer, breaks: o.breaks });
  md.use(footnote)
    .use(taskLists, { enabled: false, label: true })
    .use(frontMatter, (v: string) => (fm.value = v))
    .use(alerts)
    .use(mark)
    .use(sub)
    .use(sup)
    .use(deflist)
    .use(emoji);
  // the package is CommonJS with an __esModule default: the plugin is .default under some bundlers
  const katexPlugin = (katexModule as unknown as { default?: unknown }).default ?? katexModule;
  if (o.math) md.use(katexPlugin as unknown as (md: Md, o: object) => void, { throwOnError: false, enableMathBlockInHtml: true });

  // fenced code: a header with the language and a copy button; mermaid becomes a diagram placeholder
  md.renderer.rules.fence = (tokens, idx) => {
    const t = tokens[idx];
    const lang = t.info.trim().split(/\s+/)[0] ?? '';
    const line = t.map ? ` data-line="${t.map[0]}"` : '';
    if (lang.toLowerCase() === 'mermaid') return `<div class="md-mermaid"${line}><pre class="md-mermaid-src">${escapeHtml(t.content)}</pre></div>\n`;
    let body: string;
    const known = lang && hljs.getLanguage(lang);
    try {
      body = known ? hljs.highlight(t.content, { language: lang, ignoreIllegals: true }).value : t.content.length < 20000 && !lang ? hljs.highlightAuto(t.content).value : escapeHtml(t.content);
    } catch {
      body = escapeHtml(t.content);
    }
    const label = lang || '';
    return `<div class="md-code"${line}><div class="md-code-head"><span class="md-code-lang">${escapeHtml(label)}</span><button type="button" class="md-code-copy" data-copy aria-label="Copy code">Copy</button></div><pre><code class="hljs${known ? ` language-${escapeHtml(lang)}` : ''}">${body}</code></pre></div>\n`;
  };
  // tables scroll sideways instead of widening the page
  md.renderer.rules.table_open = (tokens, idx, opts, _env, self) => `<div class="md-table-wrap">${self.renderToken(tokens, idx, opts)}`;
  md.renderer.rules.table_close = (tokens, idx, opts, _env, self) => `${self.renderToken(tokens, idx, opts)}</div>`;

  // alerts are rendered by the plugin from meta only: carry their direction into the <div>
  const alertOpen = md.renderer.rules.alert_open;
  if (alertOpen) {
    md.renderer.rules.alert_open = (tokens, idx, opts, env, self) => {
      const dir = tokens[idx].attrGet('dir');
      const html = alertOpen(tokens, idx, opts, env, self);
      return dir ? html.replace(/^<div /, `<div dir="${dir}" `) : html;
    };
  }

  // heading ids, source lines and every block's direction
  md.core.ruler.push('emdi_blocks', (state) => {
    const used = new Map<string, number>();
    const headings: Heading[] = [];
    const tokens = state.tokens;
    // the open blocks around the current token, each counting the letters of its text by direction
    const open: { token: Token; counts: Counts }[] = [];
    // the page's direction follows how the document opens: its title and first lines (DOC_DIR_LETTERS)
    const doc: Counts = { rtl: 0, ltr: 0 };
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.map && t.nesting === 1 && t.block) t.attrSet('data-line', String(t.map[0]));
      if (t.block && t.nesting === 1) open.push({ token: t, counts: { rtl: 0, ltr: 0 } });
      else if (t.block && t.nesting === -1) {
        const b = open.pop();
        const dir = b && DIR_BLOCKS.has(b.token.type) ? dirOf(b.counts) : undefined;
        if (b && dir) b.token.attrSet('dir', dir);
      } else if (t.type === 'inline') {
        const text = inlineText(t, false);
        const c = countLetters(text);
        for (const b of open) addCounts(b.counts, c);
        const left = DOC_DIR_LETTERS - doc.rtl - doc.ltr;
        if (left > 0) addCounts(doc, countLetters(text, left));
      }
      if (t.type === 'heading_open') {
        const inline = tokens[i + 1];
        const text = inlineText(inline);
        const base = slugify(text) || 'section';
        const n = used.get(base) ?? 0;
        used.set(base, n + 1);
        const id = n ? `${base}-${n}` : base;
        t.attrSet('id', id);
        headings.push({ level: Number(t.tag.slice(1)), text, id, line: t.map?.[0] ?? 0 });
      }
    }
    state.env.headings = headings;
    state.env.dir = dirOf(doc) ?? 'ltr';
  });
  cached = { key, md, fm };
  return cached;
}

/** The visible text of an inline token; without code when it only decides the direction (code is always LTR). */
function inlineText(t: Token | undefined, withCode = true): string {
  if (!t?.children) return t?.content ?? '';
  return t.children.map((c) => (c.type === 'text' || c.type === 'emoji' || (withCode && c.type === 'code_inline') ? c.content : c.children ? inlineText(c, withCode) : '')).join('');
}

// ------------------------------------------------------------------ direction

interface Counts {
  rtl: number;
  ltr: number;
}

/** Letters of the right-to-left scripts (Hebrew, Arabic and Persian, Syriac, Thaana, N'Ko…). */
const RTL_LETTER = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}]/u;
const LETTER = /\p{L}/gu;

/** Blocks that take a direction; the plugin-rendered ones (footnotes) and table rows inherit theirs. */
const DIR_BLOCKS = new Set([
  'paragraph_open', 'heading_open', 'blockquote_open', 'alert_open', 'bullet_list_open', 'ordered_list_open', 'list_item_open',
  'table_open', 'th_open', 'td_open', 'dl_open', 'dt_open', 'dd_open',
]);

/** How many letters from the start of a document decide its direction: the title and the start of the first line. */
const DOC_DIR_LETTERS = 40;

function countLetters(text: string, limit = Infinity): Counts {
  const c = { rtl: 0, ltr: 0 };
  for (const m of text.matchAll(LETTER)) {
    if (c.rtl + c.ltr >= limit) break;
    if (RTL_LETTER.test(m[0])) c.rtl++;
    else c.ltr++;
  }
  return c;
}

function addCounts(to: Counts, c: Counts): void {
  to.rtl += c.rtl;
  to.ltr += c.ltr;
}

/**
 * Right-to-left when at least 40% of the letters are in a right-to-left script: a Persian sentence that starts with an
 * English word ("React یک کتابخانه است") stays right-to-left, which dir="auto" (first letter wins) gets wrong.
 * No letters at all: no direction (the block follows its parent).
 */
function dirOf(c: Counts): 'rtl' | 'ltr' | undefined {
  const all = c.rtl + c.ltr;
  if (!all) return undefined;
  return c.rtl / all >= 0.4 ? 'rtl' : 'ltr';
}

/** The direction of a piece of text (a heading in the outline, a file name, a search hit). */
export function textDir(text: string): 'rtl' | 'ltr' | undefined {
  return dirOf(countLetters(text));
}

/** Simple `key: value` front matter as rows (nested YAML is shown as written). */
function parseFrontMatter(yaml: string): [string, string][] {
  const rows: [string, string][] = [];
  for (const line of yaml.split(/\r?\n/)) {
    const m = /^([\w.-]+)\s*:\s*(.*)$/.exec(line);
    if (m) rows.push([m[1], m[2].replace(/^['"]|['"]$/g, '')]);
    else if (rows.length && line.trim()) rows[rows.length - 1][1] += (rows[rows.length - 1][1] ? '\n' : '') + line.trim();
  }
  return rows;
}

export function renderMarkdown(text: string, o: RenderOptions): Rendered {
  const { md, fm } = instance(o);
  fm.value = null;
  const env: { headings?: Heading[]; dir?: 'rtl' | 'ltr' } = {};
  const raw = md.render(text, env);
  const html = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true, svg: true, mathMl: true },
    ADD_ATTR: ['target', 'aria-hidden', 'dir', 'start', 'checked', 'disabled'],
    FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed'],
  });
  return { html, headings: env.headings ?? [], frontMatter: fm.value ? parseFrontMatter(fm.value) : null, dir: env.dir ?? 'ltr' };
}

export function docStats(text: string): DocStats {
  const body = text
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ');
  const words = body.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
  return { words, chars: text.length, lines: text ? text.split('\n').length : 0, minutes: Math.max(1, Math.round(words / 230)) };
}
