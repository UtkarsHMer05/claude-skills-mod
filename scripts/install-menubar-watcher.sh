#!/bin/bash
# Installs two macOS launch agents for the SwiftBar usage item:
#
# 1. usage-card-menubar: refreshes the item the moment the usage-card mod saves
#    a new reading, so the menu bar moves in step with the usage bar in Claude
#    Code. launchd runs it only when the file changes; nothing runs otherwise.
#    It only refreshes a SwiftBar that is already running.
# 2. usage-card-companion: starts SwiftBar when the Claude desktop app opens and
#    quits it when Claude quits (scripts/menubar-companion.swift). It waits on
#    macOS's app launch/quit notifications and uses no CPU in between.
#
#   scripts/install-menubar-watcher.sh            install (or reinstall) and start
#   scripts/install-menubar-watcher.sh uninstall  stop and remove both
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
STORE="$HOME/.claude/plugins/store"
SUPPORT="$HOME/Library/Application Support/usage-card-menubar"
WATCHER="dev.skills-mod.usage-card-menubar"
COMPANION="dev.skills-mod.usage-card-companion"

for label in "$WATCHER" "$COMPANION"; do
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
done

if [ "$1" = "uninstall" ]; then
  rm -f "$AGENTS/$WATCHER.plist" "$AGENTS/$COMPANION.plist"
  rm -rf "$SUPPORT"
  echo "Removed $WATCHER and $COMPANION"
  exit 0
fi

mkdir -p "$STORE" "$AGENTS" "$SUPPORT"

# ── 1. the file watcher ─────────────────────────────────────────────────────
# Watch the store folder and each usage-card file in it (a file rewritten in
# place changes the file, not the folder).
WATCH="    <string>$STORE</string>"
for f in "$STORE"/usage-card_*.json; do
  [ -e "$f" ] && WATCH="$WATCH
    <string>$f</string>"
done

cat > "$AGENTS/$WATCHER.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$WATCHER</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>/usr/bin/pgrep -xq SwiftBar &amp;&amp; /usr/bin/open -g "swiftbar://refreshplugin?name=usage-card"; exit 0</string>
  </array>
  <key>WatchPaths</key>
  <array>
$WATCH
  </array>
  <!-- launchd waits 10 s between runs by default; 1 s keeps up with Claude Code. -->
  <key>ThrottleInterval</key>
  <integer>1</integer>
</dict>
</plist>
EOF

# ── 2. the companion ────────────────────────────────────────────────────────
swiftc -O "$DIR/menubar-companion.swift" -o "$SUPPORT/menubar-companion"

cat > "$AGENTS/$COMPANION.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$COMPANION</string>
  <key>ProgramArguments</key>
  <array>
    <string>$SUPPORT/menubar-companion</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
EOF

for label in "$WATCHER" "$COMPANION"; do
  plutil -lint "$AGENTS/$label.plist" >/dev/null
  launchctl bootstrap "gui/$(id -u)" "$AGENTS/$label.plist"
done

# When the usage item is hidden (another app in front), SwiftBar would show its
# own "SwiftBar" item instead; this keeps the menu bar empty.
defaults write com.ameba.SwiftBar HideSwiftBarIcon -bool YES

# The companion starts SwiftBar now, so it no longer needs a login item.
osascript -e 'tell application "System Events" to if exists login item "SwiftBar" then delete login item "SwiftBar"' >/dev/null 2>&1 || true

echo "Installed $WATCHER, watching:"
echo "$WATCH" | sed 's/ *<\/\{0,1\}string>//g; s/^/  /'
echo "Installed $COMPANION: SwiftBar now opens and quits with Claude."
