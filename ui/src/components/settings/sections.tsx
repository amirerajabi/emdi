import { Keyboard, Monitor, Moon, Sun } from 'lucide-react';
import { keyLabel } from '../../app/commands';
import { isMac } from '../../platform';
import { DEFAULT_SETTINGS, useSettings, ZOOM_STEPS } from '../../store/settings';
import { useUi } from '../../store/ui';
import { Card, FontPicker, Num, Row, Segmented, Select, ToggleRow } from './controls';
import { AppThemePicker, CodeThemePicker } from './ThemePicker';

const useS = () => useSettings((x) => x.prefs);
const up = (p: Parameters<ReturnType<typeof useSettings.getState>['update']>[0]) => useSettings.getState().update(p);

export function GeneralSection() {
  const s = useS();
  return (
    <>
      <Card title="Startup">
        <ToggleRow id="set-reopen" label="Reopen the last session" hint="When Emdi starts, open the folder and documents you had open" keywords="startup restore session recent tabs folder" checked={s.reopenLastSession} onChange={(v) => up({ reopenLastSession: v })} />
      </Card>
      <Card title="Files" description="Documents, tabs and the explorer.">
        <ToggleRow id="set-reload" label="Reload documents changed on disk" hint="Edit a file in another app and see the change here right away" keywords="auto reload live watch refresh change disk" checked={s.autoReload} onChange={(v) => up({ autoReload: v })} />
        <ToggleRow id="set-preview" label="Single click opens a preview tab" hint="The tab is replaced by the next file you click; scroll it or double-click to keep it" keywords="preview tab italic explorer" checked={s.previewTabs} onChange={(v) => up({ previewTabs: v })} />
        <ToggleRow id="set-allfiles" label="Show every file in the explorer" hint="Off: only Markdown files and the folders that hold them" keywords="hidden files explorer all markdown" checked={s.showAllFiles} onChange={(v) => up({ showAllFiles: v })} />
      </Card>
      <Card title="Keyboard">
        <Row label="Keyboard shortcuts" hint={`Every command and its keys (${keyLabel('Ctrl+K Ctrl+S')})`} keywords="keys bindings hotkeys keymap shortcuts">
          <button type="button" className="btn" onClick={() => useUi.getState().set({ settingsOpen: false, shortcutsOpen: true })}>
            <Keyboard size={16} /> Show shortcuts…
          </button>
        </Row>
      </Card>
    </>
  );
}

export function AppearanceSection() {
  const s = useS();
  return (
    <>
      <Card title="Color theme" description="The look of the whole window: the page, panels, menus, dialogs and the title bar.">
        <Row label="Mode" hint={`System follows ${isMac ? 'macOS' : 'Windows'} between your light and dark theme`} keywords="theme dark light system appearance">
          <Segmented
            label="Mode"
            value={s.theme}
            onChange={(v) => up({ theme: v })}
            options={[
              { value: 'system', label: 'System', icon: <Monitor size={14} /> },
              { value: 'light', label: 'Light', icon: <Sun size={14} /> },
              { value: 'dark', label: 'Dark', icon: <Moon size={14} /> },
            ]}
          />
        </Row>
        <Row label="Theme" stacked labelHidden keywords="color colour theme palette nord midnight violet paper solarized darcula intellij jetbrains">
          <AppThemePicker />
        </Row>
      </Card>
      <Card title="Code theme" description="Syntax colours of code blocks in documents.">
        <Row label="Code theme" stacked labelHidden keywords="code syntax highlighting theme rider darcula visual studio vscode github dracula monokai one dark solarized">
          <CodeThemePicker />
        </Row>
      </Card>
      <Card title="Window font" description="Menus, panels and dialogs; the document's fonts are under Reader.">
        <Row label="UI font" htmlFor="set-uif" hint="Empty = the system font" keywords="font family interface ui window menu segoe inter">
          <FontPicker id="set-uif" kind="ui" value={s.uiFontFamily} placeholder="System default" onChange={(v) => up({ uiFontFamily: v })} />
        </Row>
        <Row label="UI font size" htmlFor="set-uis" keywords="font size interface ui window zoom">
          <Num id="set-uis" value={s.uiFontSize} min={10} max={20} onChange={(v) => up({ uiFontSize: v })} />
        </Row>
      </Card>
    </>
  );
}

