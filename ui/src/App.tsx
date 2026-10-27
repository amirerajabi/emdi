import { useEffect } from 'react';
import { boot } from './app/boot';
import { installKeys } from './app/commands';
import { CommandPalette } from './components/CommandPalette';
import { MenuHost } from './components/common/Menu';
import { ConfirmDialog, PromptDialog, Toasts } from './components/common/Overlays';
import { Dock } from './components/Dock';
import { DocumentArea } from './components/DocumentArea';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { ShortcutSheet } from './components/ShortcutSheet';
import { StatusBar } from './components/StatusBar';
import { ToolStripe } from './components/ToolStripe';
import { TopBar } from './components/TopBar';
import { Welcome } from './components/Welcome';
import { useDocuments } from './store/documents';
import { useUi } from './store/ui';
import { useWorkspace } from './store/workspace';

export default function App() {
  const root = useWorkspace((s) => s.root);
  const hasDocs = useDocuments((s) => s.docs.length > 0);
  const focus = useUi((s) => s.focusMode);

  useEffect(() => {
    void boot();
    return installKeys();
  }, []);

  const started = !!root || hasDocs;
  return (
    <div className={`app${focus ? ' focus-mode' : ''}`}>
      <TopBar />
      <div className="main">
        {started ? (
          <>
            {!focus && <ToolStripe />}
            {!focus && <Dock />}
            <div className="center">
              <DocumentArea />
            </div>
          </>
        ) : (
          <div className="center">
            <Welcome />
          </div>
        )}
      </div>
      {!focus && <StatusBar />}
      <MenuHost />
      <CommandPalette />
      <SettingsDialog />
      <ShortcutSheet />
      <PromptDialog />
      <ConfirmDialog />
      <Toasts />
    </div>
  );
}
