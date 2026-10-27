import { create } from 'zustand';
import { load, save } from '../lib/storage';

export type DockPanel = 'explorer' | 'outline' | 'search';
export type PaletteMode = 'files' | 'commands' | 'headings' | 'recentFiles';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  text: string;
  detail?: string;
  action?: { label: string; run: () => void };
}

export interface PromptRequest {
  title: string;
  label?: string;
  value?: string;
  placeholder?: string;
  okLabel?: string;
  /** Select this part of the initial value (e.g. the name without its extension). */
  select?: [number, number];
  validate?: (v: string) => string | null;
  resolve: (v: string | null) => void;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  okLabel?: string;
  danger?: boolean;
  /** A third choice, e.g. "Don't save". */
  altLabel?: string;
  resolve: (v: 'ok' | 'alt' | 'cancel') => void;
}

interface Layout {
  dockVisible: boolean;
  dockWidth: number;
  dock: DockPanel;
  /** Reading mode: no side panel, tab bar or status bar. */
  focusMode: boolean;
  /** The tool windows on the left stripe. */
  stripe: string[];
  /** Split mode: the editor's share of the width (0.2–0.8). */
  splitRatio: number;
}

export const DEFAULT_STRIPE = ['explorer', 'outline', 'search'];

interface UiState extends Layout {
  palette: PaletteMode | null;
  paletteSeed: string;
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  /** Find in the document (Ctrl+F). */
  findOpen: boolean;
  prompt: PromptRequest | null;
  confirm: ConfirmRequest | null;
  toasts: Toast[];
  /** The heading the reader is at (the outline highlights it). */
  activeHeading: string | null;
  /** How far the active document is read (0–1), for the status bar. */
  progress: number;
  set(p: Partial<UiState>): void;
  setLayout(p: Partial<Layout>): void;
  showDock(panel: DockPanel): void;
  toggleDock(): void;
  openPalette(mode: PaletteMode, seed?: string): void;
  toast(t: Omit<Toast, 'id'>, ms?: number): void;
  dismiss(id: number): void;
}

const LAYOUT_DEFAULT: Layout = { dockVisible: true, dockWidth: 280, dock: 'explorer', focusMode: false, stripe: DEFAULT_STRIPE, splitRatio: 0.5 };
let toastId = 0;

export const DOCK_MIN = 200;
export const DOCK_MAX = 560;

export const useUi = create<UiState>((set, get) => {
  const persist = () => {
    const s = get();
    save('layout', { dockVisible: s.dockVisible, dockWidth: s.dockWidth, dock: s.dock, focusMode: s.focusMode, stripe: s.stripe, splitRatio: s.splitRatio });
  };
  return {
    ...load<Layout>('layout', LAYOUT_DEFAULT),
    palette: null,
    paletteSeed: '',
    settingsOpen: false,
    shortcutsOpen: false,
    findOpen: false,
    prompt: null,
    confirm: null,
    toasts: [],
    activeHeading: null,
    progress: 0,
    set: (p) => set(p),
    setLayout: (p) => {
      set(p);
      persist();
    },
    showDock: (panel) => {
      set({ dock: panel, dockVisible: true, focusMode: false });
      persist();
    },
    toggleDock: () => {
      set({ dockVisible: !get().dockVisible });
      persist();
    },
    openPalette: (mode, seed = '') => set({ palette: mode, paletteSeed: seed }),
    toast: (t, ms = 5000) => {
      const id = ++toastId;
      set({ toasts: [...get().toasts.slice(-4), { ...t, id }] });
      if (ms > 0) setTimeout(() => get().dismiss(id), ms);
    },
    dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  };
});

export const toast = (kind: Toast['kind'], text: string, detail?: string, ms?: number) => useUi.getState().toast({ kind, text, detail }, ms);

export function askText(r: Omit<PromptRequest, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => useUi.getState().set({ prompt: { ...r, resolve } }));
}

export function askConfirm(r: Omit<ConfirmRequest, 'resolve'>): Promise<'ok' | 'alt' | 'cancel'> {
  return new Promise((resolve) => useUi.getState().set({ confirm: { ...r, resolve } }));
}
