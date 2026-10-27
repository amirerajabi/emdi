// User-level actions shared by menus, the palette, the explorer and shortcuts.
import { readerScroll } from '../components/DocumentView';
import { basename, stem } from '../lib/paths';
import { platform } from '../platform';
import { activeDoc, useDocuments } from '../store/documents';
import { toast, useUi } from '../store/ui';
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
