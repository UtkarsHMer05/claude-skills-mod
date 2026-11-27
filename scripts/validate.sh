#!/usr/bin/env bash
# Checks the plugin manifest, marketplace file, hooks module and skills.
set -euo pipefail
cd "$(dirname "$0")/.."

claude plugin validate .

for f in skills/*/SKILL.md; do
  head -1 "$f" | grep -qx -- '---' || { echo "missing frontmatter: $f"; exit 1; }
  grep -q '^name:' "$f"        || { echo "missing name: $f"; exit 1; }
  grep -q '^description:' "$f" || { echo "missing description: $f"; exit 1; }
done
echo "skills ok"
