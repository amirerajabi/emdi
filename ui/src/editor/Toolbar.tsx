// The formatting toolbar above the editor: the paragraph style (Text, Heading 1–6), the marks, lists, and menus for
// everything to insert (code block by language, a table by size, alerts, images, diagrams, math, more). Buttons show
// what the cursor is in and never take the focus from the text.
import { redo, undo } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import type { EditorView } from '@codemirror/view';
import {
  ChevronDown,
  CodeXml,
  GitBranch,
  ImagePlus,
  Info,
  Link,
  MoreHorizontal,
  Redo2,
  Search,
  Sigma,
  Table,
  Undo2,
  WrapText,
} from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { showMenuBelow, type MenuItem } from '../components/common/Menu';
import { useSettings } from '../store/settings';
import { codeBlock, CODE_LANGUAGES, editorItem, MERMAID_TEMPLATES, mermaid } from './items';
import { formatTable, insertTable, type LineKind } from './format';
import { keyText } from './keys';
import { activeEditor, useEditorUi } from './MarkdownEditor';

const run = (fn: (v: EditorView) => unknown) => {
  const v = activeEditor();
  if (v) {
    void fn(v);
    v.focus();
  }
};

const keep = (e: MouseEvent) => e.preventDefault();

function Btn({ title, on, onClick, children, className }: { title: string; on?: boolean; onClick: (e: MouseEvent<HTMLButtonElement>) => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" className={`tb-btn${on ? ' on' : ''}${className ? ` ${className}` : ''}`} title={title} aria-label={title} aria-pressed={on} onMouseDown={keep} onClick={onClick}>
      {children}
    </button>
  );
}

/** A toolbar button for an EDITOR_ITEMS entry, its key in the tooltip. */
function ItemBtn({ id, on }: { id: string; on?: boolean }) {
  const item = editorItem(id);
  return (
    <Btn title={item.key ? `${item.title} (${keyText(item.key)})` : item.title} on={on} onClick={() => run(item.run)}>
      <item.Icon size={16} />
    </Btn>
  );
}

const menuOf = (ids: string[]): MenuItem[] =>
  ids.map((id) => {
    if (id === '-') return 'separator';
    const item = editorItem(id);
    return { label: item.title, icon: <item.Icon size={14} />, shortcut: item.key ? keyText(item.key) : undefined, run: () => run(item.run) };
  });

