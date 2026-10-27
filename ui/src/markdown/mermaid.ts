// Mermaid diagrams, loaded on first use (the library is large). Each .md-mermaid placeholder gets its SVG beside the
// hidden source; a diagram that fails shows its source with the error under it.
import { effectiveTheme } from '../store/settings';

type Mermaid = typeof import('mermaid').default;
let loading: Promise<Mermaid> | null = null;
let themed: string | null = null;
let seq = 0;

function load(): Promise<Mermaid> {
  loading ??= import('mermaid').then((m) => m.default);
  return loading;
}

export async function renderMermaid(root: HTMLElement): Promise<void> {
  const blocks = [...root.querySelectorAll<HTMLElement>('.md-mermaid:not([data-done])')];
  if (!blocks.length) return;
  const mermaid = await load();
  const theme = effectiveTheme() === 'dark' ? 'dark' : 'default';
  if (themed !== theme) {
    mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'strict', fontFamily: 'var(--font-reader)' });
    themed = theme;
  }
  for (const el of blocks) {
    el.dataset.done = '1';
    // the source is the hidden <pre> (an attribute would lose "-->" to the sanitiser)
    const source = el.querySelector('.md-mermaid-src')?.textContent ?? '';
    try {
      const { svg } = await mermaid.render(`emdi-mermaid-${++seq}`, source);
      const out = document.createElement('div');
      out.className = 'md-mermaid-svg';
      out.innerHTML = svg;
      el.appendChild(out);
    } catch (e) {
      const err = document.createElement('div');
      err.className = 'md-mermaid-error';
      err.textContent = `Diagram error: ${e instanceof Error ? e.message : String(e)}`;
      el.appendChild(err);
    }
  }
}

/** The theme changed: draw the diagrams again in its colours. */
export function resetMermaid(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>('.md-mermaid[data-done]')) {
    delete el.dataset.done;
    el.querySelectorAll('.md-mermaid-svg, .md-mermaid-error').forEach((x) => x.remove());
  }
}