export function ReaderSection() {
  const s = useS();
  return (
    <>
      <Card title="Typography" description="How documents read: the font, its size and the space between lines.">
        <Row label="Reading font" keywords="font serif sans typeface reader document">
          <Segmented
            label="Reading font"
            value={s.readerFont}
            onChange={(v) => up({ readerFont: v })}
            options={[
              { value: 'sans', label: 'Sans' },
              { value: 'serif', label: 'Serif' },
              { value: 'system', label: 'System' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        </Row>
        {s.readerFont === 'custom' && (
          <Row label="Custom font" htmlFor="set-rf" hint="An installed font or a CSS font list" keywords="font family custom reader">
            <FontPicker id="set-rf" kind="ui" value={s.readerFontFamily} placeholder="e.g. Vazirmatn" onChange={(v) => up({ readerFontFamily: v })} />
          </Row>
        )}
        <Row label="Font size" htmlFor="set-rfs" hint="In pixels, before zoom" keywords="font text size reader">
          <Num id="set-rfs" value={s.readerFontSize} min={11} max={28} onChange={(v) => up({ readerFontSize: v })} />
        </Row>
        <Row label="Line spacing" htmlFor="set-lh" keywords="line height spacing leading">
          <Select<number> id="set-lh" value={s.lineHeight} options={[[1.45, 'Compact'], [1.6, 'Cozy'], [1.7, 'Comfortable'], [1.85, 'Relaxed'], [2, 'Double']]} onChange={(v) => up({ lineHeight: v })} />
        </Row>
        <Row label="Page width" keywords="content width column measure wide narrow full">
          <Segmented
            label="Page width"
            value={s.contentWidth}
            onChange={(v) => up({ contentWidth: v })}
            options={[
              { value: 'narrow', label: 'Narrow' },
              { value: 'normal', label: 'Normal' },
              { value: 'wide', label: 'Wide' },
              { value: 'full', label: 'Full' },
            ]}
          />
        </Row>
        <Row label="Zoom" htmlFor="set-zoom" hint={`${keyLabel('Ctrl+=')} and ${keyLabel('Ctrl+-')} change it, ${keyLabel('Ctrl+0')} resets`} keywords="zoom scale size">
          <Select<number> id="set-zoom" value={s.zoom} options={ZOOM_STEPS.map((z) => [z, `${z}%`])} onChange={(v) => up({ zoom: v })} />
        </Row>
        <Row label="Code font" htmlFor="set-cf" hint="Code blocks and inline code" keywords="font monospace code jetbrains mono cascadia consolas fira">
          <FontPicker id="set-cf" kind="mono" value={s.codeFontFamily} onChange={(v) => up({ codeFontFamily: v || DEFAULT_SETTINGS.codeFontFamily })} />
        </Row>
        <Row label="Reset typography" keywords="font reset default">
          <button type="button" className="btn" onClick={() => up({ readerFont: 'sans', readerFontFamily: '', readerFontSize: DEFAULT_SETTINGS.readerFontSize, lineHeight: DEFAULT_SETTINGS.lineHeight, contentWidth: 'normal', codeFontFamily: DEFAULT_SETTINGS.codeFontFamily, zoom: 100 })}>
            Restore defaults
          </button>
        </Row>
      </Card>
      <Card title="Layout">
        <ToggleRow id="set-toc" label="“On this page” beside the text" hint="The document's headings at the right of wide windows" keywords="toc table of contents outline headings floating" checked={s.floatingToc} onChange={(v) => up({ floatingToc: v })} />
        <ToggleRow id="set-num" label="Number the headings" hint="1, 1.1, 1.2… before second- to fourth-level headings" keywords="numbered headings numbers sections" checked={s.numberHeadings} onChange={(v) => up({ numberHeadings: v })} />
        <ToggleRow id="set-fm" label="Show front matter" hint="The YAML block at the top of a document, as a table" keywords="yaml front matter metadata" checked={s.showFrontMatter} onChange={(v) => up({ showFrontMatter: v })} />
      </Card>
      <Card title="Markdown" description="How the text is read.">
        <ToggleRow id="set-typo" label="Smart quotes and dashes" hint="“quotes”, ‘apostrophes’, – and — from straight quotes and hyphens" keywords="typographer quotes dashes smart" checked={s.typographer} onChange={(v) => up({ typographer: v })} />
        <ToggleRow id="set-breaks" label="Line breaks as written" hint="A single line break starts a new line (as in GitHub comments)" keywords="breaks newline line break" checked={s.breaks} onChange={(v) => up({ breaks: v })} />
        <ToggleRow id="set-linkify" label="Turn web addresses into links" keywords="linkify links url autolink" checked={s.linkify} onChange={(v) => up({ linkify: v })} />
        <ToggleRow id="set-math" label="Math" hint="$inline$ and $$display$$ formulas with KaTeX" keywords="math latex katex formula equation" checked={s.math} onChange={(v) => up({ math: v })} />
        <ToggleRow id="set-mermaid" label="Mermaid diagrams" hint="```mermaid code blocks drawn as flowcharts, sequence diagrams and more" keywords="mermaid diagram chart flowchart sequence" checked={s.mermaid} onChange={(v) => up({ mermaid: v })} />
      </Card>
    </>
  );
}