const STYLE_LABEL: Record<LineKind, string> = { paragraph: 'Text', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', h4: 'Heading 4', h5: 'Heading 5', h6: 'Heading 6', bullet: 'Text', ordered: 'Text', task: 'Text', quote: 'Text' };

export function EditorToolbar() {
  const f = useEditorUi((s) => s.format);
  const wrap = useSettings((s) => s.settings.wordWrap);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const line = f?.line ?? 'paragraph';

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      <Btn title="Undo (Ctrl+Z)" onClick={() => run(undo)}>
        <Undo2 size={16} />
      </Btn>
      <Btn title="Redo (Ctrl+Y)" onClick={() => run(redo)}>
        <Redo2 size={16} />
      </Btn>
      <span className="tb-sep" />
      <Btn title="Paragraph style" className="wide" onClick={(e) => showMenuBelow(e.currentTarget, menuOf(['paragraph', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']).map((m) => (m !== 'separator' && m.label === STYLE_LABEL[line] ? { ...m, checked: true } : m)))}>
        <span>{STYLE_LABEL[line]}</span>
        <ChevronDown size={13} />
      </Btn>
      <span className="tb-sep" />
      <ItemBtn id="bold" on={f?.bold} />
      <ItemBtn id="italic" on={f?.italic} />
      <ItemBtn id="strike" on={f?.strike} />
      <ItemBtn id="highlight" on={f?.highlight} />
      <ItemBtn id="code" on={f?.code} />
      <Btn title={`Link (${keyText('Mod-k')})`} on={f?.link} onClick={() => run(editorItem('link').run)}>
        <Link size={16} />
      </Btn>
      <span className="tb-sep" />
      <ItemBtn id="bullet" on={line === 'bullet'} />
      <ItemBtn id="ordered" on={line === 'ordered'} />
      <ItemBtn id="task" on={line === 'task'} />
      <ItemBtn id="quote" on={line === 'quote'} />
      <span className="tb-sep" />
      <Btn
        title={`Code block (${keyText('Mod-Alt-c')})`}
        onClick={(e) => showMenuBelow(e.currentTarget, CODE_LANGUAGES.map(([id, name]): MenuItem => ({ label: name, shortcut: id || undefined, run: () => run(codeBlock(id)) })))}
      >
        <CodeXml size={16} />
        <ChevronDown size={11} />
      </Btn>
      <Btn
        title="Table"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPicker(picker ? null : { x: r.left, y: r.bottom + 4 });
        }}
      >
        <Table size={16} />
        <ChevronDown size={11} />
      </Btn>
      <Btn title="Image" onClick={(e) => showMenuBelow(e.currentTarget, menuOf(['image', 'imageUrl']))}>
        <ImagePlus size={16} />
        <ChevronDown size={11} />
      </Btn>
      <Btn title="Alert" onClick={(e) => showMenuBelow(e.currentTarget, menuOf(['note', 'tip', 'important', 'warning', 'caution']))}>
        <Info size={16} />
        <ChevronDown size={11} />
      </Btn>
      <Btn title="Diagram (Mermaid)" onClick={(e) => showMenuBelow(e.currentTarget, MERMAID_TEMPLATES.map(([, title, t]): MenuItem => ({ label: title, icon: <GitBranch size={14} />, run: () => run(mermaid(t)) })))}>
        <GitBranch size={16} />
        <ChevronDown size={11} />
      </Btn>
      <Btn title="Math" onClick={(e) => showMenuBelow(e.currentTarget, menuOf(['mathInline', 'mathBlock']))}>
        <Sigma size={16} />
        <ChevronDown size={11} />
      </Btn>
      <ItemBtn id="divider" />
      <Btn
        title="More"
        onClick={(e) =>
          showMenuBelow(e.currentTarget, [
            ...menuOf(['footnote', 'details', 'sub', 'sup', '-', 'toc', 'frontMatter', 'date']),
            'separator',
            { label: 'Format Table', icon: <Table size={14} />, run: () => run(formatTable) },
          ])
        }
      >
        <MoreHorizontal size={16} />
      </Btn>
      <div className="flex-1" />
      <Btn title="Wrap long lines" on={wrap} onClick={() => useSettings.getState().update({ wordWrap: !wrap })}>
        <WrapText size={16} />
      </Btn>
      <Btn title={`Find and replace (${keyText('Mod-f')})`} onClick={() => run(openSearchPanel)}>
        <Search size={16} />
      </Btn>
      {picker && <TablePicker at={picker} onClose={() => setPicker(null)} />}
    </div>
  );
}

/** Hover a size, click to insert a table of it (rows below the header × columns). */
function TablePicker({ at, onClose }: { at: { x: number; y: number }; onClose: () => void }) {
  const [size, setSize] = useState({ rows: 2, cols: 3 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', away, true);
    window.addEventListener('keydown', away, true);
    return () => {
      window.removeEventListener('mousedown', away, true);
      window.removeEventListener('keydown', away, true);
    };
  }, [onClose]);
  const ROWS = 8;
  const COLS = 8;
  return (
    <div className="table-picker" ref={ref} style={{ left: at.x, top: at.y }} onMouseDown={keep}>
      <div className="table-picker-grid" style={{ gridTemplateColumns: `repeat(${COLS}, 18px)` }}>
        {Array.from({ length: (ROWS + 1) * COLS }, (_, i) => {
          const r = Math.floor(i / COLS);
          const c = i % COLS + 1;
          return (
            <div
              key={i}
              className={`table-picker-cell${r <= size.rows && c <= size.cols ? ' on' : ''}`}
              onMouseEnter={() => setSize({ rows: r, cols: c })}
              onClick={() => {
                run((v) => insertTable(v, Math.max(1, size.rows), size.cols));
                onClose();
              }}
            />
          );
        })}
      </div>
      <div className="table-picker-label">
        {size.cols} × {Math.max(1, size.rows) + 1} (with header)
      </div>
    </div>
  );
}
