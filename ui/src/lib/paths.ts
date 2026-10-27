// Path helpers that work for both Windows (C:\x\y) and POSIX paths, as the desktop shell hands them out.

export const sepOf = (p: string) => (p.includes('\\') ? '\\' : '/');

export function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return i >= 0 ? p.slice(i + 1) : p;
}

export function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  if (i <= 0) return p;
  const d = p.slice(0, i);
  return /^[A-Za-z]:$/.test(d) ? d + '\\' : d;
}

export function join(dir: string, ...parts: string[]): string {
  const sep = sepOf(dir);
  return [dir.replace(/[\\/]+$/, ''), ...parts.map((x) => x.replace(/^[\\/]+|[\\/]+$/g, ''))].filter(Boolean).join(sep);
}

export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i).toLowerCase() : '';
}

export function stem(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(0, i) : b;
}

/** Windows paths compare case-insensitively. */
export function samePath(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return norm(a) === norm(b);
}

export function norm(p: string): string {
  const s = p.replace(/[\\/]+$/, '');
  return /^[A-Za-z]:/.test(s) || s.includes('\\') ? s.replace(/\//g, '\\').toLowerCase() : s;
}

export function isUnder(p: string, dir: string): boolean {
  const a = norm(p);
  const d = norm(dir);
  return a.startsWith(d + (d.includes('\\') ? '\\' : '/'));
}

export function relative(root: string | undefined, p: string): string {
  if (!root) return p;
  if (samePath(root, p)) return '';
  return isUnder(p, root) ? p.slice(root.replace(/[\\/]+$/, '').length + 1) : p;
}

/** A relative path (as written in a link) against a folder, with . and .. resolved. */
export function resolvePath(dir: string, rel: string): string {
  const sep = sepOf(dir);
  if (/^([A-Za-z]:[\\/]|[\\/])/.test(rel)) return rel.replace(/[\\/]/g, sep);
  const parts = dir.replace(/[\\/]+$/, '').split(/[\\/]/);
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === '..') {
      if (parts.length > 1) parts.pop();
    } else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join(sep);
}

/** The emdi-file:// URL that serves a local image to the window (desktop/src/main.ts). */
export function fileUrl(path: string): string {
  const p = path.replace(/\\/g, '/');
  return `emdi-file://${p.startsWith('/') ? '' : '/'}${p.split('/').map(encodeURIComponent).join('/').replace(/^\/([A-Za-z])%3A/, '/$1:')}`;
}

/** The path of `to` as seen from the folder `from` (../ where needed); `to` itself when they share no root. */
export function relativePath(from: string, to: string): string {
  const a = norm(from).split(/[\\/]/);
  const b = to.replace(/[\\/]+$/, '').split(/[\\/]/);
  const bn = norm(to).split(/[\\/]/);
  if (a[0] !== bn[0]) return to;
  let i = 0;
  while (i < a.length && i < bn.length && a[i] === bn[i]) i++;
  return [...Array(a.length - i).fill('..'), ...b.slice(i)].join('/') || '.';
}
