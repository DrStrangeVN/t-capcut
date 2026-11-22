#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> [1/5] Generating embedded offline assets & building workspace packages..."
pnpm --filter @t-capcut/presets generate-assets
pnpm -r build

echo "==> [2/5] Compiling native Apple Vision / Speech / CoreText / Metal helper..."
mkdir -p native/bin
swiftc -O \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker native/tcapcut-vision/Info.plist \
  native/tcapcut-vision/main.swift -o native/bin/tcapcut-vision

echo "==> [3/5] Compiling native macOS Liquid Glass Shell..."
APP_DIR="$ROOT_DIR/dist/T-CapCut.app"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources/engine/dist" "$APP_DIR/Contents/Resources/studio-dist" "$APP_DIR/Contents/Resources/native/bin" "$APP_DIR/Contents/Resources/bin"

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
  <string>3.0.0</string>
  <key>CFBundleVersion</key>
  <string>300</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSSpeechRecognitionUsageDescription</key>
  <string>T-CapCut uses on-device Apple Speech Recognition for offline subtitles and captions.</string>
</dict>
</plist>
EOF

echo "==> [4/5] Packaging AppIcon, standalone Node runtime, engine, schema, studio UI, and native Vision binary..."
if [ -f "$ROOT_DIR/assets/AppIcon.icns" ]; then
  cp "$ROOT_DIR/assets/AppIcon.icns" "$APP_DIR/Contents/Resources/AppIcon.icns"
fi

# Bundle standalone arm64 Node runtime so T-CapCut.app works even on Macs without Homebrew Node
NODE_BIN="$(command -v node || true)"
if [ -n "$NODE_BIN" ] && [ -f "$NODE_BIN" ]; then
  if lipo -info "$NODE_BIN" 2>/dev/null | grep -q "arm64"; then
    lipo -thin arm64 "$NODE_BIN" -output "$APP_DIR/Contents/Resources/bin/node" 2>/dev/null || cp "$NODE_BIN" "$APP_DIR/Contents/Resources/bin/node"
    chmod +x "$APP_DIR/Contents/Resources/bin/node"
  fi
fi

cp -R packages/engine/dist/* "$APP_DIR/Contents/Resources/engine/dist/"
cp packages/engine/package.json "$APP_DIR/Contents/Resources/engine/"
mkdir -p "$APP_DIR/Contents/Resources/engine/node_modules/@t-capcut/schema"
cp -R packages/schema/dist "$APP_DIR/Contents/Resources/engine/node_modules/@t-capcut/schema/"
cp packages/schema/package.json "$APP_DIR/Contents/Resources/engine/node_modules/@t-capcut/schema/"
mkdir -p "$APP_DIR/Contents/Resources/engine/node_modules/@t-capcut/presets"
cp -R packages/presets/dist "$APP_DIR/Contents/Resources/engine/node_modules/@t-capcut/presets/"
cp packages/presets/package.json "$APP_DIR/Contents/Resources/engine/node_modules/@t-capcut/presets/"
mkdir -p "$APP_DIR/Contents/Resources/presets-assets"
cp -R packages/presets/assets/* "$APP_DIR/Contents/Resources/presets-assets/"
cp -R apps/studio/dist/* "$APP_DIR/Contents/Resources/studio-dist/"
cp native/bin/tcapcut-vision "$APP_DIR/Contents/Resources/native/bin/tcapcut-vision"

codesign --force --deep --sign - "$APP_DIR" >/dev/null 2>&1 || true

echo "==> [5/5] Creating macOS DMG Installer..."
DMG_STAGE="$ROOT_DIR/dist/dmg-stage"
DMG_OUT="$ROOT_DIR/dist/T-CapCut-3.0.0-arm64.dmg"
rm -rf "$DMG_STAGE" "$DMG_OUT"
mkdir -p "$DMG_STAGE"
cp -R "$APP_DIR" "$DMG_STAGE/T-CapCut.app"
ln -s /Applications "$DMG_STAGE/Applications"
hdiutil create -volname "T-CapCut 3.0.0" -srcfolder "$DMG_STAGE" -ov -format UDZO "$DMG_OUT" >/dev/null
rm -rf "$DMG_STAGE"

shasum -a 256 "$DMG_OUT" > "${DMG_OUT}.sha256"

echo "==> Build complete:"
echo "    App Bundle: $APP_DIR"
echo "    Installer : $DMG_OUT"
echo "    Checksum  : ${DMG_OUT}.sha256"
