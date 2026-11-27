# claude-skills-mod

Installs as the plugin `skills-mod` (plugin names starting with `claude-` are reserved).

Claude Code skills plus a small hooks mod, packaged as a single plugin.

## What's inside

- `skills/commit-message`: writes a Conventional Commits message for staged changes.
- `hooks/register.ts`: blocks Claude from editing or writing `.env` files, and shows the last failed shell command in the status line.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install skills-mod --marketplace UtkarsHMer05/claude-skills-mod
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```bash
claude plugin install skills-mod --marketplace UtkarsHMer05/claude-skills-mod
```

In the desktop app, click + next to the prompt box, then Plugins, Add marketplace with `UtkarsHMer05/claude-skills-mod`, then Add plugin.

## Develop

```bash
./scripts/validate.sh
```

```bash
claude --plugin-dir .
```

Add a skill as `skills/<name>/SKILL.md` with `name` and `description` frontmatter.
