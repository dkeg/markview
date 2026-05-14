/* globals CodeMirror, api */
'use strict'

// ─── State ─────────────────────────────────────────────────────────────────
let tabs = []
let activeTabId = null
let nextTabId = 1
let settings = {}
let systemTheme = 'light'
let viewMode = 'split'
let sidebarVisible = true
let openFolderPath = null
let treeExpanded = {}
let syncScrollActive = false
let isSyncScrolling = false
let editor = null

// ─── DOM refs ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)
const sidebar       = $('sidebar')
const tabsList      = $('tabs-list')
const fileTree      = $('file-tree')
const fileTreeSection = $('file-tree-section')
const folderName    = $('folder-name')
const panels        = $('panels')
const editorPanel   = $('editor-panel')
const previewPanel  = $('preview-panel')
const previewContent = $('preview-content')
const toolbar       = $('toolbar')
const fileNameDisplay = $('file-name-display')
const modifiedIndicator = $('modified-indicator')
const welcomeScreen = $('welcome-screen')
const settingsOverlay = $('settings-overlay')
const sidebarResizeHandle  = $('sidebar-resize-handle')
const panelsResizeHandle   = $('panels-resize-handle')

// ─── Init ───────────────────────────────────────────────────────────────────
async function init() {
  settings = await api.getSettings()
  systemTheme = await api.getTheme()

  applyTheme()
  applyEditorSettings()
  initEditor()
  initResizeHandles()
  bindToolbar()
  bindSidebarButtons()
  bindWelcomeButtons()
  bindSettingsModal()
  bindMenuEvents()

  if (settings.restoreSession) {
    await restoreSession()
  }

  updateWelcomeScreen()
}

// ─── Theme ──────────────────────────────────────────────────────────────────
function applyTheme() {
  let theme = settings.theme
  if (theme === 'system') theme = systemTheme
  document.documentElement.setAttribute('data-theme', theme)

  if (editor) {
    editor.setOption('theme', theme === 'dark' ? 'markview-dark' : 'default')
  }
}

api.on('theme-updated', (newTheme) => {
  systemTheme = newTheme
  applyTheme()
})

// ─── Editor ─────────────────────────────────────────────────────────────────
function initEditor() {
  const textarea = $('editor-textarea')
  editor = CodeMirror.fromTextArea(textarea, {
    mode: 'markdown',
    theme: 'default',
    lineNumbers: settings.lineNumbers !== false,
    lineWrapping: true,
    autofocus: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    extraKeys: {
      'Cmd-S': () => saveCurrentTab(),
      'Ctrl-S': () => saveCurrentTab()
    }
  })

  editor.on('change', () => {
    const tab = activeTab()
    if (!tab) return
    tab.content = editor.getValue()
    if (!tab.modified) {
      tab.modified = true
      renderTabs()
      updateToolbarTitle()
    }
    updatePreview()
  })

  editor.on('scroll', () => {
    if (!syncScrollActive || isSyncScrolling) return
    isSyncScrolling = true
    const info = editor.getScrollInfo()
    const ratio = info.top / (info.height - info.clientHeight)
    const previewMax = previewPanel.scrollHeight - previewPanel.clientHeight
    previewPanel.scrollTop = ratio * previewMax
    requestAnimationFrame(() => { isSyncScrolling = false })
  })

  previewPanel.addEventListener('scroll', () => {
    if (!syncScrollActive || isSyncScrolling) return
    isSyncScrolling = true
    const ratio = previewPanel.scrollTop / (previewPanel.scrollHeight - previewPanel.clientHeight)
    const info = editor.getScrollInfo()
    const editorMax = info.height - info.clientHeight
    editor.scrollTo(null, ratio * editorMax)
    requestAnimationFrame(() => { isSyncScrolling = false })
  })

  applyEditorSettings()
}

