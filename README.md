# Emdi

A beautiful Markdown viewer: open a `.md` file or a folder of them and read them the way they were meant to look, with
GitHub-flavoured Markdown, highlighted code, math, diagrams, an outline and live reload, in light and dark themes.

Emdi follows the architecture and UI structure of [Kod](https://github.com/amirerajabi/kod) (and Rowlit): an
**Electron** shell and a **React** UI, with the same top bar, tool window stripe, side panel, tabs, status bar, Search
Everywhere, Settings, themes and self-updater. Viewing is the first step; editing and writing Markdown come next, on the
same documents store.

```
desktop/   Electron shell: window (Windows caption overlay, macOS inset), emdi://app protocol, emdi-file:// for local
           images, file reading / listing / watching, .md file association, PDF export, the updater
ui/        React UI: top bar, tool window stripe, side panel (Explorer, Outline, Find in Files), document tabs,
           the reader, status bar, palette, settings, dialogs
  markdown/   markdown-it with GitHub's extensions, KaTeX, highlight.js, Mermaid; the reader's styles
docs/      release notes
```

## Features

**Reading**
- GitHub-flavoured Markdown: tables, task lists, footnotes, alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`,
  `[!CAUTION]`), emoji shortcodes, definition lists, `==highlight==`, `H~2~O`, `x^2^`, autolinks and smart quotes.
- YAML front matter shown as a table above the document.
- Code blocks highlighted in the chosen code theme, with the language and a copy button.
- Math with KaTeX (`$inline$`, `$$display$$`) and Mermaid diagrams (```` ```mermaid ````), drawn in the current theme.
- Right-to-left text (Persian, Arabic, Hebrew) reads right-to-left, block by block (`dir="auto"`).
- Links to other Markdown files open in Emdi at the linked `#heading`; local images are shown; web links open in the
  browser; other files open in their default app.
- Documents reload when their file changes on disk.

**Finding your way**
- Explorer for a folder: Markdown files and the folders that hold them (or every file), following the active tab.
- Outline of the document's headings with a filter, highlighting the heading in view; "On this page" beside the text on
  wide windows.
- Search Everywhere (Shift Shift): files, `>` actions, `#` headings of the document. Recent Files (Ctrl+E).
- Find in the document (Ctrl+F) and Find in Files (Ctrl+Shift+F) across the folder.
- Tabs with preview tabs (single click replaces, scroll or double-click keeps), drag to reorder, the last session
  restored at start.

**Look**
- Kod's colour themes (Light, Paper, Solarized Light, IntelliJ Light, Dark, Midnight, Nord, Violet, Darcula) with System
  mode, and its code themes for code blocks.
- Reading font (sans, serif, system or your own), font size, line spacing, page width, zoom, numbered headings.
- Reading mode (F11) hides everything but the page.

**Desktop**
- Open `.md` files from Explorer / Finder (file association), from the command line, or drop them on the window.
- Export to PDF and Print.
- Updates from GitHub Releases: downloaded in the background, then "Restart to update" (as in Kod).

## Requirements

- Node.js 22+ and npm, to build the UI and the shell.

## Run it

```powershell
pwsh scripts/dev.ps1              # Vite with hot reload, Electron on top
pwsh scripts/dev.ps1 README.md    # the same, opening a file
pwsh scripts/dev.ps1 -Browser     # Vite only; open the printed URL in a browser
```

Or step by step:

```powershell
cd ui; npm install; npm run build; cd ..
cd desktop; npm install; npm start
```

`EMDI_DEV_URL` loads the UI from a dev server. `EMDI_SMOKE_SHOT=out.png` captures the window once the UI has settled
and quits (with the renderer's console on stdout).

## Package

```powershell
pwsh scripts/build.ps1          # UI build + electron-builder installer in desktop/dist
pwsh scripts/build.ps1 -Dir     # unpacked app folder
```

## CI and releases

- **CI** (`.github/workflows/ci.yml`): on every push to `main` and every pull request, on Windows and Linux: version
  check, UI type-check and build, desktop type-check and bundle.
- **Release** (`.github/workflows/release.yml`): push a tag `vX.Y.Z` matching `desktop/package.json` (both version files
  must agree) with `docs/release-notes/vX.Y.Z.md`. Windows (NSIS), macOS (DMG + ZIP, arm64) and Linux (AppImage) build
  on their own runners; the update metadata (`latest*.yml`) is checked against the assets and everything is published
  as the GitHub Release the in-app updater reads.

```bash
git tag v0.1.0 && git push origin v0.1.0
```

## Keyboard

| Action | Keys |
|---|---|
| Search everywhere / find action | Shift Shift, Ctrl+Shift+N / Ctrl+Shift+A, Ctrl+Shift+P, F1 |
| Open file / open folder | Ctrl+O / Ctrl+K Ctrl+O |
| Go to heading / recent files | Ctrl+Shift+O / Ctrl+E |
| Find in document / find in files | Ctrl+F / Ctrl+Shift+F |
| Next / previous tab / close tab | Ctrl+Tab / Ctrl+Shift+Tab / Ctrl+W |
| Explorer / outline / side panel | Alt+1 / Alt+7 / Ctrl+B |
| Reading mode | F11 (Escape leaves it) |
| Zoom in / out / reset | Ctrl+= / Ctrl+- / Ctrl+0 |
| Page down / up, top / bottom | Space / Shift+Space, Ctrl+Home / Ctrl+End |
| Reload / export to PDF / print | F5 / Ctrl+Shift+E / Ctrl+P |
| Settings / keyboard shortcuts | Ctrl+, / Ctrl+K Ctrl+S |

On macOS, Ctrl is ⌘.

## Not (yet) in Emdi

- Editing and writing Markdown (with a toolbar, live preview and shortcuts): the next step.
