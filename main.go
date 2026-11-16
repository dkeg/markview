package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

const version = "2.0.0"

//go:embed all:frontend
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:            "MarkView",
		Width:            1280,
		Height:           800,
		MinWidth:         620,
		MinHeight:        400,
		AssetServer:      &assetserver.Options{Assets: assets, Handler: localFileHandler{}},
		BackgroundColour: &options.RGBA{R: 0, G: 0, B: 0, A: 0},
		Menu:             app.buildMenu(),
		OnStartup:        app.startup,
		Bind:             []any{app},
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,
			DisableWebViewDrop: true,
		},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			Appearance:           mac.DefaultAppearance,
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
			OnFileOpen:           app.handleFileOpen,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
