# Changelog

All notable changes to MarkView will be documented here.

---

## [1.0.0] — 2026-05-13

### Initial release

#### App
- Native macOS window with hidden titlebar, traffic light controls, and vibrancy sidebar
- Electron main process with full IPC bridge via context-isolated preload
- Session restore — reopens previously open tabs on launch
- File open from Finder via `open-file` event (double-click `.md` / `.json`)
- Full app menu with all keyboard shortcuts wired to renderer events
- Settings persisted to `userData` (theme, font, line numbers, sync scroll, session)

#### Editor
- CodeMirror 5 with markdown and JSON modes
- Syntax highlighting — headers, bold, italic, links, inline code, blockquotes, lists
- Line numbers, active line highlight, matching brackets, auto-close brackets
- Customizable font family and size (live preview in settings)
- `Cmd+S` / `Cmd+Shift+S` save and save-as

#### Preview
- Live rendered markdown via `marked` (GFM — tables, task lists, fenced code blocks)
- JSON files render as formatted, indented text
- Synchronized bidirectional scrolling between editor and preview (toggleable)

#### Layout
- Split view, editor-only, and preview-only modes (`Cmd+1` / `Cmd+2` / `Cmd+3`)
- Resizable sidebar and editor/preview panels via drag handles
- Vertical tab list in sidebar with modified indicator and close button
- File tree browser with lazy-expanding directories
- Toggle sidebar (`Cmd+B`)

#### Theme
- Follows macOS system dark/light mode automatically via `nativeTheme`
- Manual override in settings (System / Light / Dark)
- Fully separate light and dark color palettes throughout

#### Color palette
- Optimized dark mode syntax colors for readability on `#1c1c1e`:
  - Headings — `#5BC8F5` cyan-blue
  - Bold — `#FF6B8A` pink-red
  - Links — `#4EB3FF` light blue
  - Code/strings — `#FF7B72` coral
  - Keywords — `#D2A8FF` soft purple
  - JSON keys — `#79C0FF` sky blue
  - JSON numbers — `#F2CC60` amber
  - Body text — `#D4D4D4` neutral gray (direct dark-mode override for CodeMirror specificity)
- Light mode palette tuned for contrast against white — no near-black indigo tokens

#### Icon
- Three icon variants designed as HTML/CSS and rendered via Electron's Chromium:
  - **Light** (`icon-design.html`) — blue gradient, white paper, `M↓` badge
  - **Dark** (`icon-dark.html`) — deep navy gradient, dark paper, vibrant syntax lines
  - **Glass** (`icon-glass.html`) — liquid glass panel with `backdrop-filter` blur over coloured blobs
- All variants exported to full macOS iconset (12 sizes, 16px–1024px) via `iconutil`
- Dark variant set as default in `package.json`

#### Build
- `electron-builder` configured for macOS universal (arm64 + x64) DMG
- `.md` and `.json` file associations registered
- `node_modules/`, `dist/`, `.claude/` excluded via `.gitignore`
