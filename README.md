# MarkView

A native macOS markdown viewer and editor built with Electron. Designed to feel at home on macOS with system theme support, a clean sidebar with vertical tabs, and a syntax-highlighted editor with live preview.

## Features

- **Native macOS look and feel** — hidden titlebar with traffic lights, vibrancy sidebar, system font defaults
- **Syntax-highlighted editor** — CodeMirror-powered with markdown color-coding (headers, bold, italic, links, code blocks, lists)
- **Live preview** — rendered markdown preview with full GFM support (tables, task lists, fenced code)
- **Split view** — editor and preview side by side, or toggle between edit-only and preview-only modes
- **Synchronized scrolling** — optional linked scrolling between editor and preview in split view
- **Table of contents** — collapsible outline panel on the right; click any heading to jump to that section
- **Vertical tabs** — open files shown as tabs in the left sidebar
- **File tree browser** — open a folder and navigate its contents
- **JSON support** — syntax-highlighted editing and formatted preview for `.json` files
- **Resizable panes** — drag to resize the sidebar, editor, and preview panels
- **New file creation** — create new markdown files directly from the app
- **System theme** — follows macOS dark/light mode automatically, or set manually
- **Customizable fonts** — choose font family and size in settings with live preview
- **File open from Finder** — double-click any associated `.md` or `.json` file to open directly in MarkView

## Getting Started

### Run from source

```bash
git clone https://github.com/dkeg/markview.git
cd markview
npm install
npm start
```

### Build a macOS app

```bash
npm run build
```

This produces a **Universal** binary (`arm64` + `x64`) so MarkView runs natively on Apple silicon without Rosetta, while still supporting Intel Macs. See [Apple's Rosetta guidance](https://support.apple.com/en-us/102527) for why this matters.

The built `.app` will be in `dist/mac-universal/`. Copy it to your Applications folder:

```bash
cp -R dist/mac-universal/MarkView.app ~/Applications/
```

For architecture-specific builds during development:

```bash
npm run build:arm64   # Apple silicon only
npm run build:x64     # Intel only
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+N` | New file |
| `Cmd+O` | Open file |
| `Cmd+Shift+O` | Open folder |
| `Cmd+S` | Save |
| `Cmd+Shift+S` | Save as |
| `Cmd+W` | Close tab |
| `Cmd+1` | Editor only |
| `Cmd+2` | Split view |
| `Cmd+3` | Preview only |
| `Cmd+B` | Toggle sidebar |
| `Cmd+Shift+T` | Toggle table of contents |
| `Cmd+Shift+P` | Cycle view modes |
| `Cmd+,` | Settings |

## Settings

Access via `Cmd+,` or the app menu:

- **Theme** — System (auto), Light, or Dark
- **Font Family** — SF Mono, 0xProto Nerd Font, Menlo, Monaco, Andale Mono, Courier New, American Typewriter, System
- **Font Size** — 10px to 24px slider
- **Line Numbers** — toggle line number gutter in the editor
- **Restore Session** — reopen previously open tabs on launch
- **Sync Scroll** — toggle synchronized scrolling between editor and preview in split view
- **Table of Contents** — show or hide the outline panel on the right

## Project Structure

```
markview/
├── main.js          # Electron main process — window, IPC, menu, file ops
├── preload.js       # Context bridge (IPC + markdown rendering)
├── renderer.js      # UI logic — tabs, file tree, CodeMirror, preview
├── index.html       # App layout
├── styles.css       # All styling — light/dark themes, CodeMirror overrides
├── package.json     # Dependencies and build config
└── assets/
    ├── icon-dark.icns      # App icon (dark variant, default)
    ├── icon-dark.html      # Icon source — dark
    ├── icon-design.html    # Icon source — light
    └── icon-glass.html     # Icon source — glass/liquid glass
```

### Regenerating icons

All three icon variants are designed as HTML/CSS and rendered via Electron's Chromium. To regenerate:

1. Edit any `assets/icon-*.html` file
2. Run `npx electron make-icon.js` (see the icon generation script in git history)
3. The updated `.icns` files will be written to `assets/`

## Tech Stack

- [Electron](https://www.electronjs.org/) — cross-platform desktop app framework
- [CodeMirror 5](https://codemirror.net/5/) — syntax-highlighted code editor
- [marked](https://marked.js.org/) — fast markdown parser and renderer (GFM)

## License

MIT
