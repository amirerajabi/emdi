import type { MenuItem } from '../components/common/Menu';
import { toolWindowsMenu } from '../components/ToolStripe';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useWorkspace } from '../store/workspace';
import { openRecent } from './actions';
import { commandById, keyLabel } from './commands';

const c = (id: string, label?: string): MenuItem => {
  const cmd = commandById(id);
  if (!cmd) return { label: id, disabled: true };
  return { label: label ?? cmd.title, shortcut: cmd.keys?.[0] ? keyLabel(cmd.keys[0]) : undefined, run: () => void cmd.run() };
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
      submenu: [c('file.open'), c('file.openFolder'), { label: 'Open Recent', submenu: recentMenu() }, 'separator', c('file.reload'), c('file.close'), c('file.closeAll'), c('file.closeFolder'), 'separator', c('file.exportPdf'), c('file.print'), 'separator', c('file.copyPath'), c('file.copySource'), 'separator', c('file.settings')],
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
