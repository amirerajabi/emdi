// User-level actions shared by menus, the palette, the explorer and shortcuts.
import { readerScroll } from '../components/DocumentView';
import { basename, dirname, join, stem } from '../lib/paths';
import { platform } from '../platform';
import { activeDoc, isDirty, useDocuments } from '../store/documents';
import { useSettings } from '../store/settings';
import { askConfirm, askText, toast, useUi } from '../store/ui';
import { useWorkspace, type Recent } from '../store/workspace';

const MARKDOWN_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx'] },
  { name: 'Text', extensions: ['txt'] },
  { name: 'All files', extensions: ['*'] },
];

export async function openFile(): Promise<void> {
  const paths = await platform.pickFiles('Open Markdown file', MARKDOWN_FILTERS);
  if (!paths) return;
  for (const [i, p] of paths.entries()) await useDocuments.getState().open(p, { background: i < paths.length - 1 });
}

export async function openFolder(): Promise<void> {
  const path = await platform.pickFolder('Open folder');
  if (path) await useWorkspace.getState().openFolder(path);
}

/** Paths from the command line, a second instance, or files dropped on the window: folders open in the explorer. */
export async function openPaths(paths: string[]): Promise<void> {
  for (const p of paths) {
    const st = await platform.stat(p);
    if (!st) toast('warning', `${basename(p)} was not found`, p);
    else if (st.isDir) await useWorkspace.getState().openFolder(p);
    else await useDocuments.getState().open(p);
  }
}

export async function openRecent(r: Recent): Promise<void> {
  if (!(await platform.stat(r.path))) {
    toast('warning', `${r.name} is no longer there`, r.path);
    useWorkspace.getState().removeRecent(r.path);
    return;
  }
  if (r.isDir) await useWorkspace.getState().openFolder(r.path);
  else await useDocuments.getState().open(r.path);
}

const INVALID = /[<>:"|?*\u0000-\u001f\\/]/;

function validName(v: string): string | null {
  if (INVALID.test(v)) return 'The name contains characters that are not allowed in file names';
  if (v.endsWith('.') || v.endsWith(' ')) return 'A name cannot end with a dot or a space';
  return null;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e));

/** A new Markdown file in a folder, opened to write in (".md" is added when the name has no extension). */
export async function createFile(dir: string): Promise<void> {
  const name = await askText({ title: 'New Markdown file', label: `In ${basename(dir)}`, placeholder: 'notes.md', okLabel: 'Create', validate: validName });
  if (!name) return;
  const file = /\.[^.]+$/.test(name) ? name : `${name}.md`;
  const path = join(dir, file);
  const title = file.replace(/\.[^.]+$/, '');
  try {
    await platform.create(path, false, /\.(md|markdown|mdx)$/i.test(file) ? `# ${title}\n\n` : '');
    useWorkspace.getState().invalidateFiles();
    await useDocuments.getState().open(path, { mode: useSettings.getState().settings.newMode });
  } catch (e) {
    toast('error', `Could not create ${file}`, errorText(e));
  }
}

export async function createFolder(dir: string): Promise<void> {
  const name = await askText({ title: 'New folder', label: `In ${basename(dir)}`, placeholder: 'Folder name', okLabel: 'Create', validate: validName });
  if (!name) return;
  try {
    await platform.create(join(dir, name), true);
  } catch (e) {
    toast('error', 'Could not create the folder', errorText(e));
  }
}

export async function renamePath(path: string, isDir: boolean): Promise<void> {
  const name = basename(path);
  const dot = isDir ? -1 : name.lastIndexOf('.');
  const next = await askText({ title: `Rename ${isDir ? 'folder' : 'file'}`, value: name, select: [0, dot > 0 ? dot : name.length], okLabel: 'Rename', validate: validName });
  if (!next || next === name) return;
  const target = join(dirname(path), next);
  try {
    // unsaved edits go to the old file first, so nothing is lost on the way
    const open = useDocuments.getState().docs.filter((d) => d.path === path || d.path.toLowerCase().startsWith(path.toLowerCase() + (path.includes('\\') ? '\\' : '/')));
    for (const d of open) await useDocuments.getState().save(d.path);
    await platform.rename(path, target);
    useDocuments.getState().renamed(path, target);
    useWorkspace.getState().invalidateFiles();
  } catch (e) {
    toast('error', `Could not rename ${name}`, errorText(e));
  }
}

export async function deletePath(path: string, isDir: boolean): Promise<void> {
  const name = basename(path);
  const answer = await askConfirm({ title: `Delete ${isDir ? 'folder' : 'file'}`, message: `Move "${name}"${isDir ? ' and everything in it' : ''} to the ${platform.os === 'win32' ? 'Recycle Bin' : 'Trash'}?`, okLabel: 'Delete', danger: true });
  if (answer !== 'ok') return;
  try {
    await platform.trash(path);
    const gone = useDocuments.getState().docs.filter((d) => d.path === path || d.path.toLowerCase().startsWith(path.toLowerCase() + (path.includes('\\') ? '\\' : '/')));
    // saved tabs close; a tab with unsaved edits stays open as a new document, so the edits are not lost
    const clean = gone.filter((d) => !isDirty(d));
    useDocuments.setState({ docs: useDocuments.getState().docs.map((d) => (gone.includes(d) && isDirty(d) ? { ...d, untitled: true, saved: '' } : d)) });
    await useDocuments.getState().closeMany(clean.map((d) => d.path));
    useWorkspace.getState().invalidateFiles();
  } catch (e) {
    toast('error', `Could not delete ${name}`, errorText(e));
  }
}

export async function copyText(text: string, what = 'Path'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('info', `${what} copied`, undefined, 1500);
  } catch {
    toast('warning', 'Clipboard is not available');
  }
}

export async function exportPdf(): Promise<void> {
  const doc = activeDoc();
  if (!doc) return toast('info', 'Open a document first');
  if (!platform.exportPdf) return void platform.print();
  try {
    const file = await platform.exportPdf(stem(doc.path));
    if (file) useUi.getState().toast({ kind: 'success', text: 'Exported to PDF', detail: file, action: { label: 'Show in folder', run: () => platform.reveal(file) } });
  } catch (e) {
    toast('error', 'Could not export the PDF', e instanceof Error ? e.message : String(e));
  }
}

export function printDocument(): void {
  if (!activeDoc()) return toast('info', 'Open a document first');
  void platform.print();
}

/** Page Up / Down, Home / End on the reader. */
export function scrollReader(by: 'page' | '-page' | 'top' | 'bottom'): void {
  const el = readerScroll();
  if (!el) return;
  if (by === 'top') el.scrollTo({ top: 0, behavior: 'smooth' });
  else if (by === 'bottom') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  else el.scrollBy({ top: (by === 'page' ? 1 : -1) * el.clientHeight * 0.85, behavior: 'smooth' });
}
