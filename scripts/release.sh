#!/usr/bin/env bash
# Build, sign, notarize, and staple Claude Balloon.
set -euo pipefail
cd "$(dirname "$0")/.."

NOTARY_PROFILE="${NOTARY_PROFILE:-AC_PASSWORD}"
VERSION=$(node -p "require('./package.json').version")
DMG_PATH="dist/ClaudeBalloon-${VERSION}-arm64-mac.dmg"

echo "==> Building v${VERSION} (sign + notarize + staple app)"
APPLE_KEYCHAIN_PROFILE="$NOTARY_PROFILE" npx electron-builder --mac --arm64

echo "==> Notarizing DMG"
xcrun notarytool submit "$DMG_PATH" --keychain-profile "$NOTARY_PROFILE" --wait

echo "==> Stapling + verifying"
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"
MOUNT_DIR=$(mktemp -d)
hdiutil attach "$DMG_PATH" -nobrowse -quiet -mountpoint "$MOUNT_DIR"
trap 'hdiutil detach "$MOUNT_DIR" -quiet' EXIT
spctl -a -t exec -vv "$MOUNT_DIR/Claude Balloon.app"

cp "$DMG_PATH" dist/ClaudeBalloon.dmg
echo "==> Done: $DMG_PATH (+ dist/ClaudeBalloon.dmg)"
