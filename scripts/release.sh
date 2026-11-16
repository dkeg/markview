#!/usr/bin/env bash
# Build, sign, notarize and publish a MarkView release.
#
#   scripts/release.sh build     # signed + notarized DMG and cask in build/bin/
#   scripts/release.sh publish   # GitHub release + Homebrew tap update
#
# One-time setup:
#   xcrun notarytool store-credentials markview-notary \
#     --apple-id <apple id> --team-id <team id>
#
# Environment overrides:
#   SIGN_IDENTITY   codesign identity (default: first "Developer ID Application")
#   NOTARY_PROFILE  notarytool keychain profile (default: markview-notary)
#   TAP_REPO        Homebrew tap repo (default: dkeg/homebrew-tap)
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="$PATH:/usr/local/go/bin:$HOME/go/bin"
export MACOSX_DEPLOYMENT_TARGET=13.0 CGO_CFLAGS=-mmacosx-version-min=13.0 CGO_LDFLAGS=-mmacosx-version-min=13.0

REPO="dkeg/markview"
TAP_REPO="${TAP_REPO:-dkeg/homebrew-tap}"
NOTARY_PROFILE="${NOTARY_PROFILE:-markview-notary}"

VERSION="$(sed -n 's/^const version = "\(.*\)"/\1/p' main.go)"
TAG="v$VERSION"
OUT="build/bin"
APP="$OUT/MarkView.app"
DMG="$OUT/MarkView-$VERSION-universal.dmg"
CASK="$OUT/markview.rb"

die()  { echo "error: $*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

check_version() {
  local wails_version
  wails_version="$(python3 -c 'import json;print(json.load(open("wails.json"))["info"]["productVersion"])')"
  [[ "$VERSION" == "$wails_version" ]] || die "main.go version ($VERSION) != wails.json productVersion ($wails_version)"
  grep -q "^## \[$VERSION\]" CHANGELOG.md || die "CHANGELOG.md has no entry for $VERSION"
}

release_notes() {
  # The CHANGELOG section for $VERSION, without its heading.
  awk -v v="$VERSION" '
    $0 ~ "^## \\[" v "\\]" { on = 1; next }
    on && /^---$/          { exit }
    on                     { print }
  ' CHANGELOG.md
}

notarize() {
  xcrun notarytool submit "$1" --keychain-profile "$NOTARY_PROFILE" --wait \
    | tee /dev/stderr | grep -q "status: Accepted" || die "notarization failed for $1"
}

cmd_build() {
  check_version
  command -v wails >/dev/null || die "wails CLI not found (run: make tools)"
  xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1 \
    || die "notary profile '$NOTARY_PROFILE' not found; see the setup note at the top of this script"

  local identity="${SIGN_IDENTITY:-}"
  if [[ -z "$identity" ]]; then
    identity="$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application: .*\)"/\1/p' | head -1)"
  fi
  [[ -n "$identity" ]] || die "no Developer ID Application identity found"

  step "Building MarkView $VERSION (universal)"
  wails build -platform darwin/universal -clean

  step "Signing app with: $identity"
  codesign --force --options runtime --timestamp --sign "$identity" "$APP"
  codesign --verify --strict --verbose=2 "$APP"

  step "Notarizing app"
  local zip="$OUT/MarkView-notarize.zip"
  ditto -c -k --keepParent "$APP" "$zip"
  notarize "$zip"
  rm -f "$zip"
  xcrun stapler staple "$APP"

  step "Creating DMG"
  local stage
  stage="$(mktemp -d)"
  cp -R "$APP" "$stage/"
  ln -s /Applications "$stage/Applications"
  rm -f "$DMG"
  hdiutil create -volname "MarkView" -srcfolder "$stage" -ov -format UDZO "$DMG" >/dev/null
  rm -rf "$stage"
  codesign --force --timestamp --sign "$identity" "$DMG"

  step "Notarizing DMG"
  notarize "$DMG"
  xcrun stapler staple "$DMG"

  step "Verifying Gatekeeper acceptance"
  spctl --assess --type execute --verbose=2 "$APP"
  spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG"

  write_cask
  step "Done"
  echo "  $DMG"
  echo "  $CASK"
  echo "  sha256 $(shasum -a 256 "$DMG" | cut -d' ' -f1)"
}

write_cask() {
  local sha
  sha="$(shasum -a 256 "$DMG" | cut -d' ' -f1)"
  cat > "$CASK" <<EOF
cask "markview" do
  version "$VERSION"
  sha256 "$sha"

  url "https://github.com/$REPO/releases/download/v#{version}/MarkView-#{version}-universal.dmg"
  name "MarkView"
  desc "Markdown viewer and editor"
  homepage "https://github.com/$REPO"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :ventura"

  app "MarkView.app"

  zap trash: [
    "~/Library/Application Support/MarkView",
    "~/Library/Caches/com.markview.app",
    "~/Library/HTTPStorages/com.markview.app",
    "~/Library/Preferences/com.markview.app.plist",
    "~/Library/Saved Application State/com.markview.app.savedState",
    "~/Library/WebKit/com.markview.app",
  ]
end
EOF
}

cmd_publish() {
  check_version
  [[ -f "$DMG" && -f "$CASK" ]] || die "run '$0 build' first"
  xcrun stapler validate "$DMG" >/dev/null || die "$DMG is not notarized/stapled"
  [[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || die "publish from main"
  [[ -z "$(git status --porcelain --untracked-files=no)" ]] || die "working tree has uncommitted changes"
  git fetch -q origin main
  [[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || die "local main is not in sync with origin/main"

  step "Tagging $TAG"
  if ! git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    git tag -a "$TAG" -m "MarkView $VERSION"
  fi
  git push origin "$TAG"

  step "Creating GitHub release $TAG"
  local title="${RELEASE_TITLE:-MarkView $VERSION}"
  gh release create "$TAG" "$DMG" -R "$REPO" --title "$title" --notes "$(release_notes)" --verify-tag

  step "Updating Homebrew tap $TAP_REPO"
  local tap
  tap="$(mktemp -d)"
  gh repo clone "$TAP_REPO" "$tap" -- -q
  mkdir -p "$tap/Casks"
  cp "$CASK" "$tap/Casks/markview.rb"
  git -C "$tap" add Casks/markview.rb
  git -C "$tap" commit -q -m "markview $VERSION"
  git -C "$tap" push -q origin HEAD
  rm -rf "$tap"

  step "Published"
  echo "  https://github.com/$REPO/releases/tag/$TAG"
  echo "  brew install --cask ${TAP_REPO%%/*}/${TAP_REPO#*/homebrew-}/markview"
}

case "${1:-}" in
  build)   cmd_build ;;
  publish) cmd_publish ;;
  notes)   release_notes ;;
  *)       echo "usage: $0 {build|publish|notes}" >&2; exit 2 ;;
esac