function applyEditorSettings() {
  const ff = settings.fontFamily || "'SF Mono', monospace"
  const fs = (settings.fontSize || 14) + 'px'
  document.documentElement.style.setProperty('--editor-font-family', ff)
  document.documentElement.style.setProperty('--editor-font-size', fs)

  if (editor) {
    editor.setOption('lineNumbers', settings.lineNumbers !== false)
    editor.refresh()
  }

  // Sync the sync-scroll button state
  syncScrollActive = settings.syncScroll !== false
  $('btn-sync-scroll').classList.toggle('active', syncScrollActive)
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
function activeTab() {
  return tabs.find(t => t.id === activeTabId) || null
}

function createTab(filePath, content, type) {
  // Reuse existing tab for same file
  if (filePath) {
    const existing = tabs.find(t => t.filePath === filePath)
    if (existing) {
      switchTab(existing.id)
      return existing
    }
  }

  const id = nextTabId++
  const name = filePath ? filePath.split('/').pop() : 'Untitled'
  const tab = { id, filePath, name, content: content || '', type: type || 'markdown', modified: !filePath }
  tabs.push(tab)
  switchTab(id)
  return tab
}

function switchTab(id) {
  const tab = tabs.find(t => t.id === id)
  if (!tab) return

  activeTabId = id
  renderTabs()
  loadTabIntoEditor(tab)
  updateToolbarTitle()
  updateWelcomeScreen()
  saveSessionDebounced()
}

function closeTab(id) {
  const tab = tabs.find(t => t.id === id)
  if (!tab) return

  if (tab.modified) {
    const name = tab.name || 'Untitled'
    if (!confirm(`Save changes to "${name}" before closing?`)) {
      // User pressed cancel — don't close
      return
    }
    if (tab.filePath) {
      api.writeFile(tab.filePath, tab.content)
    }
  }

  const idx = tabs.indexOf(tab)
  tabs.splice(idx, 1)

  if (activeTabId === id) {
    const next = tabs[idx] || tabs[idx - 1] || null
    activeTabId = next ? next.id : null
    if (next) {
      loadTabIntoEditor(next)
    } else {
      editor && editor.setValue('')
      fileNameDisplay.textContent = ''
      modifiedIndicator.style.display = 'none'
    }
  }

  renderTabs()
  updateToolbarTitle()
  updateWelcomeScreen()
  saveSessionDebounced()
}

function loadTabIntoEditor(tab) {
  const mode = tab.type === 'json' ? { name: 'javascript', json: true } : 'markdown'
  editor.setOption('mode', mode)
  editor.setValue(tab.content)
  editor.clearHistory()
  editor.focus()
  updatePreview()
}

function renderTabs() {
  if (tabs.length === 0) {
    tabsList.innerHTML = '<div class="tabs-empty">No open files</div>'
    return
  }

  tabsList.innerHTML = ''
  tabs.forEach(tab => {
    const el = document.createElement('div')
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '') + (tab.modified ? ' modified' : '')
    el.dataset.id = tab.id

    const icon = tab.type === 'json' ? iconJSON() : iconMD()
    el.innerHTML = `
      <span class="tab-icon">${icon}</span>
      <span class="tab-name">${escHtml(tab.name)}</span>
      <span class="tab-modified"></span>
      <button class="tab-close" title="Close">
        <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
        </svg>
      </button>
    `

    el.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close')) return
      switchTab(tab.id)
    })

    el.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation()
      closeTab(tab.id)
    })

    tabsList.appendChild(el)
  })
}

// ─── Preview ─────────────────────────────────────────────────────────────────
function updatePreview() {
  const tab = activeTab()
  if (!tab) { previewContent.innerHTML = ''; return }

  if (tab.type === 'json') {
    try {
      const parsed = JSON.parse(tab.content)
      previewContent.className = 'json-preview'
      previewContent.textContent = JSON.stringify(parsed, null, 2)
    } catch {
      previewContent.className = 'json-preview'
      previewContent.textContent = tab.content
    }
  } else {
    previewContent.className = ''
    previewContent.innerHTML = api.renderMarkdown(tab.content)
    // Make task list checkboxes non-interactive
    previewContent.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.disabled = true
    })
  }
}

// ─── File operations ─────────────────────────────────────────────────────────
async function openFile(filePath) {
  const result = await api.readFile(filePath)
  if (!result.success) {
    alert('Could not open file: ' + result.error)
    return
  }
  createTab(result.filePath, result.content, result.type)
}

async function promptOpenFile() {
  const filePath = await api.showOpenDialog()
  if (filePath) await openFile(filePath)
}

async function promptOpenFolder() {
  const folderPath = await api.showFolderDialog()
  if (folderPath) await openFolder(folderPath)
}

