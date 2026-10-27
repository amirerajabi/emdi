// Command registry: every action has an id, a title and optional shortcuts (Ctrl → ⌘ on macOS).
// The palette lists them; a capture-phase key listener runs them.
import { openSettings } from '../components/settings/nav';
import { toggleToolWindow } from '../components/ToolStripe';
import { isMac } from '../platform';
import { activeDoc, useDocuments } from '../store/documents';
import { effectiveTheme, useSettings, ZOOM_STEPS, type Settings } from '../store/settings';
import { toast, useUi } from '../store/ui';
import { useWorkspace } from '../store/workspace';
import { copyText, exportPdf, openFile, openFolder, printDocument, scrollReader } from './actions';
import { checkForUpdatesNow } from './updates';

export interface Command {
  id: string;
  title: string;
  category: string;
  keys?: string[];
  run: () => void | Promise<void>;
  /** Runs even when a text field has focus. */
  global?: boolean;
}

const needsDoc = (fn: () => unknown) => () => {
  if (!activeDoc()) {
    toast('info', 'Open a document first');
    return;
  }
  void fn();
};

const toggle = (key: keyof Settings) => () => useSettings.getState().update({ [key]: !useSettings.getState().prefs[key] });

function zoom(dir: 1 | -1): void {
  const cur = useSettings.getState().settings.zoom;
  const next = dir > 0 ? ZOOM_STEPS.find((z) => z > cur) : [...ZOOM_STEPS].reverse().find((z) => z < cur);
  if (next) useSettings.getState().update({ zoom: next });
}

function switchTab(d: 1 | -1): void {
  const { docs, active } = useDocuments.getState();
  if (docs.length < 2) return;
  const i = docs.findIndex((x) => x.path === active);
  useDocuments.getState().activate(docs[(i + d + docs.length) % docs.length].path);
}

function toggleFocus(): void {
  const ui = useUi.getState();
  ui.setLayout({ focusMode: !ui.focusMode });
}

