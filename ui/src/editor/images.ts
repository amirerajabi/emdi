// Images pasted or dropped into the editor: saved in the image folder next to the document (Settings › Editor) and
// linked relative to it. A dropped image that is already near the document is linked where it is, not copied.
import type { EditorView } from '@codemirror/view';
import { basename, dirname, extname, isUnder, join, relativePath } from '../lib/paths';
import { platform } from '../platform';
import { activeDoc } from '../store/documents';
import { useSettings } from '../store/settings';
import { toast } from '../store/ui';
import { insertInline, linkTarget } from './format';

const IMAGE = /^image\/(png|jpe?g|gif|webp|svg\+xml|avif|bmp)$/;
const EXT: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/avif': '.avif', 'image/bmp': '.bmp' };

export const imageFiles = (list: FileList | null | undefined) => [...(list ?? [])].filter((f) => IMAGE.test(f.type));

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** A free name in the folder: name.png, name-1.png, name-2.png… */
async function freeName(dir: string, name: string): Promise<string> {
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length).replace(/[<>:"/\\|?*\s]+/g, '-') || 'image';
  for (let i = 0; ; i++) {
    const candidate = `${stem}${i ? `-${i}` : ''}${ext}`;
    if (!(await platform.stat(join(dir, candidate)))) return candidate;
  }
}

/** Saves (or links) the images and inserts their Markdown at the cursor. */
export async function insertImages(view: EditorView, files: File[]): Promise<void> {
  const doc = activeDoc();
  if (!doc || doc.untitled) {
    toast('info', 'Save the document first', 'Images are saved next to the document, so it needs a folder.');
    return;
  }
  const docDir = dirname(doc.path);
  const folder = useSettings.getState().settings.imageFolder.trim().replace(/^[\\/]+|[\\/]+$/g, '');
  const target = folder ? join(docDir, folder) : docDir;
  const links: string[] = [];
  for (const f of files) {
    try {
      const existing = platform.pathForFile?.(f);
      if (existing && isUnder(existing, docDir)) {
        links.push(`![${basename(existing).replace(/\.[^.]+$/, '')}](${linkTarget(relativePath(docDir, existing))})`);
        continue;
      }
      const original = f.name && f.name !== 'image.png' ? f.name : `image-${stamp()}${EXT[f.type] ?? '.png'}`;
      const name = await freeName(target, original);
      await platform.writeBytes(join(target, name), new Uint8Array(await f.arrayBuffer()));
      links.push(`![${name.replace(/\.[^.]+$/, '')}](${linkTarget(folder ? `${folder}/${name}` : name)})`);
    } catch (e) {
      toast('error', 'Could not save the image', e instanceof Error ? e.message : String(e));
    }
  }
  if (links.length) insertInline(view, links.join('\n'));
}
