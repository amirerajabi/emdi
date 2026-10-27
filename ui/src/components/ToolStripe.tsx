// The tool window stripe on the left edge (Rider's new UI): one button per tool window; a click shows it in the side
// panel, or hides it when it is the one showing. Right-click a button to remove it; "More tool windows" (⋯) brings it back.
import { Ellipsis, FolderTree, ListTree, Search, type LucideIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import { shortcutOf } from '../app/commands';
import { DEFAULT_STRIPE, useUi, type DockPanel } from '../store/ui';
import { showContextMenu, useMenu, type MenuItem } from './common/Menu';
import { useShallow } from 'zustand/react/shallow';

export interface ToolWindow {
  id: DockPanel;
  title: string;
  Icon: LucideIcon;
  /** The command that opens it (for its shortcut). */
  command?: string;
}

export const TOOL_WINDOWS: ToolWindow[] = [
  { id: 'explorer', title: 'Explorer', Icon: FolderTree, command: 'view.explorer' },
  { id: 'outline', title: 'Outline', Icon: ListTree, command: 'view.outline' },
  { id: 'search', title: 'Find in Files', Icon: Search, command: 'nav.findInFiles' },
];

export const toolWindow = (id: string) => TOOL_WINDOWS.find((t) => t.id === id);

export function isOpen(id: string, s = useUi.getState()): boolean {
  return s.dockVisible && s.dock === id;
}

/** Opens a tool window, or hides it when it is the one showing (Rider's stripe buttons toggle). */
export function toggleToolWindow(id: DockPanel): void {
  const ui = useUi.getState();
  if (isOpen(id, ui)) ui.toggleDock();
  else ui.showDock(id);
}

export function setPinned(id: string, pinned: boolean): void {
  const cur = useUi.getState().stripe;
  const next = pinned ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter((x) => x !== id);
  // stripe order follows the registry
  useUi.getState().setLayout({ stripe: TOOL_WINDOWS.map((t) => t.id).filter((t) => next.includes(t)) });
}

/** "More tool windows": open any window, and which windows stay on the stripe. */
export function toolWindowsMenu(): MenuItem[] {
  const pinned = useUi.getState().stripe;
  const others = TOOL_WINDOWS.filter((t) => !pinned.includes(t.id));
  const item = (t: ToolWindow): MenuItem => {
    const k = t.command ? shortcutOf(t.command) : undefined;
    return { label: t.title, icon: <t.Icon size={14} />, shortcut: k, run: () => toggleToolWindow(t.id) };
  };
  return [
    ...(others.length ? others.map(item) : [{ label: 'Every tool window is on the stripe', disabled: true } as MenuItem]),
    'separator',
    { label: 'Show on the Stripe', submenu: TOOL_WINDOWS.map((t) => ({ label: t.title, checked: pinned.includes(t.id), run: () => setPinned(t.id, !pinned.includes(t.id)) })) },
    { label: 'Reset the Stripe', run: () => useUi.getState().setLayout({ stripe: DEFAULT_STRIPE }) },
  ];
}

function StripeButton({ w, open, temporary }: { w: ToolWindow; open: boolean; temporary: boolean }) {
  const k = w.command ? shortcutOf(w.command) : undefined;
  const onMenu = (e: MouseEvent) =>
    showContextMenu(e, [
      { label: open ? `Hide ${w.title}` : `Show ${w.title}`, run: () => toggleToolWindow(w.id) },
      temporary ? { label: 'Keep on the Stripe', run: () => setPinned(w.id, true) } : { label: 'Remove from the Stripe', run: () => setPinned(w.id, false) },
    ]);
  return (
    <button
      className={`stripe-btn${open ? ' active' : ''}${temporary ? ' temporary' : ''}`}
      title={k ? `${w.title} (${k})` : w.title}
      aria-label={w.title}
      aria-pressed={open}
      onClick={() => toggleToolWindow(w.id)}
      onContextMenu={onMenu}
    >
      <w.Icon size={17} />
    </button>
  );
}

export function ToolStripe() {
  const pinned = useUi((s) => s.stripe);
  const ui = useUi(useShallow((s) => ({ dockVisible: s.dockVisible, dock: s.dock })));
  const openLeft = ui.dockVisible ? ui.dock : null;
  // an open window that is not pinned shows on the stripe while it is open
  const shown = TOOL_WINDOWS.filter((t) => pinned.includes(t.id) || t.id === openLeft);
  return (
    <nav className="tool-stripe" aria-label="Tool windows">
      <div className="stripe-group">
        {shown.map((t) => (
          <StripeButton key={t.id} w={t} open={t.id === openLeft} temporary={!pinned.includes(t.id)} />
        ))}
        <button
          className="stripe-btn"
          title="More tool windows"
          aria-label="More tool windows"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            useMenu.getState().show(r.right + 4, r.top, toolWindowsMenu());
          }}
        >
          <Ellipsis size={17} />
        </button>
      </div>
      <div className="flex-1" />
    </nav>
  );
}
