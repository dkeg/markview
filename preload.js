const { contextBridge, ipcRenderer } = require('electron')
const { marked } = require('marked')

marked.setOptions({
  gfm: true,
  breaks: false,
  headerIds: true,
  mangle: false
})

contextBridge.exposeInMainWorld('api', {
  // File operations
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),
  showFolderDialog: () => ipcRenderer.invoke('show-folder-dialog'),
  showSaveDialog: (defaultName) => ipcRenderer.invoke('show-save-dialog', defaultName),
  readDir: (dirPath) => ipcRenderer.invoke('read-dir', dirPath),

  // Settings & session
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (settings) => ipcRenderer.invoke('set-settings', settings),
  getSession: () => ipcRenderer.invoke('get-session'),
  saveSession: (session) => ipcRenderer.invoke('save-session', session),

  // Theme
  getTheme: () => ipcRenderer.invoke('get-theme'),

  // Utility
  showInFinder: (filePath) => ipcRenderer.invoke('show-item-in-finder', filePath),
  setTitle: (title) => ipcRenderer.invoke('set-title', title),

  // Markdown rendering
  renderMarkdown: (content) => marked.parse(content),

  // IPC listeners (from main process)
  on: (channel, callback) => {
    const allowed = [
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
    ]
    if (allowed.includes(channel)) {
      const handler = (event, ...args) => callback(...args)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    }
  }
})
