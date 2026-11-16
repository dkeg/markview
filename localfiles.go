package main

import (
	"net/http"
	"path/filepath"
	"strings"
)

// localFilePrefix is the URL path under which the preview loads images that
// live on disk. The webview can't read file:// URLs, so the markdown preview
// rewrites <img src> to /localfile/<absolute path> (see frontend/bridge.js).
const localFilePrefix = "/localfile/"

var previewableExt = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true,
	".svg": true, ".bmp": true, ".ico": true, ".avif": true, ".heic": true,
}

// localFileHandler serves image files from disk. It only handles requests the
// embedded assets don't match, and only for image extensions.
type localFileHandler struct{}

func (localFileHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, localFilePrefix) {
		http.NotFound(w, r)
		return
	}
	path := filepath.Clean("/" + strings.TrimPrefix(r.URL.Path, localFilePrefix))
	if !previewableExt[strings.ToLower(filepath.Ext(path))] {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, path)
}
