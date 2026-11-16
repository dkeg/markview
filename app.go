package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App holds native-side state and exposes the methods the frontend calls
// through window.go.main.App (wrapped as window.api in frontend/bridge.js).
type App struct {
	ctx context.Context

	mu            sync.Mutex
	frontendReady bool
	pendingFiles  []string
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context) {
	a.mu.Lock()
	a.ctx = ctx
	a.mu.Unlock()
}

// handleFileOpen is called when Finder opens a file with MarkView. Files that
// arrive before the frontend has registered its listener are queued and handed
// over by TakePendingFiles.
func (a *App) handleFileOpen(path string) {
	a.mu.Lock()
	if !a.frontendReady || a.ctx == nil {
		a.pendingFiles = append(a.pendingFiles, path)
		a.mu.Unlock()
		return
	}
	ctx := a.ctx
	a.mu.Unlock()
	runtime.EventsEmit(ctx, "open-external-file", path)
}

// TakePendingFiles marks the frontend ready and returns any queued files.
func (a *App) TakePendingFiles() []string {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.frontendReady = true
	files := a.pendingFiles
	a.pendingFiles = nil
	if files == nil {
		files = []string{}
	}
	return files
}

// ─── Files ──────────────────────────────────────────────────────────────────

type ReadResult struct {
	Success  bool   `json:"success"`
	Content  string `json:"content,omitempty"`
	Type     string `json:"type,omitempty"`
	FilePath string `json:"filePath,omitempty"`
	Error    string `json:"error,omitempty"`
}

type Result struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

func (a *App) ReadFile(path string) ReadResult {
	data, err := os.ReadFile(path)
	if err != nil {
		return ReadResult{Success: false, Error: err.Error()}
	}
	typ := "markdown"
	if strings.ToLower(filepath.Ext(path)) == ".json" {
		typ = "json"
	}
	return ReadResult{Success: true, Content: string(data), Type: typ, FilePath: path}
}

func (a *App) WriteFile(path, content string) Result {
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return Result{Success: false, Error: err.Error()}
	}
	return Result{Success: true}
}

type DirEntry struct {
	Name        string `json:"name"`
	IsDirectory bool   `json:"isDirectory"`
	Path        string `json:"path"`
}

func (a *App) ReadDir(dir string) []DirEntry {
	out := []DirEntry{}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return out
	}
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") {
			continue
		}
		isDir := e.IsDir()
		// Follow symlinks so linked folders still expand in the sidebar.
		if e.Type()&os.ModeSymlink != 0 {
			if info, err := os.Stat(filepath.Join(dir, e.Name())); err == nil {
				isDir = info.IsDir()
			}
		}
		out = append(out, DirEntry{Name: e.Name(), IsDirectory: isDir, Path: filepath.Join(dir, e.Name())})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].IsDirectory != out[j].IsDirectory {
			return out[i].IsDirectory
		}
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out
}

// StatPaths reports which of the given paths are directories, for drag and
// drop. Paths that no longer exist are dropped from the result.
func (a *App) StatPaths(paths []string) []DirEntry {
	out := []DirEntry{}
	for _, p := range paths {
		info, err := os.Stat(p)
		if err != nil {
			continue
		}
		out = append(out, DirEntry{Name: filepath.Base(p), IsDirectory: info.IsDir(), Path: p})
	}
	return out
}

// ─── Dialogs ────────────────────────────────────────────────────────────────

var fileFilters = []runtime.FileFilter{
	{DisplayName: "Markdown & JSON", Pattern: "*.md;*.markdown;*.json"},
	{DisplayName: "All Files", Pattern: "*"},
}

func (a *App) ShowOpenDialog() string {
	path, _ := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Filters: fileFilters})
	return path
}

func (a *App) ShowFolderDialog() string {
	path, _ := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{CanCreateDirectories: true})
	return path
}

func (a *App) ShowSaveDialog(defaultName string) string {
	if defaultName == "" {
		defaultName = "untitled.md"
	}
	path, _ := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultFilename:      defaultName,
		CanCreateDirectories: true,
		Filters: []runtime.FileFilter{
			{DisplayName: "Markdown", Pattern: "*.md;*.markdown"},
			{DisplayName: "JSON", Pattern: "*.json"},
			{DisplayName: "All Files", Pattern: "*"},
		},
	})
	return path
}

// ─── Settings & session ─────────────────────────────────────────────────────

// configDir matches Electron's userData folder so existing settings and
// sessions carry over (~/Library/Application Support/MarkView).
func configDir() string {
	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	return filepath.Join(base, "MarkView")
}

func defaultSettings() map[string]any {
	return map[string]any{
		"theme":          "system",
		"fontFamily":     "SF Mono",
		"fontSize":       14,
		"lineNumbers":    true,
		"restoreSession": true,
		"syncScroll":     true,
		"showToc":        true,
	}
}

func readJSON(name string) (any, error) {
	data, err := os.ReadFile(filepath.Join(configDir(), name))
	if err != nil {
		return nil, err
	}
	var v any
	if err := json.Unmarshal(data, &v); err != nil {
		return nil, err
	}
	return v, nil
}

func writeJSON(name string, v any) error {
	if err := os.MkdirAll(configDir(), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(configDir(), name), data, 0o644)
}

func (a *App) GetSettings() any {
	v, err := readJSON("settings.json")
	if err != nil {
		return defaultSettings()
	}
	return v
}

func (a *App) SetSettings(settings any) Result {
	if err := writeJSON("settings.json", settings); err != nil {
		return Result{Success: false, Error: err.Error()}
	}
	return Result{Success: true}
}

func (a *App) GetSession() any {
	v, err := readJSON("session.json")
	if err != nil {
		return nil
	}
	return v
}

func (a *App) SaveSession(session any) Result {
	if err := writeJSON("session.json", session); err != nil {
		return Result{Success: false, Error: err.Error()}
	}
	return Result{Success: true}
}

// ─── Window & system ────────────────────────────────────────────────────────

func (a *App) ShowInFinder(path string) error {
	if path == "" {
		return errors.New("no path")
	}
	return exec.Command("open", "-R", path).Start()
}

func (a *App) SetTitle(title string) {
	runtime.WindowSetTitle(a.ctx, title)
}
