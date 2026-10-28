// The desktop bridge (desktop/src/preload.ts exposes window.folio) or, in a plain browser (npm run dev), a fallback
// that opens files through the File System Access API where it can and asks for nothing else.

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

export interface FsChanges {
  files: string[];
  dirs: string[];
}

export interface Platform {
  kind: 'electron' | 'browser';
  os: 'win32' | 'darwin' | 'linux';
  /** How the window draws its caption: Windows overlay buttons, macOS inset traffic lights, or a native frame. */
  titleBar: 'overlay' | 'inset' | 'native';
  appVersion?: string;
  /** Desktop, once after updating from Emdi: its settings, recents and session (storage keys and values). */
  importedStorage?(): Record<string, string> | null;
  exportStorage?(entries: Record<string, string>): void;
  // ---- files
  readFile(path: string): Promise<{ text: string; mtime: number }>;
  listDir(dir: string, opts?: { all?: boolean }): Promise<FsEntry[]>;
  listFiles(root: string): Promise<string[]>;
  stat(path: string): Promise<{ isDir: boolean; size: number; mtime: number } | null>;
  writeFile(path: string, text: string): Promise<{ mtime: number }>;
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  /** A new file (with text) or folder; fails when the name is taken. */
  create(path: string, isDir: boolean, text?: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** To the Recycle Bin / Trash. */
  trash(path: string): Promise<void>;
  pickSavePath(title?: string, defaultPath?: string): Promise<string | null>;
  /** Desktop: called before the window closes; the shell waits (up to 5 s) for the returned promise. */
  onBeforeClose?(cb: () => Promise<void>): void;
  /** The files and folders to watch (replaces the previous set). */
  watch(paths: string[]): Promise<void>;
  onFsChanged(cb: (c: FsChanges) => void): () => void;
  pendingPaths(): Promise<string[]>;
  onOpenPaths(cb: (paths: string[]) => void): () => void;
  /** The path of a file dropped on the window (desktop only). */
  pathForFile?(file: File): string;
  pickFolder(title?: string): Promise<string | null>;
  pickFiles(title?: string, filters?: { name: string; extensions: string[] }[]): Promise<string[] | null>;
  exportPdf?(name: string): Promise<string | null>;
  print(): Promise<void>;
  setTitle(title: string): void;
  setTitleBarTheme(t: { color: string; symbolColor: string; dark: boolean }): void;
  reveal(path: string): void;
  openPath?(path: string): void;
  openExternal(url: string): void;
  // ---- updates (desktop only; the Rowlit updater)
  onUpdateStatus?(cb: (status: UpdateStatus) => void): () => void;
  getUpdateStatus?(): Promise<UpdateStatus>;
  checkForUpdates?(opts?: { manual?: boolean }): Promise<UpdateStatus>;
  configureUpdates?(opts: { autoCheck: boolean }): Promise<void>;
  quitAndInstall?(): Promise<boolean>;
  cancelUpdateDownload?(): Promise<boolean>;
  showNotification?(n: { title: string; body: string }): void;
}

export type UpdateMode = 'install' | 'notify' | 'disabled';
export type UpdateState = 'disabled' | 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error';

export interface UpdateStatus {
  state: UpdateState;
  /** install: downloaded in the background, restart to install. notify: only announced (unsigned macOS). */
  mode: UpdateMode;
  currentVersion: string;
  version?: string;
  percent?: number;
  message?: string;
  releaseUrl?: string;
  downloadStopped?: boolean;
}

declare global {
  interface Window {
    folio?: Platform;
  }
}

/** npm run dev in a browser: files picked in the browser are kept in memory under a made-up path. */
function browserPlatform(): Platform {
  const ua = navigator.userAgent;
  const os = /Mac/.test(ua) ? 'darwin' : /Win/.test(ua) ? 'win32' : 'linux';
  const memory = new Map<string, string>();
  const pick = () =>
    new Promise<string[] | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = '.md,.markdown,.mdown,.mkd,.mdx,.txt';
      input.onchange = async () => {
        const files = [...(input.files ?? [])];
        const paths: string[] = [];
        for (const f of files) {
          const p = `/browser/${f.name}`;
          memory.set(p, await f.text());
          paths.push(p);
        }
        resolve(paths.length ? paths : null);
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  return {
    kind: 'browser',
    os,
    titleBar: 'native',
    async readFile(path) {
      const text = memory.get(path);
      if (text === undefined) throw new Error('Open the file again: the browser preview keeps files only for this tab.');
      return { text, mtime: 0 };
    },
    async listDir() {
      return [];
    },
    async listFiles() {
      return [...memory.keys()];
    },
    async stat(path) {
      return memory.has(path) ? { isDir: false, size: memory.get(path)!.length, mtime: 0 } : null;
    },
    async writeFile(path, text) {
      memory.set(path, text);
      return { mtime: Date.now() };
    },
    async writeBytes() {
      throw new Error('Saving images needs the desktop app');
    },
    async create(path, isDir, text = '') {
      if (memory.has(path)) throw new Error('That name is taken');
      if (!isDir) memory.set(path, text);
    },
    async rename(from, to) {
      memory.set(to, memory.get(from) ?? '');
      memory.delete(from);
    },
    async trash(path) {
      memory.delete(path);
    },
    async pickSavePath(_title, defaultPath) {
      const name = window.prompt('File name', defaultPath?.split(/[\\/]/).pop() ?? 'Untitled.md');
      return name ? `/browser/${name}` : null;
    },
    async watch() {},
    onFsChanged: () => () => {},
    async pendingPaths() {
      return [];
    },
    onOpenPaths: () => () => {},
    async pickFolder() {
      return null;
    },
    pickFiles: pick,
    async print() {
      window.print();
    },
    setTitle(title) {
      document.title = title;
    },
    setTitleBarTheme() {},
    reveal() {},
    openExternal(url) {
      window.open(url, '_blank', 'noopener');
    },
  };
}

export const platform: Platform = window.folio ?? browserPlatform();

export const isMac = platform.os === 'darwin';
