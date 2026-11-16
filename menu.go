package main

import (
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) buildMenu() *menu.Menu {
	emit := func(event string, data ...any) menu.Callback {
		return func(*menu.CallbackData) { runtime.EventsEmit(a.ctx, event, data...) }
	}
	cmdShift := func(k string) *keys.Accelerator { return keys.Combo(k, keys.CmdOrCtrlKey, keys.ShiftKey) }

	m := menu.NewMenu()

	app := m.AddSubmenu("MarkView")
	app.AddText("About MarkView", nil, func(*menu.CallbackData) {
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:    runtime.InfoDialog,
			Title:   "MarkView",
			Message: "Version " + version + "\nA native macOS markdown viewer and editor.",
		})
	})
	app.AddSeparator()
	app.AddText("Settings…", keys.CmdOrCtrl(","), emit("open-settings"))
	app.AddSeparator()
	app.AddText("Hide MarkView", keys.CmdOrCtrl("h"), func(*menu.CallbackData) { runtime.Hide(a.ctx) })
	app.AddSeparator()
	app.AddText("Quit MarkView", keys.CmdOrCtrl("q"), func(*menu.CallbackData) { runtime.Quit(a.ctx) })

	file := m.AddSubmenu("File")
	file.AddText("New File", keys.CmdOrCtrl("n"), emit("menu-new-file"))
	file.AddSeparator()
	file.AddText("Open…", keys.CmdOrCtrl("o"), emit("menu-open-file"))
	file.AddText("Open Folder…", cmdShift("o"), emit("menu-open-folder"))
	file.AddSeparator()
	file.AddText("Save", keys.CmdOrCtrl("s"), emit("menu-save"))
	file.AddText("Save As…", cmdShift("s"), emit("menu-save-as"))
	file.AddSeparator()
	file.AddText("Close Tab", keys.CmdOrCtrl("w"), emit("menu-close-tab"))

	m.Append(menu.EditMenu())

	view := m.AddSubmenu("View")
	view.AddText("Editor Only", keys.CmdOrCtrl("1"), emit("menu-view-mode", "editor"))
	view.AddText("Split View", keys.CmdOrCtrl("2"), emit("menu-view-mode", "split"))
	view.AddText("Horizontal Split", nil, emit("menu-view-mode", "hsplit"))
	view.AddText("Preview Only", keys.CmdOrCtrl("3"), emit("menu-view-mode", "preview"))
	view.AddSeparator()
	view.AddText("Cycle View Mode", cmdShift("p"), emit("menu-cycle-view"))
	view.AddSeparator()
	view.AddText("Toggle Sidebar", keys.CmdOrCtrl("b"), emit("menu-toggle-sidebar"))
	view.AddText("Toggle Table of Contents", cmdShift("t"), emit("menu-toggle-toc"))
	view.AddSeparator()
	view.AddText("Reload", keys.CmdOrCtrl("r"), func(*menu.CallbackData) { runtime.WindowReload(a.ctx) })

	m.Append(menu.WindowMenu())
	return m
}
