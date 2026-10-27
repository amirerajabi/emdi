import { isMac } from '../platform';

/** "Mod-Shift-8" → "Ctrl+Shift+8" (⌘⇧8 on macOS), as menus and tooltips show keys. */
export function keyText(key: string): string {
  const parts = key.split('-').map((p) => (p === '' ? '-' : p));
  const names = parts.map((p) => (p === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : p === 'Alt' ? (isMac ? '⌥' : 'Alt') : p === 'Shift' ? (isMac ? '⇧' : 'Shift') : p.length === 1 ? p.toUpperCase() : p));
  return isMac ? names.join('') : names.join('+');
}
