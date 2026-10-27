// The desktop bridge (desktop/src/preload.ts exposes window.emdi) or, in a plain browser (npm run dev), a fallback
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
  // ---- files
  readFile(path: string): Promise<{ text: string; mtime: number }>;
  listDir(dir: string, opts?: { all?: boolean }): Promise<FsEntry[]>;
  listFiles(root: string): Promise<string[]>;
  stat(path: string): Promise<{ isDir: boolean; size: number; mtime: number } | null>;
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
    emdi?: Platform;
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

export const platform: Platform = window.emdi ?? browserPlatform();

export const isMac = platform.os === 'darwin';
