// File access for the renderer: reading documents, listing folders (Markdown files and the folders that hold them) and
// watching the open documents and folder so the view reloads when a file changes on disk.
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

export const MARKDOWN = /\.(md|markdown|mdown|mkd|mdx)$/i;
/** Folders never listed: build output, dependencies and VCS metadata. */
export const IGNORED_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', 'bin', 'obj', '.vs', '.idea', '.vscode', 'dist', 'out', '.next', '.cache', '__pycache__', '.venv', 'venv', 'target']);
const MAX_FILE = 20 * 1024 * 1024;
const MAX_FILES = 20000;

export function readText(file: string): { text: string; mtime: number } {
  const st = fs.statSync(file);
  if (st.isDirectory()) throw new Error(`${path.basename(file)} is a folder`);
  if (st.size > MAX_FILE) throw new Error(`${path.basename(file)} is too large to show (${Math.round(st.size / 1048576)} MB)`);
  let text = fs.readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text, mtime: st.mtimeMs };
}

/** Writes through a temporary file next to the target, so a crash never leaves half a document. */
export function writeText(file: string, text: string): { mtime: number } {
  writeAtomic(file, Buffer.from(text, 'utf8'));
  return { mtime: fs.statSync(file).mtimeMs };
}

export function writeBytes(file: string, data: Uint8Array): void {
  writeAtomic(file, Buffer.from(data));
}

function writeAtomic(file: string, data: Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, data);
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

/** A new empty file or folder; fails when the name is taken. */
export function create(p: string, isDir: boolean, text = ''): void {
  if (fs.existsSync(p)) throw new Error(`${path.basename(p)} already exists`);
  if (isDir) fs.mkdirSync(p, { recursive: true });
  else {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text, { flag: 'wx' });
  }
}

export function rename(from: string, to: string): void {
  if (from.toLowerCase() !== to.toLowerCase() && fs.existsSync(to)) throw new Error(`${path.basename(to)} already exists`);
  fs.renameSync(from, to);
}

/** Folders first, then files, by name; `all` lists every file, not only Markdown. */
export function listDir(dir: string, all: boolean): FsEntry[] {
  const out: FsEntry[] = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (!IGNORED_DIRS.has(d.name.toLowerCase())) out.push({ name: d.name, path: p, isDir: true, size: 0 });
    } else if (d.isFile() && (all || MARKDOWN.test(d.name))) {
      let size = 0;
      try {
        size = fs.statSync(p).size;
      } catch {
        /* vanished */
      }
      out.push({ name: d.name, path: p, isDir: false, size });
    }
  }
  return out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.isDir ? -1 : 1));
}

/** Every Markdown file under a folder (for Search Everywhere), capped. */
export function listMarkdownFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of entries) {
      if (out.length >= MAX_FILES) return;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (!IGNORED_DIRS.has(d.name.toLowerCase())) walk(p);
      } else if (d.isFile() && MARKDOWN.test(d.name)) out.push(p);
    }
  };
  walk(root);
  return out;
}

export interface FsChanges {
  files: string[];
  dirs: string[];
}

/** Watches files and folders (recursively); changes are batched for 150 ms. */
export class FileWatcher {
  private watchers = new Map<string, fs.FSWatcher>();
  private files = new Set<string>();
  private dirs = new Set<string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly send: (changes: FsChanges) => void) {}

  set(paths: string[]): void {
    const want = new Set(paths.map((p) => path.normalize(p)));
    for (const [p, w] of this.watchers) {
      if (!want.has(p)) {
        w.close();
        this.watchers.delete(p);
      }
    }
    for (const p of want) {
      if (this.watchers.has(p)) continue;
      try {
        const dir = fs.statSync(p).isDirectory();
        const w = fs.watch(p, { recursive: dir }, (_event, name) => {
          if (!dir) this.queue(p, path.dirname(p));
          else if (name) {
            const full = path.join(p, name.toString());
            if (full.split(path.sep).some((seg) => IGNORED_DIRS.has(seg.toLowerCase()))) return;
            this.queue(full, path.dirname(full));
          }
        });
        w.on('error', () => {
          w.close();
          this.watchers.delete(p);
        });
        this.watchers.set(p, w);
      } catch {
        /* missing or unreadable: nothing to watch */
      }
    }
  }

  private queue(file: string, dir: string): void {
    this.files.add(file);
    this.dirs.add(dir);
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const changes = { files: [...this.files], dirs: [...this.dirs] };
      this.files.clear();
      this.dirs.clear();
      this.send(changes);
    }, 150);
  }

  dispose(): void {
    for (const w of this.watchers.values()) w.close();
    this.watchers.clear();
    if (this.timer) clearTimeout(this.timer);
  }
}
