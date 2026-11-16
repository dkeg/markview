# MarkView

A native macOS markdown viewer and editor built with Go and Wails. Designed to feel at home on macOS with system theme support, a clean sidebar with vertical tabs, and a syntax-highlighted editor with live preview.

## Features

- **Native macOS look and feel** — hidden titlebar with traffic lights, vibrancy sidebar, system font defaults
- **Syntax-highlighted editor** — CodeMirror-powered with markdown color-coding (headers, bold, italic, links, code blocks, lists)
- **Syntax-highlighted code blocks** — fenced code blocks in the preview render with full language-aware coloring via highlight.js
- **Live preview** — rendered markdown preview with full GFM support (tables, task lists, fenced code)
- **Split view** — editor and preview side by side, or toggle between edit-only and preview-only modes
- **Synchronized scrolling** — optional linked scrolling between editor and preview in split view
- **Table of contents** — collapsible outline panel on the right; click any heading to jump to that section
- **Vertical tabs** — open files shown as tabs in the left sidebar
- **File tree browser** — open a folder (or drag one onto the window) and navigate its contents
- **JSON support** — syntax-highlighted editing and formatted preview for `.json` files
- **Resizable panes** — drag to resize the sidebar, editor, and preview panels
- **New file creation** — create new markdown files directly from the app
- **System theme** — follows macOS dark/light mode automatically, or set manually
- **Customizable fonts** — choose font family and size in settings with live preview
- **File open from Finder** — double-click any associated `.md` or `.json` file to open directly in MarkView

## Install

With [Homebrew](https://brew.sh):

```bash
brew install --cask dkeg/tap/markview
```

Or download the latest `.dmg` from [Releases](https://github.com/dkeg/markview/releases/latest). MarkView is a Universal app (Apple silicon and Intel) and requires macOS 13 Ventura or later.

## Getting Started

Building from source requires [Go](https://go.dev/dl/) 1.22+ and the Xcode command line tools (`xcode-select --install`).

### Run from source

```bash
git clone https://github.com/dkeg/markview.git
cd markview
make tools   # installs the Wails CLI
make dev
```

`make dev` rebuilds on Go changes and also serves the UI at http://localhost:34115, where you can use browser devtools.

### Build a macOS app

```bash
make build   # build/bin/MarkView.app
make dmg     # build/bin/MarkView-<version>-universal.dmg (unsigned)
```

This produces a **Universal** binary (`arm64` + `x86_64`) so MarkView runs natively on Apple silicon without Rosetta, while still supporting Intel Macs. See [Apple's Rosetta guidance](https://support.apple.com/en-us/102527) for why this matters.

Copy the app to your Applications folder:

```bash
cp -R build/bin/MarkView.app ~/Applications/
```

For architecture-specific builds during development:

```bash
make build-arm64   # Apple silicon only
make build-x64     # Intel only
```

### Releasing

Releases are signed with a Developer ID certificate, notarized by Apple, and published to GitHub and the [Homebrew tap](https://github.com/dkeg/homebrew-tap). One-time setup:

```bash
xcrun notarytool store-credentials markview-notary --apple-id <apple id> --team-id <team id>
```

Then bump `version` in `main.go` and `productVersion` in `wails.json`, add a CHANGELOG entry, merge to `main`, and run:

```bash
make release   # signed + notarized DMG and Homebrew cask in build/bin/
make publish   # tag, GitHub release, tap update
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
├── main.go          # Wails app setup — window, options, Finder file-open, drag and drop
├── app.go           # Native API bound to the frontend — files, dialogs, settings, session
├── menu.go          # macOS menu bar
├── localfiles.go    # Serves local images referenced from markdown to the preview
├── wails.json       # Wails project config (name, version, file associations)
├── Makefile         # dev / build / dmg / release targets
├── scripts/release.sh  # Sign, notarize, publish release + Homebrew cask
├── build/           # App icon and Info.plist templates
├── frontend/
│   ├── index.html   # App layout
│   ├── bridge.js    # window.api — wraps Wails bindings, markdown rendering
│   ├── renderer.js  # UI logic — tabs, file tree, CodeMirror, preview
│   ├── styles.css   # All styling — light/dark themes, CodeMirror overrides
│   └── vendor/      # CodeMirror 5, marked, highlight.js (vendored, no npm needed)
└── assets/
    ├── icon-dark.icns      # App icon (dark variant, default)
    ├── icon-dark.html      # Icon source — dark
    ├── icon-design.html    # Icon source — light
    └── icon-glass.html     # Icon source — glass/liquid glass
```

### Regenerating icons

The icon variants are designed as HTML/CSS in `assets/`. After exporting a new `assets/icon-dark.icns`, regenerate the PNG Wails builds from:

```bash
sips -s format png assets/icon-dark.icns --out build/appicon.png
cp build/appicon.png build/fileicon.png
```

## Tech Stack

- [Go](https://go.dev/) + [Wails v2](https://wails.io/) — native macOS app using the system WebKit view
- [CodeMirror 5](https://codemirror.net/5/) — syntax-highlighted code editor
- [marked](https://marked.js.org/) — fast markdown parser and renderer (GFM)
- [highlight.js](https://highlightjs.org/) — code block syntax highlighting

## License

MIT
