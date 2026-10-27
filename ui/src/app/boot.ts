// Start-up: theme and fonts, the last session, files from the command line, live reload and the window title.
import { basename, samePath } from '../lib/paths';
import { loadRaw } from '../lib/storage';
import { platform } from '../platform';
import { installAutoSave, restoreSession, useDocuments } from '../store/documents';
import { onSystemThemeChange, useSettings } from '../store/settings';
import { toast } from '../store/ui';
import { useWorkspace } from '../store/workspace';
import { applyThemes } from '../theme/applyTheme';
import { applyFonts } from '../theme/fonts';
import { openPaths } from './actions';
import { installUpdateWiring } from './updates';

let booted = false;

export async function boot(): Promise<void> {
  if (booted) return;
  booted = true;
  document.documentElement.classList.add(`os-${platform.os}`);
  if (platform.titleBar === 'overlay') document.documentElement.classList.add('titlebar-overlay');
  if (platform.titleBar === 'inset') document.documentElement.classList.add('titlebar-inset');

  applyThemes();
  applyFonts();
  useSettings.subscribe((s, prev) => {
    const a = s.settings, b = prev.settings;
    if (a.uiFontFamily !== b.uiFontFamily || a.uiFontSize !== b.uiFontSize) applyFonts();
    if (a.theme !== b.theme || a.appThemeLight !== b.appThemeLight || a.appThemeDark !== b.appThemeDark || a.codeTheme !== b.codeTheme) applyThemes();
  });
  onSystemThemeChange(() => useSettings.getState().settings.theme === 'system' && applyThemes());

  // files changed on disk: reload the open documents (Auto reload)
  platform.onFsChanged((c) => {
    if (!useSettings.getState().settings.autoReload) return;
    for (const d of useDocuments.getState().docs) if (c.files.some((f) => samePath(f, d.path))) void useDocuments.getState().reload(d.path, true);
  });
  window.addEventListener('focus', () => {
    // a document edited elsewhere while the window was in the background (some editors replace the file)
    if (!useSettings.getState().settings.autoReload) return;
    const d = useDocuments.getState().docs.find((x) => x.path === useDocuments.getState().active);
    if (d && !d.loading)
      void platform.stat(d.path).then((st) => {
        if (st && st.mtime !== d.mtime) void useDocuments.getState().reload(d.path, true);
      });
  });

  // the last session, then what the command line asked for (later ones arrive through onOpenPaths)
  platform.onOpenPaths((paths) => void openPaths(paths));
  const fromArgs = await platform.pendingPaths().catch(() => [] as string[]);
  if (useSettings.getState().settings.reopenLastSession) {
    const root = loadRaw<string | null>('session.root', null);
    if (root && (await platform.stat(root))?.isDir) await useWorkspace.getState().openFolder(root);
    await restoreSession().catch(() => undefined);
  }
  await openPaths(fromArgs);
  installDrop();
  installAutoSave();
  installUpdateWiring();

  // window title follows the document and folder
  const title = () => {
    const active = useDocuments.getState().active;
    const root = useWorkspace.getState().root;
    const doc = useDocuments.getState().docs.find((d) => d.path === active);
    const name = doc ? `${doc.text !== doc.saved && !doc.loading ? '● ' : ''}${doc.title}` : null;
    platform.setTitle([name, root ? basename(root) : null, 'Emdi'].filter(Boolean).join(' – '));
  };
  useWorkspace.subscribe(title);
  useDocuments.subscribe(title);
  title();
}

/** Markdown files and folders dropped on the window open like Open File / Open Folder. */
function installDrop(): void {
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  window.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    const paths = [...e.dataTransfer.files].map((f) => platform.pathForFile?.(f) ?? '').filter(Boolean);
    if (paths.length) void openPaths(paths);
    else toast('info', 'Use Open File to open documents in the browser preview');
  });
}
