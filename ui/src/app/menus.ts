import type { MenuItem } from '../components/common/Menu';
import { toolWindowsMenu } from '../components/ToolStripe';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useWorkspace } from '../store/workspace';
import { openRecent } from './actions';
import { commandById, shortcutOf } from './commands';

const c = (id: string, label?: string): MenuItem => {
  const cmd = commandById(id);
  if (!cmd) return { label: id, disabled: true };
  return { label: label ?? cmd.title, shortcut: shortcutOf(id), run: () => void cmd.run() };
};

const checked = (item: MenuItem, on: boolean): MenuItem => (item === 'separator' ? item : { ...item, checked: on });

function recentMenu(): MenuItem[] {
  const recents = useWorkspace.getState().recents;
  if (recents.length === 0) return [{ label: 'Nothing opened yet', disabled: true }];
  return [...recents.map((r): MenuItem => ({ label: r.path, run: () => void openRecent(r) })), 'separator', { label: 'Clear Recent', run: () => useWorkspace.getState().clearRecents() }];
}

/** The application menu (the ☰ button in the top bar). */
export function appMenu(): MenuItem[] {
  const s = useSettings.getState().prefs;
  const ui = useUi.getState();
  return [
    {
      label: 'File',
      submenu: [c('file.new'), c('file.open'), c('file.openFolder'), { label: 'Open Recent', submenu: recentMenu() }, 'separator', c('file.save'), c('file.saveAs'), c('file.saveAll'), 'separator', c('file.reload'), c('file.close'), c('file.closeAll'), c('file.closeFolder'), 'separator', c('file.exportPdf'), c('file.print'), 'separator', c('file.copyPath'), c('file.copySource'), 'separator', c('file.settings')],
    },
    {
      label: 'Edit',
      submenu: [
        c('edit.undo'),
        c('edit.redo'),
        'separator',
        c('nav.find'),
        c('edit.replace'),
        'separator',
        {
          label: 'Format',
          submenu: [...['bold', 'italic', 'strike', 'highlight', 'code', 'sub', 'sup'].map((i) => c(`insert.${i}`)), 'separator', ...['paragraph', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((i) => c(`insert.${i}`)), 'separator', ...['bullet', 'ordered', 'task', 'quote'].map((i) => c(`insert.${i}`))],
        },
        {
          label: 'Insert',
          submenu: [
            ...['link', 'image', 'imageUrl', 'table', 'codeblock', 'divider'].map((i) => c(`insert.${i}`)),
            'separator',
            ...['note', 'tip', 'important', 'warning', 'caution'].map((i) => c(`insert.${i}`)),
            'separator',
            ...['mathInline', 'mathBlock', 'footnote', 'details'].map((i) => c(`insert.${i}`)),
            { label: 'Diagram', submenu: ['flowchart', 'sequence', 'class', 'state', 'er', 'gantt', 'pie', 'mindmap', 'timeline'].map((i) => c(`insert.mermaid.${i}`)) },
            'separator',
            ...['toc', 'frontMatter', 'date'].map((i) => c(`insert.${i}`)),
          ],
        },
        c('edit.formatTable'),
        'separator',
        checked(c('edit.toggleToolbar', 'Formatting Toolbar'), s.showToolbar),
        checked(c('edit.toggleSpellcheck', 'Spell Checking'), s.spellcheck),
      ],
    },
    {
      label: 'Navigate',
      submenu: [c('nav.searchEverywhere'), c('nav.headings'), c('nav.recentFiles'), 'separator', c('nav.find'), c('nav.findInFiles'), 'separator', c('nav.nextTab'), c('nav.prevTab'), c('nav.top'), c('nav.bottom')],
    },
    {
      label: 'View',
      submenu: [
        c('view.explorer'),
        c('view.outline'),
        c('nav.findInFiles', 'Find in Files'),
        { label: 'Tool Windows', submenu: toolWindowsMenu() },
        c('view.toggleDock'),
        checked(c('view.focus', 'Reading Mode'), ui.focusMode),
        'separator',
        c('view.modeView', 'View'),
        c('view.modeEdit', 'Edit'),
        c('view.modeSplit', 'Split'),
        c('view.toggleEdit'),
        'separator',
        c('view.zoomIn'),
        c('view.zoomOut'),
        c('view.zoomReset'),
        'separator',
        checked(c('view.pageToc', 'On This Page'), s.floatingToc),
        checked(c('view.numberHeadings', 'Numbered Headings'), s.numberHeadings),
        checked(c('view.serif', 'Serif Reading Font'), s.readerFont === 'serif'),
        c('view.wide'),
        c('view.theme'),
      ],
    },
    { label: 'Help', submenu: [c('view.shortcuts'), c('nav.commands'), 'separator', c('help.checkForUpdates'), c('help.about')] },
  ];
}
