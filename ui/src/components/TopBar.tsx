import { BookOpen, ChevronDown, FilePlus2, FileText, FolderOpen, Menu as MenuIcon, Moon, PanelLeft, Printer, Search, Settings, Sun, SunMoon } from 'lucide-react';
import { openFile, openFolder, openRecent } from '../app/actions';
import { runCommand, shortcutOf } from '../app/commands';
import { appMenu } from '../app/menus';
import { basename } from '../lib/paths';
import { platform } from '../platform';
import { activeDoc, useDocuments } from '../store/documents';
import { effectiveTheme, useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useWorkspace } from '../store/workspace';
import { FolioMark } from './common/icons';
import { showMenuBelow, type MenuItem } from './common/Menu';

const tip = (title: string, id: string) => {
  const k = shortcutOf(id);
  return k ? `${title} (${k})` : title;
};

export function TopBar() {
  const root = useWorkspace((s) => s.root);
  const recents = useWorkspace((s) => s.recents);
  const dockVisible = useUi((s) => s.dockVisible);
  const focus = useUi((s) => s.focusMode);
  const theme = useSettings((s) => s.settings.theme);
  const hasDoc = useDocuments((s) => !!activeDoc(s));
  const ThemeIcon = theme === 'system' ? SunMoon : effectiveTheme() === 'dark' ? Moon : Sun;
  const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';

  const workspaceMenu = (): MenuItem[] => [
    { label: 'New Document', icon: <FilePlus2 size={14} />, shortcut: shortcutOf('file.new'), run: () => runCommand('file.new') },
    { label: 'Open File…', icon: <FileText size={14} />, shortcut: shortcutOf('file.open'), run: () => void openFile() },
    { label: 'Open Folder…', icon: <FolderOpen size={14} />, shortcut: shortcutOf('file.openFolder'), run: () => void openFolder() },
    'separator',
    ...(recents.length ? recents.slice(0, 10).map((r): MenuItem => ({ label: r.path, icon: r.isDir ? <FolderOpen size={14} /> : <FileText size={14} />, run: () => void openRecent(r) })) : [{ label: 'Nothing opened yet', disabled: true } as MenuItem]),
    ...(root ? (['separator', { label: 'Close Folder', run: () => runCommand('file.closeFolder') }] as MenuItem[]) : []),
  ];

  return (
    <header className="topbar" aria-label="Application">
      <div className="brand" aria-label="Folio">
        <FolioMark size={18} />
        <span className="brand-name">Folio</span>
      </div>
      <button className="icon-btn" title="Main menu" aria-label="Main menu" onClick={(e) => showMenuBelow(e.currentTarget, appMenu())}>
        <MenuIcon size={16} />
      </button>
      <button className={`icon-btn${dockVisible && !focus ? ' on' : ''}`} title={tip('Side panel', 'view.toggleDock')} onClick={() => runCommand('view.toggleDock')}>
        <PanelLeft size={16} />
      </button>
      <div className="topbar-sep" />
      <button className="ws-pill" title={root ?? 'Open a file or folder'} onClick={(e) => showMenuBelow(e.currentTarget, workspaceMenu())}>
        <FolderOpen size={15} className="ic-folder" />
        <span>{root ? basename(root) : 'Open…'}</span>
        <ChevronDown size={13} className="muted" />
      </button>
      <div className="flex-1" />
      <button type="button" className="palette-trigger" onClick={() => useUi.getState().openPalette('files')} title="Search files, headings (#) and actions (>)">
        <Search size={14} />
        <span className="palette-trigger-text">Search everywhere</span>
        <span className="kbd-group">
          <kbd>{platform.os === 'darwin' ? '⇧' : 'Shift'}</kbd>
          <kbd>{platform.os === 'darwin' ? '⇧' : 'Shift'}</kbd>
        </span>
      </button>
      <div className="flex-1" />
      <button className="icon-btn" title={tip('New document', 'file.new')} onClick={() => runCommand('file.new')}>
        <FilePlus2 size={16} />
      </button>
      {hasDoc && (
        <>
          <button className={`icon-btn${focus ? ' on' : ''}`} title={tip('Reading mode', 'view.focus')} onClick={() => runCommand('view.focus')}>
            <BookOpen size={16} />
          </button>
          <button className="icon-btn" title={tip('Print', 'file.print')} onClick={() => runCommand('file.print')}>
            <Printer size={16} />
          </button>
          <div className="topbar-sep" />
        </>
      )}
      <button className="icon-btn" title={`Theme: ${theme} (click for ${nextTheme})`} onClick={() => useSettings.getState().update({ theme: nextTheme })}>
        <ThemeIcon size={16} />
      </button>
      <button className="icon-btn" title={tip('Settings', 'file.settings')} onClick={() => runCommand('file.settings')}>
        <Settings size={16} />
      </button>
    </header>
  );
}
