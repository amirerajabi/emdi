import { Braces, Code2, File, FileCode2, FileJson, FileText, Folder, FolderOpen, Image, Settings2 } from 'lucide-react';
import { basename, extname } from '../../lib/paths';

/** The Folio mark: an F whose bars read as lines of text, over an amber line, on a navy tile (the app icon, desktop/build/make-icon.mjs). */
export function FolioMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      <defs>
        <linearGradient id="folio-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--brand-tile-top)" />
          <stop offset="1" stopColor="var(--brand-tile-bottom)" />
        </linearGradient>
        <linearGradient id="folio-f" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand-k-start)" />
          <stop offset="1" stopColor="var(--brand-k-end)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#folio-tile)" />
      <path d="M17 47V17H47M17 30H38" stroke="url(#folio-f)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M28 43H40" stroke="var(--brand-dot)" strokeWidth="5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function FileIcon({ path, isDir, open, size = 15 }: { path: string; isDir?: boolean; open?: boolean; size?: number }) {
  if (isDir) return open ? <FolderOpen size={size} className="ic-folder" /> : <Folder size={size} className="ic-folder" />;
  const ext = extname(path);
  const name = basename(path).toLowerCase();
  if (['.md', '.markdown', '.mdown', '.mkd', '.mdx'].includes(ext)) return <FileText size={size} className="ic-md" />;
  if (ext === '.json') return <FileJson size={size} className="ic-json" />;
  if (['.html', '.htm', '.css', '.scss', '.js', '.ts', '.tsx', '.jsx'].includes(ext)) return <Code2 size={size} className="ic-web" />;
  if (['.cs', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h'].includes(ext)) return <FileCode2 size={size} className="ic-cs" />;
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp'].includes(ext)) return <Image size={size} className="ic-file" />;
  if (name.startsWith('.') || ext === '.yml' || ext === '.yaml' || ext === '.toml') return <Settings2 size={size} className="ic-file" />;
  if (ext === '.xml') return <Braces size={size} className="ic-xml" />;
  return <File size={size} className="ic-file" />;
}