async function openFolder(folderPath) {
  openFolderPath = folderPath
  treeExpanded = {}
  const name = folderPath.split('/').pop()
  folderName.textContent = name
  fileTreeSection.style.display = 'flex'
  await renderFileTree(folderPath, fileTree, 0)
}

async function renderFileTree(dirPath, container, depth) {
  container.innerHTML = ''
  const entries = await api.readDir(dirPath)

  for (const entry of entries) {
    const item = document.createElement('div')
    item.className = 'tree-item' + (entry.isDirectory ? ' directory' : '')
    item.style.paddingLeft = (6 + depth * 14) + 'px'

    const icon = entry.isDirectory ? iconFolder() : (entry.name.endsWith('.json') ? iconJSON() : iconMD())
    item.innerHTML = `
      <span class="tree-item-icon">${icon}</span>
      <span class="tree-item-name">${escHtml(entry.name)}</span>
    `

    if (entry.isDirectory) {
      const childContainer = document.createElement('div')
      childContainer.className = 'tree-children'
      childContainer.style.display = treeExpanded[entry.path] ? 'block' : 'none'

      item.addEventListener('click', async () => {
        const isOpen = childContainer.style.display !== 'none'
        childContainer.style.display = isOpen ? 'none' : 'block'
        treeExpanded[entry.path] = !isOpen
        if (!isOpen && childContainer.children.length === 0) {
          await renderFileTree(entry.path, childContainer, depth + 1)
        }
      })

      container.appendChild(item)
      container.appendChild(childContainer)
      if (treeExpanded[entry.path]) {
        await renderFileTree(entry.path, childContainer, depth + 1)
      }
    } else {
      // Only show md and json files
      if (!/\.(md|markdown|json)$/i.test(entry.name)) {
        item.style.opacity = '0.5'
      }

      item.addEventListener('click', async () => {
        container.querySelectorAll('.tree-item').forEach(i => i.classList.remove('active'))
        item.classList.add('active')
        if (/\.(md|markdown|json)$/i.test(entry.name)) {
          await openFile(entry.path)
        }
      })

      container.appendChild(item)
    }
  }
}

async function saveCurrentTab() {
  const tab = activeTab()
  if (!tab) return

  if (!tab.filePath) {
    await saveAsCurrentTab()
    return
  }

  const result = await api.writeFile(tab.filePath, tab.content)
  if (result.success) {
    tab.modified = false
    renderTabs()
    updateToolbarTitle()
  } else {
    alert('Save failed: ' + result.error)
  }
}

async function saveAsCurrentTab() {
  const tab = activeTab()
  if (!tab) return

  const defaultName = tab.filePath || (tab.type === 'json' ? 'untitled.json' : 'untitled.md')
  const filePath = await api.showSaveDialog(defaultName)
  if (!filePath) return

  const result = await api.writeFile(filePath, tab.content)
  if (result.success) {
    tab.filePath = filePath
    tab.name = filePath.split('/').pop()
    tab.modified = false
    const ext = filePath.split('.').pop().toLowerCase()
    tab.type = ext === 'json' ? 'json' : 'markdown'
    renderTabs()
    updateToolbarTitle()
    updatePreview()
  }
}

function newFile() {
  createTab(null, '', 'markdown')
}

// ─── UI state ─────────────────────────────────────────────────────────────────
function updateToolbarTitle() {
  const tab = activeTab()
  if (!tab) {
    fileNameDisplay.textContent = ''
    modifiedIndicator.style.display = 'none'
    api.setTitle('MarkView')
    return
  }
  fileNameDisplay.textContent = tab.name
  modifiedIndicator.style.display = tab.modified ? '' : 'none'
  api.setTitle(tab.name + (tab.modified ? ' — Edited' : '') + ' — MarkView')
}

function updateWelcomeScreen() {
  const hasTab = tabs.length > 0
  welcomeScreen.style.display = hasTab ? 'none' : 'flex'
  $('main-content').style.visibility = hasTab ? 'visible' : 'hidden'
  if (hasTab) welcomeScreen.style.display = 'none'
  else welcomeScreen.style.display = 'flex'
}

function setViewMode(mode) {
  viewMode = mode
  panels.setAttribute('data-mode', mode)
  document.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode)
  })
  editor && editor.refresh()
}

