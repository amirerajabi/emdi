// Folio desktop shell: one window, the UI on folio://app (or the Vite dev server), files read by the main process.
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, Notification, protocol, screen, shell } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { create, FileWatcher, listDir, listMarkdownFiles, readText, rename, writeBytes, writeText } from './files';
import { copyOldProfile, OLD_SCHEME, readOldStorage } from './migrate';
import { createUpdater } from './updater';
import type { UpdateController } from './updater-core';

const DEV_URL = process.env.FOLIO_DEV_URL;
const repoRoot = path.resolve(__dirname, '..', '..');
const uiDir = app.isPackaged ? path.join(process.resourcesPath, 'ui') : path.join(repoRoot, 'ui', 'dist');
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
/** The app icon for the window and the taskbar: resources/icon.png when installed, build/icon.png in dev. */
const iconFile = app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '..', 'build', 'icon.png');
const smokeTest = !!process.env.FOLIO_SMOKE_SHOT;

// Windows groups taskbar buttons (and picks their icon) by AppUserModelId: the installer's shortcut uses the appId,
// so the running window must too, or the taskbar shows the default Electron icon. (Still Emdi's: see electron-builder.yml.)
if (process.platform === 'win32') app.setAppUserModelId('dev.emdi.app');

// one window and no navigation: Chromium's spare renderer process (kept warm for the next site) is only memory
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess');

protocol.registerSchemesAsPrivileged([
  { scheme: 'folio', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: true } },
  // local images and media referenced by a document: folio-file:///C:/docs/img.png
  { scheme: 'folio-file', privileges: { secure: true, supportFetchAPI: true, stream: true } },
  // Emdi's origin, only to hand its storage over once (migrate.ts)
  { scheme: OLD_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

// a smoke test runs beside an installed Folio: its own profile, no single-instance hand-off
if (smokeTest) app.setPath('userData', path.join(app.getPath('temp'), `folio-smoke-${process.pid}`));
else if (!app.requestSingleInstanceLock()) app.quit();
// a smoke test can try the hand-over into its own profile (FOLIO_SMOKE_MIGRATE=1)
const fromEmdi = (!smokeTest || process.env.FOLIO_SMOKE_MIGRATE === '1') && copyOldProfile();

let win: BrowserWindow | null = null;
let updater: UpdateController | null = null;
const updaterReady = app.whenReady().then(() => createUpdater((m) => console.log(`[updates] ${m}`), smokeTest)).then((u) => (updater = u));
const watcher = new FileWatcher((changes) => win?.webContents.send('fs:changed', changes));

/** Markdown files passed on the command line (double-click in Explorer, "Open with"), or by macOS open-file. */
const pendingPaths: string[] = [];
const MD_FILE = /\.(md|markdown|mdown|mkd|mdx)$/i;
function pathsFromArgv(argv: string[]): string[] {
  return argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('-') && (MD_FILE.test(a) || isDir(a))).map((a) => path.resolve(a));
}
function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
/** The renderer asks for pendingPaths once it listens; until then paths wait in the queue. */
let rendererReady = false;
function openPaths(paths: string[]): void {
  if (!paths.length) return;
  if (win && rendererReady) win.webContents.send('app:open-paths', paths);
  else pendingPaths.push(...paths);
}
pendingPaths.push(...pathsFromArgv(process.argv));
app.on('open-file', (e, p) => {
  e.preventDefault();
  openPaths([p]);
});

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http: folio-file:",
  "media-src 'self' https: folio-file:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
].join('; ');

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

function loadState(): WindowState {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as WindowState;
    if (s.width >= 600 && s.height >= 400) {
      if (s.x !== undefined && s.y !== undefined) {
        const area = screen.getDisplayMatching({ x: s.x, y: s.y, width: s.width, height: s.height }).workArea;
        if (s.x + 100 > area.x + area.width || s.y + 50 > area.y + area.height) return { width: s.width, height: s.height, maximized: s.maximized };
      }
      return s;
    }
  } catch {
    /* first start */
  }
  return { width: 1280, height: 860 };
}