export const COMMANDS: Command[] = [
  // File
  { id: 'file.open', title: 'Open File…', category: 'File', keys: ['Ctrl+O'], run: openFile, global: true },
  { id: 'file.openFolder', title: 'Open Folder…', category: 'File', keys: ['Ctrl+K Ctrl+O'], run: openFolder, global: true },
  { id: 'file.close', title: 'Close Tab', category: 'File', keys: ['Ctrl+W', 'Ctrl+F4'], run: () => { const a = useDocuments.getState().active; if (a) useDocuments.getState().close(a); }, global: true },
  { id: 'file.closeAll', title: 'Close All Tabs', category: 'File', keys: ['Ctrl+Shift+W'], run: () => useDocuments.getState().closeMany(useDocuments.getState().docs.map((d) => d.path)) },
  { id: 'file.closeFolder', title: 'Close Folder', category: 'File', run: () => useWorkspace.getState().close() },
  { id: 'file.reload', title: 'Reload from Disk', category: 'File', keys: ['F5'], run: needsDoc(() => useDocuments.getState().reload(useDocuments.getState().active!)) },
  { id: 'file.exportPdf', title: 'Export to PDF…', category: 'File', keys: ['Ctrl+Shift+E'], run: needsDoc(exportPdf) },
  { id: 'file.print', title: 'Print…', category: 'File', keys: ['Ctrl+P'], run: needsDoc(printDocument), global: true },
  { id: 'file.copyPath', title: 'Copy Path of the Document', category: 'File', run: needsDoc(() => copyText(useDocuments.getState().active!)) },
  { id: 'file.copySource', title: 'Copy Markdown Source', category: 'File', run: needsDoc(() => copyText(activeDoc()!.text, 'Markdown')) },
  { id: 'file.settings', title: 'Settings…', category: 'File', keys: ['Ctrl+,', 'Ctrl+Alt+S'], run: () => openSettings(), global: true },
  // Navigate
  { id: 'nav.searchEverywhere', title: 'Search Everywhere', category: 'Navigate', keys: ['Ctrl+Shift+N'], run: () => useUi.getState().openPalette('files'), global: true },
  { id: 'nav.commands', title: 'Find Action…', category: 'Navigate', keys: ['Ctrl+Shift+A', 'Ctrl+Shift+P', 'F1'], run: () => useUi.getState().openPalette('commands', '>'), global: true },
  { id: 'nav.headings', title: 'Go to Heading…', category: 'Navigate', keys: ['Ctrl+Shift+O', 'Ctrl+F12'], run: needsDoc(() => useUi.getState().openPalette('headings', '#')), global: true },
  { id: 'nav.recentFiles', title: 'Recent Files…', category: 'Navigate', keys: ['Ctrl+E'], run: () => useUi.getState().openPalette('recentFiles'), global: true },
  { id: 'nav.find', title: 'Find in Document', category: 'Navigate', keys: ['Ctrl+F'], run: needsDoc(() => { useUi.getState().set({ findOpen: true }); window.dispatchEvent(new Event('emdi:find')); }), global: true },
  { id: 'nav.findInFiles', title: 'Find in Files', category: 'Navigate', keys: ['Ctrl+Shift+F'], run: () => { useUi.getState().showDock('search'); setTimeout(() => window.dispatchEvent(new Event('emdi:find-in-files')), 0); }, global: true },
  { id: 'nav.nextTab', title: 'Next Tab', category: 'Navigate', keys: ['Ctrl+Tab', 'Alt+Right'], run: () => switchTab(1), global: true },
  { id: 'nav.prevTab', title: 'Previous Tab', category: 'Navigate', keys: ['Ctrl+Shift+Tab', 'Alt+Left'], run: () => switchTab(-1), global: true },
  { id: 'nav.top', title: 'Go to Top', category: 'Navigate', keys: ['Ctrl+Home'], run: () => scrollReader('top') },
  { id: 'nav.bottom', title: 'Go to Bottom', category: 'Navigate', keys: ['Ctrl+End'], run: () => scrollReader('bottom') },
  // View
  { id: 'view.explorer', title: 'Explorer', category: 'View', keys: ['Alt+1'], run: () => toggleToolWindow('explorer'), global: true },
  { id: 'view.outline', title: 'Outline', category: 'View', keys: ['Alt+7'], run: () => toggleToolWindow('outline'), global: true },
  { id: 'view.toggleDock', title: 'Toggle Side Panel', category: 'View', keys: ['Ctrl+B'], run: () => { const ui = useUi.getState(); if (ui.focusMode) ui.setLayout({ focusMode: false, dockVisible: true }); else ui.toggleDock(); }, global: true },
  { id: 'view.focus', title: 'Toggle Reading Mode', category: 'View', keys: ['F11', 'Ctrl+K Z'], run: toggleFocus, global: true },
  { id: 'view.zoomIn', title: 'Zoom In', category: 'View', keys: ['Ctrl+=', 'Ctrl+Shift+='], run: () => zoom(1), global: true },
  { id: 'view.zoomOut', title: 'Zoom Out', category: 'View', keys: ['Ctrl+-'], run: () => zoom(-1), global: true },
  { id: 'view.zoomReset', title: 'Reset Zoom', category: 'View', keys: ['Ctrl+0'], run: () => useSettings.getState().update({ zoom: 100 }), global: true },
  { id: 'view.theme', title: 'Toggle Light / Dark Theme', category: 'View', keys: ['Ctrl+K Ctrl+T'], run: () => useSettings.getState().update({ theme: effectiveTheme() === 'dark' ? 'light' : 'dark' }) },
  { id: 'view.pageToc', title: 'Toggle "On This Page"', category: 'View', run: toggle('floatingToc') },
  { id: 'view.numberHeadings', title: 'Toggle Numbered Headings', category: 'View', run: toggle('numberHeadings') },
  { id: 'view.wide', title: 'Cycle Content Width', category: 'View', keys: ['Ctrl+K W'], run: () => { const order: Settings['contentWidth'][] = ['narrow', 'normal', 'wide', 'full']; const cur = useSettings.getState().settings.contentWidth; const next = order[(order.indexOf(cur) + 1) % order.length]; useSettings.getState().update({ contentWidth: next }); toast('info', `Content width: ${next}`, undefined, 1500); } },
  { id: 'view.serif', title: 'Toggle Serif Reading Font', category: 'View', run: () => useSettings.getState().update({ readerFont: useSettings.getState().settings.readerFont === 'serif' ? 'sans' : 'serif' }) },
  // Help
  { id: 'view.shortcuts', title: 'Keyboard Shortcuts', category: 'Help', keys: ['Ctrl+K Ctrl+S'], run: () => useUi.getState().set({ shortcutsOpen: true }), global: true },
  { id: 'help.checkForUpdates', title: 'Check for Updates…', category: 'Help', run: () => void checkForUpdatesNow() },
  { id: 'help.about', title: 'About Emdi', category: 'Help', run: () => openSettings('updates') },
];