function toggleSidebar() {
  sidebarVisible = !sidebarVisible
  sidebar.classList.toggle('hidden', !sidebarVisible)
  sidebarResizeHandle.style.display = sidebarVisible ? '' : 'none'
  editor && editor.refresh()
}

// ─── Toolbar buttons ──────────────────────────────────────────────────────────
function bindToolbar() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => setViewMode(btn.dataset.mode))
  })

  $('btn-sync-scroll').addEventListener('click', () => {
    syncScrollActive = !syncScrollActive
    settings.syncScroll = syncScrollActive
    api.setSettings(settings)
    $('btn-sync-scroll').classList.toggle('active', syncScrollActive)
  })
}

function bindSidebarButtons() {
  $('btn-new').addEventListener('click', newFile)
  $('btn-open').addEventListener('click', promptOpenFile)
  $('btn-open-folder').addEventListener('click', promptOpenFolder)
  $('btn-close-folder').addEventListener('click', () => {
    openFolderPath = null
    fileTreeSection.style.display = 'none'
  })
}

function bindWelcomeButtons() {
  $('welcome-open-file').addEventListener('click', promptOpenFile)
  $('welcome-open-folder').addEventListener('click', promptOpenFolder)
  $('welcome-new-file').addEventListener('click', newFile)
}

// ─── Menu event bindings ──────────────────────────────────────────────────────
function bindMenuEvents() {
  api.on('menu-new-file', newFile)
  api.on('menu-open-file', promptOpenFile)
  api.on('menu-open-folder', promptOpenFolder)
  api.on('menu-save', saveCurrentTab)
  api.on('menu-save-as', saveAsCurrentTab)
  api.on('menu-close-tab', () => { const tab = activeTab(); if (tab) closeTab(tab.id) })
  api.on('menu-view-mode', (mode) => setViewMode(mode))
  api.on('menu-cycle-view', () => {
    const modes = ['editor', 'split', 'preview']
    const idx = modes.indexOf(viewMode)
    setViewMode(modes[(idx + 1) % modes.length])
  })
  api.on('menu-toggle-sidebar', toggleSidebar)
  api.on('open-settings', openSettings)
  api.on('open-external-file', (filePath) => openFile(filePath))
}

// ─── Settings modal ───────────────────────────────────────────────────────────
function openSettings() {
  settingsOverlay.style.display = 'flex'

  $('setting-theme').value = settings.theme || 'system'
  $('setting-font-family').value = settings.fontFamily || "'SF Mono', monospace"
  $('setting-font-size').value = settings.fontSize || 14
  $('font-size-display').textContent = (settings.fontSize || 14) + 'px'
  $('setting-line-numbers').checked = settings.lineNumbers !== false
  $('setting-restore-session').checked = settings.restoreSession !== false
  $('setting-sync-scroll').checked = settings.syncScroll !== false
}

function bindSettingsModal() {
  $('settings-close').addEventListener('click', closeSettings)
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettings()
  })

  $('setting-theme').addEventListener('change', (e) => {
    settings.theme = e.target.value
    applyTheme()
    saveSettingsDebounced()
  })

  $('setting-font-family').addEventListener('change', (e) => {
    settings.fontFamily = e.target.value
    applyEditorSettings()
    saveSettingsDebounced()
  })

  $('setting-font-size').addEventListener('input', (e) => {
    settings.fontSize = parseInt(e.target.value, 10)
    $('font-size-display').textContent = settings.fontSize + 'px'
    applyEditorSettings()
    saveSettingsDebounced()
  })

  $('setting-line-numbers').addEventListener('change', (e) => {
    settings.lineNumbers = e.target.checked
    applyEditorSettings()
    saveSettingsDebounced()
  })

  $('setting-restore-session').addEventListener('change', (e) => {
    settings.restoreSession = e.target.checked
    saveSettingsDebounced()
  })

  $('setting-sync-scroll').addEventListener('change', (e) => {
    settings.syncScroll = e.target.checked
    syncScrollActive = e.target.checked
    $('btn-sync-scroll').classList.toggle('active', syncScrollActive)
    saveSettingsDebounced()
  })
}

function closeSettings() {
  settingsOverlay.style.display = 'none'
}