function createWindow(): void {
  const state = loadState();
  const dark = nativeTheme.shouldUseDarkColors;
  const chrome: Electron.BrowserWindowConstructorOptions =
    process.platform === 'win32'
      ? { titleBarStyle: 'hidden', titleBarOverlay: { color: dark ? '#1b1d21' : '#f5f6f8', symbolColor: dark ? '#e6e8eb' : '#1c1f24', height: 40 } }
      : process.platform === 'darwin'
        ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 13 } }
        : {};
  win = new BrowserWindow({
    ...state,
    minWidth: 640,
    minHeight: 420,
    show: false,
    title: 'Folio',
    backgroundColor: dark ? '#1b1d21' : '#f5f6f8',
    ...(fs.existsSync(iconFile) ? { icon: iconFile } : {}),
    autoHideMenuBar: true,
    ...chrome,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
      additionalArguments: [`--folio-version=${app.getVersion()}`],
    },
  });
  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => win?.show());
  win.setMenu(null);

  const save = () => {
    if (!win) return;
    const b = win.getNormalBounds();
    try {
      fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
      fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
    } catch {
      /* best effort */
    }
  };
  win.on('close', save);
  // the UI saves what Auto Save would (it answers app:close-ok), then the window really closes
  let closing = false;
  win.on('close', (e) => {
    if (closing || !win) return;
    e.preventDefault();
    const w = win;
    const go = () => {
      if (closing) return;
      closing = true;
      ipcMain.removeListener('app:close-ok', go);
      w.close();
    };
    ipcMain.once('app:close-ok', go);
    setTimeout(go, 5000);
    w.webContents.send('app:before-close');
  });
  win.on('closed', () => (win = null));

  // the renderer reports unsaved documents through beforeunload
  win.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(win!, {
      type: 'question',
      buttons: ['Quit without saving', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved changes',
      message: 'Some documents have unsaved changes.',
      detail: 'Quit and lose the changes?',
    });
    if (choice === 0) e.preventDefault();
  });

  // the window only ever shows Folio; links open in the browser
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('folio://app') && !(DEV_URL && url.startsWith(DEV_URL))) {
      e.preventDefault();
      if (/^(https?|mailto):/.test(url)) void shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // right-click in the editor: spelling suggestions, then cut / copy / paste
  win.webContents.on('context-menu', (_e, p) => {
    if (!p.isEditable || !win) return;
    const wc = win.webContents;
    const items: Electron.MenuItemConstructorOptions[] = [];
    if (p.misspelledWord) {
      for (const s of p.dictionarySuggestions.slice(0, 6)) items.push({ label: s, click: () => wc.replaceMisspelling(s) });
      if (!p.dictionarySuggestions.length) items.push({ label: 'No suggestions', enabled: false });
      items.push({ label: 'Add to Dictionary', click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) }, { type: 'separator' });
    }
    items.push(
      { label: 'Cut', role: 'cut', enabled: p.editFlags.canCut },
      { label: 'Copy', role: 'copy', enabled: p.editFlags.canCopy },
      { label: 'Paste', role: 'paste', enabled: p.editFlags.canPaste },
      { type: 'separator' },
      { label: 'Select All', role: 'selectAll' },
    );
    Menu.buildFromTemplate(items).popup({ window: win });
  });
  if (DEV_URL) win.webContents.on('before-input-event', (_e, input) => input.key === 'F12' && input.control && input.shift && win?.webContents.toggleDevTools());
  win.webContents.on('did-start-loading', () => (rendererReady = false));

  void win.loadURL(DEV_URL ?? 'folio://app/index.html');

  // smoke test: FOLIO_SMOKE_SHOT=out.png captures the window once the UI has settled, then quits
  const shot = process.env.FOLIO_SMOKE_SHOT;
  if (shot) {
    win.webContents.on('console-message', (e) => console.log(`[renderer] ${e.level}: ${e.message}`));
    win.webContents.once('did-finish-load', () =>
      setTimeout(async () => {
        const img = await win!.webContents.capturePage();
        fs.writeFileSync(shot, img.toPNG());
        app.quit();
      }, Number(process.env.FOLIO_SMOKE_DELAY ?? 4000)),
    );
  }
}

const absolute = (p: unknown): string => {
  if (typeof p !== 'string' || !path.isAbsolute(p)) throw new Error('An absolute path is required');
  return path.normalize(p);
};

// ---- files
ipcMain.handle('fs:read', (_e, p: string) => readText(absolute(p)));
ipcMain.handle('fs:list', (_e, dir: string, opts?: { all?: boolean }) => listDir(absolute(dir), opts?.all === true));
ipcMain.handle('fs:files', (_e, root: string) => listMarkdownFiles(absolute(root)));
ipcMain.handle('fs:watch', (_e, paths: string[]) => watcher.set(Array.isArray(paths) ? paths.filter((p) => typeof p === 'string' && path.isAbsolute(p)) : []));
ipcMain.handle('fs:stat', (_e, p: string) => {
  try {
    const s = fs.statSync(absolute(p));
    return { isDir: s.isDirectory(), size: s.size, mtime: s.mtimeMs };
  } catch {
    return null;
  }
});
ipcMain.handle('fs:write', (_e, p: string, text: string) => writeText(absolute(p), String(text)));
ipcMain.handle('fs:writeBytes', (_e, p: string, data: Uint8Array) => {
  if (!(data instanceof Uint8Array)) throw new Error('No data');
  writeBytes(absolute(p), data);
});
ipcMain.handle('fs:create', (_e, p: string, isDir: boolean, text?: string) => create(absolute(p), isDir === true, typeof text === 'string' ? text : ''));
ipcMain.handle('fs:rename', (_e, from: string, to: string) => rename(absolute(from), absolute(to)));
ipcMain.handle('fs:trash', (_e, p: string) => shell.trashItem(absolute(p)));
ipcMain.handle('dialog:save', async (_e, title?: string, defaultPath?: string) => {
  const r = await dialog.showSaveDialog(win!, {
    title: title ?? 'Save',
    defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] }, { name: 'All files', extensions: ['*'] }],
  });
  return r.canceled ? null : (r.filePath ?? null);
});
ipcMain.handle('app:pending-paths', () => {
  rendererReady = true;
  return pendingPaths.splice(0);
});

