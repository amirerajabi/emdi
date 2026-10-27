// Everything the editor can insert or format, in one list: the toolbar, the / menu, the editor's keys and the command
// palette ("Insert: Table") all read it, so a new item shows up everywhere.
import type { EditorView } from '@codemirror/view';
import {
  AlertTriangle,
  Bold,
  CalendarClock,
  ChevronRightSquare,
  Code,
  CodeXml,
  FileCode2,
  Footprints,
  GitBranch,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Highlighter,
  Image,
  ImagePlus,
  Info,
  Italic,
  Lightbulb,
  Link,
  List,
  ListChecks,
  ListOrdered,
  ListTree,
  MessageSquareWarning,
  Minus,
  OctagonAlert,
  Pilcrow,
  Quote,
  Sigma,
  SquareFunction,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  type LucideIcon,
} from 'lucide-react';
import { slugify } from '../markdown/render';
import { platform } from '../platform';
import { activeDoc } from '../store/documents';
import { dirname, relativePath } from '../lib/paths';
import {
  insertBlock,
  insertFootnote,
  insertImage,
  insertInline,
  insertLink,
  insertTable,
  linkTarget,
  setLineKind,
  toggleBold,
  toggleCode,
  toggleHighlight,
  toggleItalic,
  toggleStrike,
  toggleSub,
  toggleSup,
} from './format';

export type ItemGroup = 'Text' | 'Headings' | 'Lists' | 'Blocks' | 'Alerts' | 'Media' | 'Diagrams' | 'Advanced';

export interface EditorItem {
  id: string;
  title: string;
  group: ItemGroup;
  Icon: LucideIcon;
  /** CodeMirror key (Mod = Ctrl / ⌘). */
  key?: string;
  /** More words the / menu and the palette match. */
  keywords?: string;
  /** In the / menu (formatting marks are not: they act on a selection). */
  slash?: boolean;
  run(view: EditorView): boolean | Promise<boolean>;
}

const alert = (kind: string, text: string) => (v: EditorView) => insertBlock(v, `> [!${kind}]\n> \${${text}}`);
const block = (template: string) => (v: EditorView) => insertBlock(v, template);

/** Common code block languages (the toolbar's code menu). */
export const CODE_LANGUAGES: [string, string][] = [
  ['', 'Plain text'],
  ['bash', 'Bash'],
  ['powershell', 'PowerShell'],
  ['js', 'JavaScript'],
  ['ts', 'TypeScript'],
  ['jsx', 'JSX'],
  ['tsx', 'TSX'],
  ['json', 'JSON'],
  ['yaml', 'YAML'],
  ['html', 'HTML'],
  ['css', 'CSS'],
  ['csharp', 'C#'],
  ['java', 'Java'],
  ['kotlin', 'Kotlin'],
  ['python', 'Python'],
  ['go', 'Go'],
  ['rust', 'Rust'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['php', 'PHP'],
  ['ruby', 'Ruby'],
  ['swift', 'Swift'],
  ['sql', 'SQL'],
  ['xml', 'XML'],
  ['dockerfile', 'Dockerfile'],
  ['diff', 'Diff'],
  ['markdown', 'Markdown'],
];

export const codeBlock = (lang: string) => block(`\`\`\`${lang}\n$SEL$|\n\`\`\``);

export const MERMAID_TEMPLATES: [string, string, string][] = [
  ['flowchart', 'Flowchart', 'flowchart LR\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Do it]\n  B -->|No| D[Skip]'],
  ['sequence', 'Sequence diagram', 'sequenceDiagram\n  participant A as Alice\n  participant B as Bob\n  A->>B: Hello Bob\n  B-->>A: Hi Alice'],
  ['class', 'Class diagram', 'classDiagram\n  class Animal {\n    +String name\n    +speak()\n  }\n  Animal <|-- Dog'],
  ['state', 'State diagram', 'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Review\n  Review --> Published\n  Published --> [*]'],
  ['er', 'Entity relationship', 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains'],
  ['gantt', 'Gantt chart', 'gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section Work\n  Design :a1, 2026-01-01, 7d\n  Build  :after a1, 14d'],
  ['pie', 'Pie chart', 'pie title Share\n  "A" : 40\n  "B" : 35\n  "C" : 25'],
  ['mindmap', 'Mind map', 'mindmap\n  root((Topic))\n    Idea one\n    Idea two\n      Detail'],
  ['timeline', 'Timeline', 'timeline\n  title History\n  2024 : Started\n  2025 : Grew\n  2026 : Shipped'],
];

export const mermaid = (template: string) => block(`\`\`\`mermaid\n\${${template}}\n\`\`\``);

/** A picked image file as a link, relative to the document when it has a folder. */
export async function pickImage(view: EditorView): Promise<boolean> {
  const files = await platform.pickFiles('Insert image', [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'bmp'] }]);
  if (!files?.length) return false;
  const doc = activeDoc();
  const base = doc && !doc.untitled ? dirname(doc.path) : null;
  const links = files.map((f) => `![](${linkTarget(base ? relativePath(base, f) : f)})`).join('\n');
  return insertInline(view, links);
}