// ─── Session ──────────────────────────────────────────────────────────────────
async function restoreSession() {
  const session = await api.getSession()
  if (!session || !session.openFiles || !session.openFiles.length) return

  for (const fileInfo of session.openFiles) {
    if (fileInfo.filePath) {
      await openFile(fileInfo.filePath)
    } else {
      createTab(null, fileInfo.content || '', fileInfo.type || 'markdown')
    }
  }

  if (session.activeFile) {
    const tab = tabs.find(t => t.filePath === session.activeFile)
    if (tab) switchTab(tab.id)
  }

  if (session.viewMode) setViewMode(session.viewMode)
  if (session.folderPath) await openFolder(session.folderPath)
}

let sessionTimer = null
function saveSessionDebounced() {
  clearTimeout(sessionTimer)
  sessionTimer = setTimeout(persistSession, 1000)
}

function persistSession() {
  const session = {
    openFiles: tabs.map(t => ({ filePath: t.filePath, content: t.filePath ? undefined : t.content, type: t.type })),
    activeFile: activeTab()?.filePath || null,
    viewMode,
    folderPath: openFolderPath
  }
  api.saveSession(session)
}

// ─── Resize handles ───────────────────────────────────────────────────────────
function initResizeHandles() {
  makeResizable(sidebarResizeHandle, (delta) => {
    const newWidth = Math.max(160, Math.min(380, sidebar.offsetWidth + delta))
    sidebar.style.width = newWidth + 'px'
  })

  makeResizable(panelsResizeHandle, (delta) => {
    const totalWidth = panels.offsetWidth
    const editorWidth = editorPanel.offsetWidth
    const newEditorWidth = Math.max(200, Math.min(totalWidth - 200, editorWidth + delta))
    const pct = (newEditorWidth / totalWidth * 100).toFixed(2)
    editorPanel.style.flex = 'none'
    editorPanel.style.width = pct + '%'
    previewPanel.style.flex = '1'
    editor && editor.refresh()
  })
}

function makeResizable(handle, onDelta) {
  let startX = 0
  let dragging = false

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault()
    dragging = true
    startX = e.clientX
    handle.classList.add('dragging')
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  })

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return
    const delta = e.clientX - startX
    startX = e.clientX
    onDelta(delta)
  })

  document.addEventListener('mouseup', () => {
    if (!dragging) return
    dragging = false
    handle.classList.remove('dragging')
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    editor && editor.refresh()
  })
}

