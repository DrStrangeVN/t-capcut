#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> [1/5] Building workspace TypeScript & Vite packages..."
pnpm -r build

echo "==> [2/5] Compiling native Apple Vision / CoreText / Metal helper..."
mkdir -p native/bin
swiftc -O native/tcapcut-vision/main.swift -o native/bin/tcapcut-vision

echo "==> [3/5] Compiling native macOS Liquid Glass Shell..."
APP_DIR="$ROOT_DIR/dist/T-CapCut.app"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources/engine/dist" "$APP_DIR/Contents/Resources/studio-dist" "$APP_DIR/Contents/Resources/native/bin"

swiftc -O apps/macos-shell/main.swift -o "$APP_DIR/Contents/MacOS/T-CapCut"

cat > "$APP_DIR/Contents/Info.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>T-CapCut</string>
  <key>CFBundleExecutable</key>
  <string>T-CapCut</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>com.tcapcut.studio</string>
  <key>CFBundleName</key>
  <string>T-CapCut</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>100</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

echo "==> [4/5] Packaging AppIcon, engine, schema, studio UI, and native Vision binary..."
if [ -f "$ROOT_DIR/assets/AppIcon.icns" ]; then
  cp "$ROOT_DIR/assets/AppIcon.icns" "$APP_DIR/Contents/Resources/AppIcon.icns"
fi
cp -R packages/engine/dist/* "$APP_DIR/Contents/Resources/engine/dist/"
cp packages/engine/package.json "$APP_DIR/Contents/Resources/engine/"
mkdir -p "$APP_DIR/Contents/Resources/engine/node_modules/@t-capcut/schema"
cp -R packages/schema/dist "$APP_DIR/Contents/Resources/engine/node_modules/@t-capcut/schema/"
cp packages/schema/package.json "$APP_DIR/Contents/Resources/engine/node_modules/@t-capcut/schema/"
cp -R apps/studio/dist/* "$APP_DIR/Contents/Resources/studio-dist/"
cp native/bin/tcapcut-vision "$APP_DIR/Contents/Resources/native/bin/tcapcut-vision"

codesign --force --deep --sign - "$APP_DIR" >/dev/null 2>&1 || true

echo "==> [5/5] Creating macOS DMG Installer..."
DMG_STAGE="$ROOT_DIR/dist/dmg-stage"
DMG_OUT="$ROOT_DIR/dist/T-CapCut-1.0.0-arm64.dmg"
rm -rf "$DMG_STAGE" "$DMG_OUT"
mkdir -p "$DMG_STAGE"
cp -R "$APP_DIR" "$DMG_STAGE/T-CapCut.app"
ln -s /Applications "$DMG_STAGE/Applications"
hdiutil create -volname "T-CapCut 1.0.0" -srcfolder "$DMG_STAGE" -ov -format UDZO "$DMG_OUT" >/dev/null
rm -rf "$DMG_STAGE"

echo "==> Build complete:"
echo "    App Bundle: $APP_DIR"
echo "    Installer : $DMG_OUT"
