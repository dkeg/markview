// Exposes window.api — the same surface the Electron preload provided —
// backed by Wails bindings (window.go.main.App) and the Wails runtime.
(function () {
  const App = () => window.go.main.App

  marked.use({
    gfm: true,
    breaks: false,
    headerIds: true,
    mangle: false,
    renderer: {
      code(code, language) {
        const lang = language && hljs.getLanguage(language) ? language : null
        try {
          const value = lang
            ? hljs.highlight(code, { language: lang }).value
            : hljs.highlightAuto(code).value
          return `<pre><code class="hljs${lang ? ` language-${lang}` : ''}">${value}</code></pre>\n`
        } catch {
          return false
        }
      }
    }
  })

  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const currentTheme = () => (darkQuery.matches ? 'dark' : 'light')

  const allowed = new Set([
    'open-external-file',
    'theme-updated',
    'open-settings',
    'menu-new-file',
    'menu-open-file',
    'menu-open-folder',
    'menu-save',
    'menu-save-as',
    'menu-close-tab',
    'menu-view-mode',
    'menu-cycle-view',
    'menu-toggle-sidebar',
    'menu-toggle-toc'
  ])

  window.api = {
    // File operations
    readFile: (filePath) => App().ReadFile(filePath),
    writeFile: (filePath, content) => App().WriteFile(filePath, content),
    showOpenDialog: () => App().ShowOpenDialog(),
    showFolderDialog: () => App().ShowFolderDialog(),
    showSaveDialog: (defaultName) => App().ShowSaveDialog(defaultName || ''),
    readDir: (dirPath) => App().ReadDir(dirPath),
    statPaths: (paths) => App().StatPaths(paths),

    // Settings & session
    getSettings: () => App().GetSettings(),
    setSettings: (settings) => App().SetSettings(settings),
    getSession: () => App().GetSession(),
    saveSession: (session) => App().SaveSession(session),

    // Theme (the webview follows the system appearance)
    getTheme: async () => currentTheme(),

    // Utility
    showInFinder: (filePath) => App().ShowInFinder(filePath),
    setTitle: (title) => App().SetTitle(title),

    // Markdown rendering. Local image paths are resolved against the document's
    // folder and served by Go under /localfile/.
    renderMarkdown: (content, docPath) => {
      const html = marked.parse(content)
      if (!/<img\s/i.test(html)) return html
      const tpl = document.createElement('template')
      tpl.innerHTML = html
      const baseDir = docPath ? docPath.slice(0, docPath.lastIndexOf('/') + 1) : null
      tpl.content.querySelectorAll('img[src]').forEach(img => {
        const src = img.getAttribute('src')
        if (/^(https?:|data:|blob:)/i.test(src)) return
        let abs = null
        if (src.startsWith('file://')) abs = decodeURI(src.slice(7))
        else if (src.startsWith('/')) abs = decodeURI(src)
        else if (baseDir) abs = new URL(src, 'file://' + encodeURI(baseDir)).pathname
        if (abs) {
          abs = decodeURIComponent(new URL('file://' + encodeURI(abs)).pathname)
          img.setAttribute('src', '/localfile' + abs.split('/').map(encodeURIComponent).join('/'))
        }
      })
      return tpl.innerHTML
    },

    // Open a URL in the default browser
    openExternal: (url) => window.runtime.BrowserOpenURL(url),

    // Native file/folder drops: callback receives [{ name, isDirectory, path }]
    onDrop: (callback) => {
      window.runtime.OnFileDrop(async (_x, _y, paths) => {
        const entries = await App().StatPaths(paths || [])
        if (entries.length) callback(entries)
      }, false)
    },

    // Events from the native side
    on: (channel, callback) => {
      if (!allowed.has(channel)) return

      if (channel === 'theme-updated') {
        const handler = () => callback(currentTheme())
        darkQuery.addEventListener('change', handler)
        return () => darkQuery.removeEventListener('change', handler)
      }

      const off = window.runtime.EventsOn(channel, callback)

      // Files opened from Finder before the page was listening are queued in Go.
      if (channel === 'open-external-file') {
        App().TakePendingFiles().then(files => files.forEach(f => callback(f)))
      }
      return off
    }
  }
})()
