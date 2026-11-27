#!/bin/bash
# Cloud environment setup script: turns on the usage-card mod (usage bars)
# for every cloud session in this environment, whatever repo it opens.
# Paste or upload it as the environment's "Setup script".
# Needs github.com allowed under the environment's Network access.
set -e

mkdir -p "$HOME/.claude"
SETTINGS="$HOME/.claude/settings.json"

if command -v python3 >/dev/null 2>&1; then
  # Merge into any settings that already exist.
  python3 - "$SETTINGS" <<'EOF'
import json, os, sys
p = sys.argv[1]
try:
    s = json.load(open(p)) if os.path.exists(p) else {}
except ValueError:
    s = {}
s.setdefault('extraKnownMarketplaces', {})['skills-mod'] = {
    'source': {'source': 'github', 'repo': 'UtkarsHMer05/claude-skills-mod'}}
s.setdefault('enabledPlugins', {})['usage-card@skills-mod'] = True
json.dump(s, open(p, 'w'), indent=2)
EOF
elif [ ! -s "$SETTINGS" ]; then
  # No python3 and no settings yet: write the file whole.
  cat > "$SETTINGS" <<'EOF'
{
  "extraKnownMarketplaces": {
    "skills-mod": {
      "source": { "source": "github", "repo": "UtkarsHMer05/claude-skills-mod" }
    }
  },
  "enabledPlugins": {
    "usage-card@skills-mod": true
  }
}
EOF
else
  echo "cloud-setup: python3 missing and $SETTINGS already exists; usage-card not added" >&2
fi

echo "cloud-setup: usage-card enabled in $SETTINGS"