export const commandById = (id: string) => COMMANDS.find((c) => c.id === id);
export const runCommand = (id: string) => void commandById(id)?.run();

/** "Ctrl+Shift+B" → "Ctrl+Shift+B" on Windows, "⌘⇧B" on macOS. */
export function keyLabel(k: string): string {
  if (!isMac) return k;
  return k
    .split(' ')
    .map((chord) => chord.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧'))
    .join(' ');
}

export const shortcutOf = (id: string) => {
  const k = commandById(id)?.keys?.[0];
  return k ? keyLabel(k) : undefined;
};

// ---------------------------------------------------------------- key dispatch

function chordOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  else if (key === 'ArrowLeft') key = 'Left';
  else if (key === 'ArrowRight') key = 'Right';
  else if (key === 'ArrowUp') key = 'Up';
  else if (key === 'ArrowDown') key = 'Down';
  if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  if (e.code === 'Backquote') key = '`';
  if (e.code === 'Equal') key = '=';
  if (e.code === 'Minus') key = '-';
  if (e.code === 'Slash') key = '/';
  if (e.code === 'Comma') key = ',';
  if (e.code === 'Period') key = '.';
  return [...parts, key].join('+');
}

export function installKeys(): () => void {
  let pendingChord: string | null = null;
  let chordTimer: ReturnType<typeof setTimeout> | undefined;
  let lastShift = 0;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Shift' && !e.repeat) {
      const now = Date.now();
      if (now - lastShift < 350) {
        lastShift = 0;
        e.preventDefault();
        useUi.getState().openPalette('files');
        return;
      }
      lastShift = now;
      return;
    }
    if (['Control', 'Alt', 'Meta', 'Shift'].includes(e.key)) return;
    lastShift = 0;
    const chord = chordOf(e);
    const full = pendingChord ? `${pendingChord} ${chord}` : chord;
    const target = e.target as HTMLElement | null;
    const inField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
    // dialogs own their keys
    if (document.querySelector('.overlay') && e.key !== 'Escape' && !useUi.getState().palette) return;
    // Escape leaves reading mode
    if (e.key === 'Escape' && !inField && useUi.getState().focusMode && !document.querySelector('.overlay')) {
      useUi.getState().setLayout({ focusMode: false });
      return;
    }

    const cmd = COMMANDS.find((c) => c.keys?.includes(full));
    if (cmd) {
      if (inField && !cmd.global) return;
      e.preventDefault();
      e.stopPropagation();
      pendingChord = null;
      void cmd.run();
      return;
    }
    // first half of a two-chord shortcut (Ctrl+K Ctrl+O)
    if (!pendingChord && COMMANDS.some((c) => c.keys?.some((k) => k.startsWith(`${chord} `)))) {
      e.preventDefault();
      e.stopPropagation();
      pendingChord = chord;
      clearTimeout(chordTimer);
      chordTimer = setTimeout(() => (pendingChord = null), 1500);
      return;
    }
    pendingChord = null;
    // reading keys on the document
    if (!inField && !document.querySelector('.overlay')) {
      if (chord === 'Space' || chord === 'Shift+Space') {
        scrollReader(chord === 'Space' ? 'page' : '-page');
        e.preventDefault();
      }
    }
  };
  window.addEventListener('keydown', onKeyDown, true);
  return () => window.removeEventListener('keydown', onKeyDown, true);
}
