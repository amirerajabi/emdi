// The window.emdi bridge (ui/src/platform.ts). Only these calls cross into the main process.
import { contextBridge, ipcRenderer, webUtils } from 'electron';

const os = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux';

const listen = <T>(channel: string, cb: (v: T) => void) => {
  const h = (_e: unknown, v: T) => cb(v);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('emdi', {
  kind: 'electron',
  os,
  titleBar: os === 'win32' ? 'overlay' : os === 'darwin' ? 'inset' : 'native',
  appVersion: process.argv.find((a) => a.startsWith('--emdi-version='))?.slice('--emdi-version='.length) ?? '0.0.0',
  // ---- files
  readFile: (path: string) => ipcRenderer.invoke('fs:read', String(path)),
  listDir: (dir: string, opts?: { all?: boolean }) => ipcRenderer.invoke('fs:list', String(dir), { all: opts?.all === true }),
  listFiles: (root: string) => ipcRenderer.invoke('fs:files', String(root)),
  stat: (path: string) => ipcRenderer.invoke('fs:stat', String(path)),
  writeFile: (path: string, text: string): Promise<{ mtime: number }> => ipcRenderer.invoke('fs:write', String(path), String(text)),
  writeBytes: (path: string, data: Uint8Array): Promise<void> => ipcRenderer.invoke('fs:writeBytes', String(path), data),
  create: (path: string, isDir: boolean, text?: string): Promise<void> => ipcRenderer.invoke('fs:create', String(path), isDir === true, text ?? ''),
  rename: (from: string, to: string): Promise<void> => ipcRenderer.invoke('fs:rename', String(from), String(to)),
  trash: (path: string): Promise<void> => ipcRenderer.invoke('fs:trash', String(path)),
  pickSavePath: (title?: string, defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('dialog:save', title, defaultPath),
  /** Before the window closes: the UI saves its documents (Auto Save), then the shell closes it. */
  onBeforeClose: (cb: () => Promise<void>) => {
    ipcRenderer.on('app:before-close', () => {
      Promise.resolve()
        .then(cb)
        .catch(() => undefined)
        .finally(() => ipcRenderer.send('app:close-ok'));
    });
  },
  watch: (paths: string[]) => ipcRenderer.invoke('fs:watch', Array.isArray(paths) ? paths.map(String) : []),
  onFsChanged: (cb: (c: { files: string[]; dirs: string[] }) => void) => listen('fs:changed', cb),
  /** Paths from the command line / Explorer double-click, then any later ones (second instance, macOS open-file). */
  pendingPaths: (): Promise<string[]> => ipcRenderer.invoke('app:pending-paths'),
  onOpenPaths: (cb: (paths: string[]) => void) => listen('app:open-paths', cb),
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  pickFolder: (title?: string): Promise<string | null> => ipcRenderer.invoke('dialog:folder', title),
  pickFiles: (title?: string, filters?: { name: string; extensions: string[] }[]): Promise<string[] | null> => ipcRenderer.invoke('dialog:file', title, filters),
  exportPdf: (name: string): Promise<string | null> => ipcRenderer.invoke('export:pdf', String(name)),
  print: (): Promise<void> => ipcRenderer.invoke('print'),
  setTitle: (title: string) => ipcRenderer.send('win:title', String(title)),
  setTitleBarTheme: (t: { color: string; symbolColor: string; dark: boolean }) => ipcRenderer.send('win:titlebar', t),
  reveal: (p: string) => ipcRenderer.send('shell:reveal', String(p)),
  openPath: (p: string) => ipcRenderer.send('shell:openPath', String(p)),
  openExternal: (url: string) => ipcRenderer.send('shell:open', String(url)),
  // ---- updates (the Rowlit updater)
  onUpdateStatus: (cb: (s: unknown) => void) => listen('update:status', cb),
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  checkForUpdates: (opts?: { manual?: boolean }) => ipcRenderer.invoke('update:check', { manual: opts?.manual === true }),
  configureUpdates: (opts: { autoCheck: boolean }) => ipcRenderer.invoke('update:configure', { autoCheck: opts?.autoCheck === true }),
  quitAndInstall: () => ipcRenderer.invoke('update:install'),
  cancelUpdateDownload: () => ipcRenderer.invoke('update:cancel'),
  showNotification: (n: { title: string; body: string }) => void ipcRenderer.invoke('notify', { title: String(n?.title ?? ''), body: String(n?.body ?? '') }),
});
