#!/bin/bash
# <xbar.title>Claude usage</xbar.title>
# <xbar.desc>5-hour and weekly Claude limits left, from the usage-card mod's last reading.</xbar.desc>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>true</swiftbar.hideLastUpdated>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
#
# SwiftBar menu bar plugin. Reads the numbers the usage-card mod saves after
# each Claude Code reply on this Mac; makes no network calls. Refreshes every
# minute (the ".1m" in the file name).

STORE="$HOME/.claude/plugins/store"
CELLS=20

# The newest reading any copy of the mod saved.
FILE=$(ls -t "$STORE"/usage-card_*.json 2>/dev/null | head -1)

if [ -z "$FILE" ] || ! plutil -extract latest raw "$FILE" >/dev/null 2>&1; then
  echo "Claude usage: –"
  echo "---"
  echo "No reading yet. Send a message in a Claude Code session."
  echo "Open usage on claude.ai | href=https://claude.ai/settings/usage"
  exit 0
fi

NOW=$(date +%s)

iso_to_epoch() { # 2026-12-01T23:00:00.000Z -> seconds
  local s=${1%.*}; s=${s%Z}
  date -j -u -f "%Y-%m-%dT%H:%M:%S" "$s" +%s 2>/dev/null
}

# Colour by % left, the mod's ramp: 100 green, 75 lime, 50 yellow, 25 orange, 0 red.
color_for() {
  awk -v p="$1" 'BEGIN {
    split("0 25 50 75 100", at, " ")
    split("ef4444 f97316 facc15 a3e635 22c55e", hx, " ")
    if (p <= 0) { print "#" hx[1]; exit } if (p >= 100) { print "#" hx[5]; exit }
    for (i = 1; i < 5; i++) if (p <= at[i+1]) break
    t = (p - at[i]) / (at[i+1] - at[i])
    out = "#"
    for (c = 0; c < 3; c++) {
      a = 0; b = 0
      for (k = 1; k <= 2; k++) {
        ha = substr(hx[i], c*2 + k, 1); hb = substr(hx[i+1], c*2 + k, 1)
        a = a * 16 + index("0123456789abcdef", ha) - 1
        b = b * 16 + index("0123456789abcdef", hb) - 1
      }
      out = out sprintf("%02x", int(a + (b - a) * t + 0.5))
    }
    print out
  }'
}

reset_text() { # epoch -> "resets in 1h 11m" / "resets Wed 4:30 AM"
  local at=$1
  [ -z "$at" ] && return
  local ms=$((at - NOW))
  if [ $ms -le 0 ]; then echo "resetting…"; return; fi
  local mins=$(( (ms + 30) / 60 ))
  if [ $mins -lt 60 ]; then echo "resets in ${mins}m"; return; fi
  local h=$((mins / 60)) m=$((mins % 60))
  if [ $h -lt 24 ]; then printf 'resets in %dh %02dm\n' $h $m; return; fi
  echo "resets $(date -r "$at" '+%a %-I:%M %p')"
}

TITLE=()
MENU=()
LOWEST=101

for i in 0 1 2 3; do
  KIND=$(plutil -extract "latest.$i.kind" raw "$FILE" 2>/dev/null) || break
  case "$KIND" in
    five_hour) LABEL="5-hour"; SHORT="5h" ;;
    seven_day) LABEL="Weekly"; SHORT="Wk" ;;
    *) continue ;;
  esac
  USED=$(plutil -extract "latest.$i.percentUsed" raw "$FILE" 2>/dev/null)
  RESETS=$(plutil -extract "latest.$i.resetsAt" raw "$FILE" 2>/dev/null)
  AT=""
  [ -n "$RESETS" ] && AT=$(iso_to_epoch "$RESETS")

  LEFT=$(awk -v u="$USED" 'BEGIN { l = 100 - u; if (l < 0) l = 0; if (l > 100) l = 100; printf "%d", l + 0.5 }')
  # A window whose reset time has passed starts again from zero used.
  if [ -n "$AT" ] && [ "$AT" -le "$NOW" ]; then LEFT=100; AT=""; fi
  [ "$LEFT" -lt "$LOWEST" ] && LOWEST=$LEFT

  COLOR=$(color_for "$LEFT")
  FILLED=$(( (LEFT * CELLS + 50) / 100 ))
  BAR=""
  for ((c = 0; c < CELLS; c++)); do
    if [ $c -lt $FILLED ]; then BAR+="█"; else BAR+="░"; fi
  done

  TITLE+=("$SHORT $LEFT%")
  MENU+=("$LABEL: $LEFT% left | color=$COLOR")
  MENU+=("$BAR | font=Menlo size=12 color=$COLOR")
  R=$(reset_text "$AT")
  [ -n "$R" ] && MENU+=("$R | size=11")
  MENU+=("---")
done

if [ ${#TITLE[@]} -eq 0 ]; then
  echo "Claude usage: –"
else
  T="${TITLE[0]}"
  for t in "${TITLE[@]:1}"; do T+=" · $t"; done
  echo "$T | color=$(color_for "$LOWEST"),$(color_for "$LOWEST") sfimage=gauge.with.needle"
fi
echo "---"
for line in "${MENU[@]}"; do echo "$line"; done

SAVED=$(stat -f %m "$FILE")
AGE=$(( (NOW - SAVED) / 60 ))
if [ $AGE -lt 1 ]; then AGO="just now"
elif [ $AGE -lt 60 ]; then AGO="${AGE}m ago"
elif [ $AGE -lt 1440 ]; then AGO="$((AGE / 60))h $((AGE % 60))m ago"
else AGO="$((AGE / 1440))d ago"; fi
echo "Reading from a Claude Code reply $AGO | size=11"
echo "Updates when a Claude Code session on this Mac gets a reply | size=11"
echo "Open usage on claude.ai | href=https://claude.ai/settings/usage"
echo "Refresh | refresh=true"