// ─── Debounced settings save ──────────────────────────────────────────────────
let settingsTimer = null
function saveSettingsDebounced() {
  clearTimeout(settingsTimer)
  settingsTimer = setTimeout(() => api.setSettings(settings), 400)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function iconMD() {
  return `<svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M14.85 3H1.15C.52 3 0 3.52 0 4.15v7.69C0 12.48.52 13 1.15 13h13.69c.64 0 1.15-.52 1.15-1.15V4.15C16 3.52 15.48 3 14.85 3zM9 11H7.5V8.25L6 10l-1.5-1.75V11H3V5h1.5l1.5 2 1.5-2H9v6zm4-1.5l-1.5 1.5-1.5-1.5L11 9V5h1.5v4l.5-.5z"/>
  </svg>`
}

function iconJSON() {
  return `<svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 2.984V2h-.09c-.313 0-.616.062-.909.185a2.33 2.33 0 00-.775.53 2.23 2.23 0 00-.493.753v.001a3.542 3.542 0 00-.198.83v.002A15.88 15.88 0 004.5 5v.5h-.003a2.57 2.57 0 01-.494.057c-.2 0-.39-.02-.566-.06l-.003-.001a1.42 1.42 0 01-.435-.184.913.913 0 01-.28-.3A.836.836 0 012.5 5H1.5c0 .276.06.54.185.785.125.244.3.456.527.633.227.176.497.313.8.403.304.09.638.134 1 .134.362 0 .696-.044 1-.134.303-.09.573-.227.8-.403.226-.177.402-.39.527-.633.124-.245.186-.51.186-.785V3.5c0-.178.01-.352.028-.52.02-.168.05-.32.096-.456a.943.943 0 01.199-.352.808.808 0 01.32-.215A1.3 1.3 0 016 1.984V2zm0 10V11h-.09a1.3 1.3 0 00-.487.093.808.808 0 00-.32.215.943.943 0 00-.199.352 1.69 1.69 0 00-.096.456 7.19 7.19 0 00-.028.52v1.996c0 .275-.062.54-.186.784a2.23 2.23 0 01-.527.633 2.44 2.44 0 01-.8.403c-.304.09-.638.135-1 .135-.362 0-.696-.045-1-.135a2.44 2.44 0 01-.8-.403 2.23 2.23 0 01-.527-.633A1.836 1.836 0 011.5 11H2.5c0 .133.028.258.079.375a.913.913 0 00.28.3c.12.087.267.154.435.184l.003.001c.175.04.365.06.566.06.2 0 .39-.02.566-.06l.003-.001c.168-.03.315-.097.435-.184a.913.913 0 00.28-.3.836.836 0 00.079-.375V9.5c0-.178.01-.351.028-.52.02-.168.05-.32.096-.456a.943.943 0 01.199-.352.808.808 0 01.32-.215A1.3 1.3 0 016 8.016V8h-.09a1.3 1.3 0 01-.487-.093.808.808 0 01-.32-.215.943.943 0 01-.199-.352 1.69 1.69 0 01-.096-.456A7.19 7.19 0 014.78 6.5V4.5c0-.133-.028-.258-.079-.375a.913.913 0 00-.28-.3 1.42 1.42 0 00-.435-.184l-.003-.001A2.57 2.57 0 003.5 3.5h-.003V3h.003A2.57 2.57 0 014 3.06l.003.001c.168.03.315.097.435.184a.913.913 0 01.28.3c.051.117.079.242.079.375v1.996c0 .18.01.353.028.52.02.168.05.32.096.457a.943.943 0 00.199.351.808.808 0 00.32.215A1.3 1.3 0 006 7.016V7h.09c.173 0 .34.03.487.093a.808.808 0 01.32.215.943.943 0 01.199.351c.046.137.076.29.096.457.018.167.028.34.028.52V9.5c0 .133.028.258.079.375a.913.913 0 00.28.3c.12.087.267.154.435.184l.003.001c.175.04.365.06.566.06.2 0 .39-.02.566-.06l.003-.001c.168-.03.315-.097.435-.184a.913.913 0 00.28-.3.836.836 0 00.079-.375H10.5c0 .276-.062.54-.185.784a2.23 2.23 0 01-.527.633 2.44 2.44 0 01-.8.403c-.304.09-.638.135-1 .135-.362 0-.696-.045-1-.135a2.44 2.44 0 01-.8-.403 2.23 2.23 0 01-.527-.633A1.836 1.836 0 015.5 11V9.5c0-.18-.01-.353-.028-.52a1.69 1.69 0 00-.096-.456.943.943 0 00-.199-.352.808.808 0 00-.32-.215A1.3 1.3 0 004.91 8H5v.016a1.3 1.3 0 00.487.092.808.808 0 00.32-.215.943.943 0 00.199-.351 1.69 1.69 0 00.096-.457A7.19 7.19 0 006 6.504V4.5c0-.133.028-.258.079-.375a.913.913 0 01.28-.3c.12-.087.267-.154.435-.184l.003-.001A2.57 2.57 0 017.36 3.5H7.5V3h-.14a2.57 2.57 0 00-.562.057l-.003.001a1.42 1.42 0 00-.435.184.913.913 0 00-.28.3.836.836 0 00-.079.375v2.004c0 .178-.01.351-.028.52a1.69 1.69 0 01-.096.456.943.943 0 01-.199.352.808.808 0 01-.32.215A1.3 1.3 0 015.91 7.5H6v.516a1.3 1.3 0 01.487-.092.808.808 0 01.32.215.943.943 0 01.199.352c.046.136.076.288.096.456.018.169.028.342.028.52V11c0 .276.062.54.185.785.125.244.3.456.527.633.227.176.497.313.8.403.304.09.638.135 1 .135.362 0 .696-.045 1-.135.303-.09.573-.227.8-.403.226-.177.402-.39.527-.633.124-.245.186-.51.186-.785h-1z"/>
  </svg>`
}

function iconFolder() {
  return `<svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5L5.75 1H1.75zM1.5 2.75a.25.25 0 01.25-.25H5.5l1.75 2H14.25a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25H1.75a.25.25 0 01-.25-.25V2.75z"/>
  </svg>`
}

// ─── Start ────────────────────────────────────────────────────────────────────
init()