ipcMain.handle('dialog:folder', async (_e, title?: string) => {
  const r = await dialog.showOpenDialog(win!, { title: title ?? 'Open folder', properties: ['openDirectory'] });
  return r.canceled ? null : (r.filePaths[0] ?? null);
});
ipcMain.handle('dialog:file', async (_e, title?: string, filters?: Electron.FileFilter[]) => {
  const r = await dialog.showOpenDialog(win!, { title: title ?? 'Open file', properties: ['openFile', 'multiSelections'], filters: Array.isArray(filters) ? filters : undefined });
  return r.canceled ? null : r.filePaths;
});
ipcMain.handle('export:pdf', async (_e, name: string) => {
  if (!win) return null;
  const r = await dialog.showSaveDialog(win, { title: 'Export to PDF', defaultPath: `${String(name || 'document').replace(/[<>:"/\\|?*]/g, '_')}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null;
  const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 } });
  fs.writeFileSync(r.filePath, data);
  return r.filePath;
});
ipcMain.handle('print', () => win?.webContents.print({ printBackground: true }));
ipcMain.on('win:title', (_e, title: string) => win?.setTitle(String(title).slice(0, 300)));
ipcMain.on('win:titlebar', (_e, t: { color: string; symbolColor: string; dark: boolean }) => {
  const hex = /^#[0-9a-f]{6}$/i;
  nativeTheme.themeSource = t?.dark ? 'dark' : 'light';
  if (process.platform === 'win32' && win && hex.test(t?.color) && hex.test(t?.symbolColor)) win.setTitleBarOverlay({ color: t.color, symbolColor: t.symbolColor, height: 40 });
});
ipcMain.on('shell:reveal', (_e, p: string) => {
  if (typeof p === 'string' && path.isAbsolute(p)) shell.showItemInFolder(p);
});
ipcMain.on('shell:open', (_e, url: string) => {
  if (typeof url === 'string' && /^(https?|mailto):/.test(url)) void shell.openExternal(url);
});
ipcMain.on('shell:openPath', (_e, p: string) => {
  if (typeof p === 'string' && path.isAbsolute(p)) void shell.openPath(p);
});

// ---- updates (the Rowlit updater: status pushed as update:status)
ipcMain.handle('update:status', async () => (await updaterReady).status);
ipcMain.handle('update:check', async (_e, opts?: { manual?: boolean }) => (await updaterReady).check({ manual: opts?.manual === true }));
ipcMain.handle('update:configure', async (_e, opts?: { autoCheck?: boolean }) => (await updaterReady).configure({ autoCheck: opts?.autoCheck === true }));
ipcMain.handle('update:install', async () => (await updaterReady).quitAndInstall());
ipcMain.handle('update:cancel', async () => (await updaterReady).stopDownload());
ipcMain.handle('notify', (_e, n: { title?: string; body?: string }) => {
  if (win && !win.isFocused() && Notification.isSupported()) new Notification({ title: String(n?.title ?? 'Folio'), body: String(n?.body ?? ''), icon: iconFile }).show();
});

app.on('second-instance', (_e, argv) => {
  openPaths(pathsFromArgv(argv));
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

/** Images, video and other media a document may embed; anything else is not served. */
const MEDIA = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico|mp4|webm|ogg|mp3|wav)$/i;

app.whenReady().then(async () => {
  // folio://app/<path> serves the built UI (and emdi://app the same files, for the hand-over from Emdi)
  const serveUi = async (req: Request) => {
    const url = new URL(req.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(uiDir, rel));
    if (!file.startsWith(uiDir)) return new Response('Not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    if (!rel.endsWith('.html')) return res;
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', CSP);
    return new Response(res.body, { status: res.status, headers });
  };
  protocol.handle('folio', serveUi);
  protocol.handle(OLD_SCHEME, serveUi);
  // folio-file:///C:/dir/img.png → the local image next to the document
  protocol.handle('folio-file', (req) => {
    const url = new URL(req.url);
    let p = decodeURIComponent(url.pathname);
    if (process.platform === 'win32') p = p.replace(/^\/+/, '');
    if (!path.isAbsolute(p) || !MEDIA.test(p)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(path.normalize(p)).toString());
  });

  if (!DEV_URL && !fs.existsSync(path.join(uiDir, 'index.html'))) {
    dialog.showErrorBox('Folio', `The UI is not built (${uiDir}). Run "npm run build" in the ui folder.`);
    app.quit();
    return;
  }
  if (fromEmdi) {
    handingOver = true;
    await readOldStorage(path.join(__dirname, 'preload.js'));
  }
  createWindow();
  handingOver = false;
});

// the hidden hand-over window closing is not the last window closing
let handingOver = false;
app.on('window-all-closed', () => !handingOver && app.quit());
app.on('before-quit', () => {
  updater?.dispose();
  watcher.dispose();
});
