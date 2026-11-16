export PATH := $(PATH):/usr/local/go/bin:$(HOME)/go/bin
export MACOSX_DEPLOYMENT_TARGET := 13.0
export CGO_CFLAGS  := -mmacosx-version-min=13.0
export CGO_LDFLAGS := -mmacosx-version-min=13.0

WAILS   := $(shell PATH="$(PATH)" command -v wails || echo $(HOME)/go/bin/wails)

APP     := build/bin/MarkView.app
VERSION := $(shell sed -n 's/^const version = "\(.*\)"/\1/p' main.go)
DMG     := build/bin/MarkView-$(VERSION)-universal.dmg

.PHONY: dev build build-arm64 build-x64 dmg release publish tools clean

dev:            ## Run with live reload (also serves http://localhost:34115)
	$(WAILS) dev

build:          ## Universal (arm64 + x86_64) .app
	$(WAILS) build -platform darwin/universal -clean

build-arm64:
	$(WAILS) build -platform darwin/arm64 -clean

build-x64:
	$(WAILS) build -platform darwin/amd64 -clean

dmg: build      ## Universal .app packaged as a .dmg
	rm -f $(DMG)
	hdiutil create -volname MarkView -srcfolder $(APP) -ov -format UDZO $(DMG)

release:        ## Signed + notarized DMG and Homebrew cask (see scripts/release.sh)
	scripts/release.sh build

publish:        ## Tag, create the GitHub release, update the Homebrew tap
	scripts/release.sh publish

tools:          ## Install the Wails CLI
	go install github.com/wailsapp/wails/v2/cmd/wails@v2.17.1

clean:
	rm -rf build/bin
