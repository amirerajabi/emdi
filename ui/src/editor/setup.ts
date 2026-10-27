// The editor's CodeMirror configuration: Markdown (GitHub-flavoured) with highlighted code inside fences, Emdi's look
// (theme tokens), the Markdown keys (EDITOR_ITEMS plus list continuation, Tab in tables and lists), the / menu, search,
// pasting a link over a selection, pasted and dropped images, and right-to-left lines. Settings that change while the
// editor is open are swapped in through compartments.
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentLess, indentMore, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state';
import { crosshairCursor, drawSelection, dropCursor, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder, rectangularSelection, type KeyBinding } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import type { Settings } from '../store/settings';
import { insertLink, moveCell, toggleTaskDone } from './format';
import { imageFiles, insertImages } from './images';
import { EDITOR_ITEMS } from './items';
import { slashMenu } from './slash';

const markdownStyle = HighlightStyle.define([
  { tag: t.heading1, class: 'md-h md-h1' },
  { tag: t.heading2, class: 'md-h md-h2' },
  { tag: t.heading3, class: 'md-h md-h3' },
  { tag: [t.heading4, t.heading5, t.heading6], class: 'md-h md-h4' },
  { tag: t.strong, class: 'md-strong' },
  { tag: t.emphasis, class: 'md-em' },
  { tag: t.strikethrough, class: 'md-strike' },
  { tag: t.link, class: 'md-link' },
  { tag: t.url, class: 'md-url' },
  { tag: t.monospace, class: 'md-code' },
  { tag: t.quote, class: 'md-quote' },
  { tag: [t.processingInstruction, t.meta], class: 'md-mark' },
  { tag: t.contentSeparator, class: 'md-hr' },
  { tag: t.list, class: 'md-list' },
  { tag: t.labelName, class: 'md-label' },
  // code inside fences: the code theme's colours
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], class: 'tok-keyword' },
  { tag: [t.string, t.special(t.string), t.regexp], class: 'tok-string' },
  { tag: [t.number, t.bool, t.null, t.atom], class: 'tok-number' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: 'tok-comment' },
  { tag: [t.typeName, t.className, t.namespace], class: 'tok-type' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'tok-function' },
  { tag: [t.propertyName, t.attributeName], class: 'tok-property' },
  { tag: [t.tagName], class: 'tok-keyword' },
  { tag: [t.invalid], class: 'tok-invalid' },
]);

/** Everything a setting can change, swapped in without rebuilding the editor. */
export const compartments = {
  wrap: new Compartment(),
  lineNumbers: new Compartment(),
  spellcheck: new Compartment(),
  slash: new Compartment(),
};

export const settingsExtensions = (s: Settings) => ({
  wrap: s.wordWrap ? EditorView.lineWrapping : [],
  lineNumbers: s.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
  spellcheck: EditorView.contentAttributes.of({ spellcheck: s.spellcheck ? 'true' : 'false', autocorrect: 'off', autocapitalize: 'sentences' }),
  slash: s.slashCommands ? slashMenu() : [],
});

const itemKeys: KeyBinding[] = EDITOR_ITEMS.filter((i) => i.key).map((i) => ({ key: i.key!, run: (v) => (void i.run(v), true), preventDefault: true }));

/**
 * Enter on an empty top-level list item ends the list with a blank line after it, so what follows is a new paragraph
 * and not part of the last item (CodeMirror only removes the marker). Nested empty items outdent as usual.
 */
function endList(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  if (!/^([-*+](\s+\[[ xX]\])?|\d+[.)])\s*$/.test(line.text) || line.number === 1) return false;
  view.dispatch({ changes: { from: line.from, to: line.to, insert: '\n' }, selection: { anchor: line.from + 1 }, scrollIntoView: true, userEvent: 'input' });
  return true;
}

const markdownKeys: KeyBinding[] = [
  ...itemKeys,
  { key: 'Mod-Enter', run: toggleTaskDone },
  // Tab: the next table cell, else indent (nested lists)
  { key: 'Tab', run: (v) => moveCell(v, 1) || indentMore(v), shift: (v) => moveCell(v, -1) || indentLess(v) },
];

const URL_ONLY = /^(https?:\/\/|mailto:)\S+$/i;

const pasteAndDrop = EditorView.domEventHandlers({
  paste(e, view) {
    const images = imageFiles(e.clipboardData?.files);
    if (images.length) {
      e.preventDefault();
      void insertImages(view, images);
      return true;
    }
    // a URL pasted over selected text makes a link
    const text = e.clipboardData?.getData('text/plain')?.trim() ?? '';
    const sel = view.state.selection.main;
    if (!sel.empty && URL_ONLY.test(text) && !URL_ONLY.test(view.state.sliceDoc(sel.from, sel.to))) {
      e.preventDefault();
      insertLink(view, text);
      return true;
    }
    return false;
  },
  drop(e, view) {
    const images = imageFiles(e.dataTransfer?.files);
    if (!images.length) return false;
    e.preventDefault();
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos !== null) view.dispatch({ selection: { anchor: pos } });
    void insertImages(view, images);
    return true;
  },
});

export function editorExtensions(s: Settings, onUpdate: Extension): Extension[] {
  const x = settingsExtensions(s);
  return [
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    EditorState.allowMultipleSelections.of(true),
    EditorView.perLineTextDirection.of(true),
    markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
    syntaxHighlighting(markdownStyle),
    search({ top: true }),
    placeholder('Start writing… type / to insert a heading, list, table, image, diagram…'),
    compartments.wrap.of(x.wrap),
    compartments.lineNumbers.of(x.lineNumbers),
    compartments.spellcheck.of(x.spellcheck),
    compartments.slash.of(x.slash),
    // ahead of the Markdown keymap's own Enter
    Prec.highest(keymap.of([{ key: 'Enter', run: endList }])),
    keymap.of([...markdownKeys, ...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
    pasteAndDrop,
    onUpdate,
  ];
}