/** A list of links to the document's headings (a table of contents), where the cursor is. */
function insertToc(view: EditorView): boolean {
  const heads = [...view.state.doc.toString().matchAll(/^(#{1,6})\s+(.+?)\s*#*\s*$/gm)].map((m) => ({ level: m[1].length, text: m[2] }));
  if (!heads.length) return insertBlock(view, '- [${Heading}](#heading)');
  const top = Math.min(...heads.map((h) => h.level));
  const used = new Map<string, number>();
  const lines = heads.map((h) => {
    const base = slugify(h.text.replace(/[*_`~]/g, ''));
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return `${'  '.repeat(h.level - top)}- [${h.text}](#${n ? `${base}-${n}` : base})`;
  });
  return insertBlock(view, lines.join('\n'));
}

function frontMatter(view: EditorView): boolean {
  if (view.state.doc.toString().startsWith('---\n')) return false;
  view.dispatch({ changes: { from: 0, insert: '---\ntitle: \ntags: \n---\n\n' }, selection: { anchor: 11 }, scrollIntoView: true });
  view.focus();
  return true;
}

const now = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const EDITOR_ITEMS: EditorItem[] = [
  // text marks
  { id: 'bold', title: 'Bold', group: 'Text', Icon: Bold, key: 'Mod-b', keywords: 'strong', run: toggleBold },
  { id: 'italic', title: 'Italic', group: 'Text', Icon: Italic, key: 'Mod-i', keywords: 'emphasis', run: toggleItalic },
  { id: 'strike', title: 'Strikethrough', group: 'Text', Icon: Strikethrough, key: 'Mod-Shift-x', keywords: 'delete', run: toggleStrike },
  { id: 'highlight', title: 'Highlight', group: 'Text', Icon: Highlighter, key: 'Mod-Shift-h', keywords: 'mark', run: toggleHighlight },
  { id: 'code', title: 'Inline code', group: 'Text', Icon: Code, key: 'Mod-e', keywords: 'monospace', run: toggleCode },
  { id: 'sub', title: 'Subscript', group: 'Text', Icon: Subscript, run: toggleSub },
  { id: 'sup', title: 'Superscript', group: 'Text', Icon: Superscript, run: toggleSup },
  { id: 'link', title: 'Link', group: 'Media', Icon: Link, key: 'Mod-k', keywords: 'url href', slash: true, run: (v) => insertLink(v) },
  // headings
  { id: 'paragraph', title: 'Text', group: 'Headings', Icon: Pilcrow, key: 'Mod-0', keywords: 'paragraph normal plain', slash: true, run: (v) => setLineKind(v, 'paragraph') },
  { id: 'h1', title: 'Heading 1', group: 'Headings', Icon: Heading1, key: 'Mod-1', keywords: 'title h1', slash: true, run: (v) => setLineKind(v, 'h1') },
  { id: 'h2', title: 'Heading 2', group: 'Headings', Icon: Heading2, key: 'Mod-2', keywords: 'h2 section', slash: true, run: (v) => setLineKind(v, 'h2') },
  { id: 'h3', title: 'Heading 3', group: 'Headings', Icon: Heading3, key: 'Mod-3', keywords: 'h3', slash: true, run: (v) => setLineKind(v, 'h3') },
  { id: 'h4', title: 'Heading 4', group: 'Headings', Icon: Heading4, key: 'Mod-4', keywords: 'h4', slash: true, run: (v) => setLineKind(v, 'h4') },
  { id: 'h5', title: 'Heading 5', group: 'Headings', Icon: Heading5, key: 'Mod-5', keywords: 'h5', run: (v) => setLineKind(v, 'h5') },
  { id: 'h6', title: 'Heading 6', group: 'Headings', Icon: Heading6, key: 'Mod-6', keywords: 'h6', run: (v) => setLineKind(v, 'h6') },
  // lists
  { id: 'bullet', title: 'Bulleted list', group: 'Lists', Icon: List, key: 'Mod-Shift-8', keywords: 'ul unordered bullets', slash: true, run: (v) => setLineKind(v, 'bullet') },
  { id: 'ordered', title: 'Numbered list', group: 'Lists', Icon: ListOrdered, key: 'Mod-Shift-7', keywords: 'ol ordered numbers', slash: true, run: (v) => setLineKind(v, 'ordered') },
  { id: 'task', title: 'Task list', group: 'Lists', Icon: ListChecks, key: 'Mod-Shift-9', keywords: 'todo checkbox checklist', slash: true, run: (v) => setLineKind(v, 'task') },
  { id: 'quote', title: 'Quote', group: 'Lists', Icon: Quote, key: 'Mod-Shift-.', keywords: 'blockquote citation', slash: true, run: (v) => setLineKind(v, 'quote') },
  // blocks
  { id: 'codeblock', title: 'Code block', group: 'Blocks', Icon: CodeXml, key: 'Mod-Alt-c', keywords: 'fence snippet pre', slash: true, run: (v) => insertBlock(v, '```${language}\n$SEL\n```') },
  { id: 'table', title: 'Table', group: 'Blocks', Icon: Table, keywords: 'grid columns rows', slash: true, run: (v) => insertTable(v, 2, 3) },
  { id: 'divider', title: 'Divider', group: 'Blocks', Icon: Minus, keywords: 'horizontal rule hr line separator', slash: true, run: block('---') },
  { id: 'details', title: 'Collapsible section', group: 'Blocks', Icon: ChevronRightSquare, keywords: 'details summary toggle spoiler', slash: true, run: block('<details>\n<summary>${Summary}</summary>\n\n$SEL\n\n</details>') },
  { id: 'footnote', title: 'Footnote', group: 'Blocks', Icon: Footprints, keywords: 'note reference citation', slash: true, run: insertFootnote },
  { id: 'mathInline', title: 'Inline math', group: 'Blocks', Icon: SquareFunction, keywords: 'formula latex katex equation', slash: true, run: (v) => insertInline(v, '$${E = mc^2}$') },
  { id: 'mathBlock', title: 'Math block', group: 'Blocks', Icon: Sigma, keywords: 'formula latex katex equation display', slash: true, run: block('$$\n${a^2 + b^2 = c^2}\n$$') },
  // alerts
  { id: 'note', title: 'Note', group: 'Alerts', Icon: Info, keywords: 'alert callout admonition info', slash: true, run: alert('NOTE', 'Useful information.') },
  { id: 'tip', title: 'Tip', group: 'Alerts', Icon: Lightbulb, keywords: 'alert callout hint', slash: true, run: alert('TIP', 'A helpful hint.') },
  { id: 'important', title: 'Important', group: 'Alerts', Icon: MessageSquareWarning, keywords: 'alert callout', slash: true, run: alert('IMPORTANT', 'Key information.') },
  { id: 'warning', title: 'Warning', group: 'Alerts', Icon: AlertTriangle, keywords: 'alert callout caution', slash: true, run: alert('WARNING', 'Needs attention.') },
  { id: 'caution', title: 'Caution', group: 'Alerts', Icon: OctagonAlert, keywords: 'alert callout danger risk', slash: true, run: alert('CAUTION', 'Risky consequences.') },
  // media
  { id: 'image', title: 'Image from file…', group: 'Media', Icon: ImagePlus, keywords: 'picture photo png jpg', slash: true, run: pickImage },
  { id: 'imageUrl', title: 'Image from the web', group: 'Media', Icon: Image, keywords: 'picture photo url', slash: true, run: (v) => insertImage(v) },
  // diagrams
  ...MERMAID_TEMPLATES.map(([id, title, t]): EditorItem => ({ id: `mermaid.${id}`, title, group: 'Diagrams', Icon: GitBranch, keywords: `mermaid diagram chart ${id}`, slash: true, run: mermaid(t) })),
  // advanced
  { id: 'toc', title: 'Table of contents', group: 'Advanced', Icon: ListTree, keywords: 'toc outline headings index', slash: true, run: insertToc },
  { id: 'frontMatter', title: 'Front matter', group: 'Advanced', Icon: FileCode2, keywords: 'yaml metadata properties', slash: true, run: frontMatter },
  { id: 'date', title: 'Date and time', group: 'Advanced', Icon: CalendarClock, keywords: 'now today timestamp', slash: true, run: (v) => insertInline(v, now()) },
];

export const editorItem = (id: string) => EDITOR_ITEMS.find((i) => i.id === id)!;
