# Folio

A beautiful Markdown viewer and editor: open a `.md` file or a folder of them and read them the way they were meant to
look, with GitHub-flavoured Markdown, highlighted code, math, diagrams, an outline and live reload, in light and dark
themes. Write with a formatting toolbar, a `/` menu for every block and a live preview beside the text.

Folio was called Emdi until 0.3.0. An Emdi install updates itself to Folio and keeps its settings, recent files and open
tabs (`desktop/src/migrate.ts`); the app ID stays `dev.emdi.app` so the update replaces Emdi instead of installing
beside it.

Folio follows the architecture and UI structure of [Kod](https://github.com/amirerajabi/kod) (and Rowlit): an
**Electron** shell and a **React** UI, with the same top bar, tool window stripe, side panel, tabs, status bar, Search
Everywhere, Settings, themes and self-updater.

```
desktop/   Electron shell: window (Windows caption overlay, macOS inset), folio://app protocol, folio-file:// for local
           images, file reading / listing / watching, .md file association, PDF export, the updater
ui/        React UI: top bar, tool window stripe, side panel (Explorer, Outline, Find in Files), document tabs,
           the reader, status bar, palette, settings, dialogs
  markdown/   markdown-it with GitHub's extensions, KaTeX, highlight.js, Mermaid; the reader's styles
  editor/     the CodeMirror 6 Markdown editor: formatting and insert commands, the toolbar, the / menu, images,
              split-view scroll sync
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
- Links to other Markdown files open in Folio at the linked `#heading`; local images are shown; web links open in the
  browser; other files open in their default app.
- Documents reload when their file changes on disk.

**Writing**
- Three modes per document: View, Edit and Split (the editor beside a live preview that scrolls with it). Alt+click
  (or double-click in Split) a paragraph of the preview to edit it there.
- A formatting toolbar: paragraph style (Text, Heading 1–6), bold, italic, strikethrough, highlight, inline code, link,
  bulleted / numbered / task lists, quote, code block by language, a table by size (grid picker), images, alerts,
  Mermaid diagrams (flowchart, sequence, class, state, ER, Gantt, pie, mind map, timeline), math, divider, footnote,
  collapsible section, table of contents, front matter, date.
- Type `/` for the same blocks as a menu, filtered as you type (`/tab` → Table). Every item is also in Find Action
  ("Insert: Table").
- Lists and tasks continue on Enter (twice to end the list), Tab / Shift+Tab indent, Ctrl+Enter checks a task.
- Tables: Tab and Shift+Tab move between cells (a new row after the last), Format Table lines the columns up.
- Paste a URL over selected text to make a link; paste or drop an image to save it next to the document (in
  `images/`) and link it.
- Find and Replace, undo history per document, right-to-left lines, spell checking with suggestions on right-click.
- New documents (Ctrl+N), Save / Save As, Auto Save (a moment after typing, or when Folio loses focus), unsaved markers,
  and a question before closing anything unsaved. New file, new folder, rename and delete in the Explorer.

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

`FOLIO_DEV_URL` loads the UI from a dev server. `FOLIO_SMOKE_SHOT=out.png` captures the window once the UI has settled
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
| New / save / save as | Ctrl+N / Ctrl+S / Ctrl+Shift+S |
| View / Edit / Split, toggle View and Edit | Ctrl+Alt+1 / Ctrl+Alt+2 / Ctrl+Alt+3, Ctrl+/ |
| Bold / italic / strikethrough / highlight / inline code / link | Ctrl+B / Ctrl+I / Ctrl+Shift+X / Ctrl+Shift+H / Ctrl+E / Ctrl+K |
| Text / Heading 1–6 | Ctrl+0 / Ctrl+1…6 |
| Bulleted / numbered / task list / quote | Ctrl+Shift+8 / Ctrl+Shift+7 / Ctrl+Shift+9 / Ctrl+Shift+. |
| Code block / check a task | Ctrl+Alt+C / Ctrl+Enter |
| Insert menu / find and replace | / / Ctrl+F, Ctrl+H |
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
