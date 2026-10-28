import { create } from 'zustand';
import { load, save } from '../lib/storage';

export type ReaderFont = 'sans' | 'serif' | 'system' | 'custom';
export type ContentWidth = 'narrow' | 'normal' | 'wide' | 'full';
export type DocModeSetting = 'view' | 'edit' | 'split';

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  /** The app theme used in light mode / dark mode (theme/themes.ts APP_THEMES). */
  appThemeLight: string;
  appThemeDark: string;
  /** The code theme of code blocks ('match' = derived from the app theme). */
  codeTheme: string;
  autoCheckUpdates: boolean;
  /** Reopen the folder and documents of the last session. */
  reopenLastSession: boolean;
  /** Reload an open document when its file changes on disk. */
  autoReload: boolean;
  /** Single click in the explorer opens a preview tab (replaced by the next file). */
  previewTabs: boolean;
  /** List every file in the explorer, not only Markdown. */
  showAllFiles: boolean;
  /** The window's font ('' = the system UI font) and its base size in px. */
  uiFontFamily: string;
  uiFontSize: number;
  // ---- reader
  readerFont: ReaderFont;
  /** The reading font when readerFont is 'custom' (a family name or CSS font list). */
  readerFontFamily: string;
  readerFontSize: number;
  lineHeight: number;
  contentWidth: ContentWidth;
  /** The font of code blocks and inline code. */
  codeFontFamily: string;
  /** Zoom of the document (percent), Ctrl + / Ctrl -. */
  zoom: number;
  /** "Smart" quotes and dashes. */
  typographer: boolean;
  /** A single line break in a paragraph is a <br> (GitHub comments style). */
  breaks: boolean;
  /** Bare URLs become links. */
  linkify: boolean;
  /** $…$ and $$…$$ as KaTeX math. */
  math: boolean;
  /** ```mermaid blocks drawn as diagrams. */
  mermaid: boolean;
  /** YAML front matter shown as a table above the document. */
  showFrontMatter: boolean;
  /** Numbers before headings (1, 1.1, 1.2…). */
  numberHeadings: boolean;
  /** The "On this page" outline at the right of wide windows. */
  floatingToc: boolean;
  // ---- editor
  /** How a Markdown file opens, and how a new document starts. */
  openMode: DocModeSetting;
  newMode: DocModeSetting;
  /** afterDelay: a moment after typing stops; onFocusChange: when Folio loses focus; also before a tab or the window closes. */
  autoSave: 'afterDelay' | 'onFocusChange' | 'off';
  autoSaveDelay: number;
  /** 'reader': the reading font; 'mono': the code font. */
  editorFont: 'reader' | 'mono';
  editorFontSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  spellcheck: boolean;
  /** The formatting and insert toolbar above the editor. */
  showToolbar: boolean;
  /** Typing / opens the insert menu. */
  slashCommands: boolean;
  /** Split view: the preview follows the editor's scroll (and back). */
  syncScroll: boolean;
  /** Pasted and dropped images are saved in this folder next to the document. */
  imageFolder: string;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  appThemeLight: 'light',
  appThemeDark: 'dark',
  codeTheme: 'match',
  autoCheckUpdates: true,
  reopenLastSession: true,
  autoReload: true,
  previewTabs: true,
  showAllFiles: false,
  uiFontFamily: '',
  uiFontSize: 13,
  readerFont: 'sans',
  readerFontFamily: '',
  readerFontSize: 16,
  lineHeight: 1.7,
  contentWidth: 'normal',
  codeFontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
  zoom: 100,
  typographer: true,
  breaks: false,
  linkify: true,
  math: true,
  mermaid: true,
  showFrontMatter: true,
  numberHeadings: false,
  floatingToc: true,
  openMode: 'view',
  newMode: 'split',
  autoSave: 'afterDelay',
  autoSaveDelay: 1000,
  editorFont: 'reader',
  editorFontSize: 15,
  wordWrap: true,
  lineNumbers: false,
  spellcheck: true,
  showToolbar: true,
  slashCommands: true,
  syncScroll: true,
  imageFolder: 'images',
};

interface SettingsState {
  settings: Settings;
  /** The user's own choices (the Settings dialog shows and edits these). */
  prefs: Settings;
  update(p: Partial<Settings>): void;
}

const initial = load('settings', DEFAULT_SETTINGS);

export const useSettings = create<SettingsState>((set, get) => ({
  settings: initial,
  prefs: initial,
  update: (p) => {
    const prefs = { ...get().prefs, ...p };
    set({ prefs, settings: prefs });
    save('settings', prefs);
  },
}));

const media = window.matchMedia('(prefers-color-scheme: dark)');

export function effectiveTheme(s: Settings = useSettings.getState().settings): 'dark' | 'light' {
  return s.theme === 'system' ? (media.matches ? 'dark' : 'light') : s.theme;
}

export function onSystemThemeChange(cb: () => void): () => void {
  media.addEventListener('change', cb);
  return () => media.removeEventListener('change', cb);
}

export const ZOOM_STEPS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];
