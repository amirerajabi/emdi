// Folio was called Emdi until 0.3.0. An Emdi install that updates to Folio keeps what the user had:
//   1. the profile folder: Electron keeps it under the product name, so Emdi's (window size, spelling dictionary, the
//      UI's storage) is copied to Folio's on the first start, before anything opens it;
//   2. the UI's settings, recent files and open tabs: they live in the browser storage of Emdi's origin (emdi://app),
//      which Folio's origin (folio://app) cannot read. A hidden window on the old origin hands them over once, and
//      Folio's window takes them in at start (ui/src/lib/storage.ts).
import { app, BrowserWindow, ipcMain } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const OLD_SCHEME = 'emdi';

/** Locks and sockets of a running Chromium profile: never copied. */
const SKIP = new Set(['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile', 'LOCK']);

/** Copies Emdi's profile folder to Folio's when Folio has none yet. Call before the app is ready. */
export function copyOldProfile(): boolean {
  const target = app.getPath('userData');
  const source = path.join(app.getPath('appData'), 'Emdi');
  if (fs.existsSync(target) || !fs.existsSync(source)) return false;
  try {
    fs.cpSync(source, target, { recursive: true, filter: (p) => !SKIP.has(path.basename(p)) });
    return true;
  } catch (e) {
    console.log(`[migrate] could not copy the Emdi profile: ${(e as Error).message}`);
    return false;
  }
}

let handed: Record<string, string> | null = null;

// Folio's window asks once, synchronously, before its stores read the storage
ipcMain.on('storage:imported', (e) => {
  e.returnValue = handed;
  handed = null;
});

/** Reads the UI storage of Emdi's origin in a hidden window (index.html#export-storage answers with it). */
export function readOldStorage(preload: string): Promise<void> {
  return new Promise((resolve) => {
    const w = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false } });
    const done = () => {
      clearTimeout(timer);
      ipcMain.removeListener('storage:export', take);
      if (!w.isDestroyed()) w.destroy();
      resolve();
    };
    const take = (_e: unknown, entries: unknown) => {
      if (entries && typeof entries === 'object') handed = Object.fromEntries(Object.entries(entries as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
      done();
    };
    const timer = setTimeout(done, 6000);
    ipcMain.on('storage:export', take);
    void w.loadURL(`${OLD_SCHEME}://app/index.html#export-storage`).catch(done);
  });
}
