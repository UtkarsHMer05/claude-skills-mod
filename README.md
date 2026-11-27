# claude-skills-mod

Installs as the plugin `skills-mod` (plugin names starting with `claude-` are reserved).

Claude Code skills plus a small hooks mod, packaged as a single plugin.

## What's inside

- `skills/commit-message`: writes a Conventional Commits message for staged changes.
- `hooks/register.ts`: blocks Claude from editing or writing `.env` files, and shows the last failed shell command in the status line.
- `mods/usage-card`: a separate mod that shows how much of your 5-hour and weekly Claude plan limits is left, as gradient bars above the prompt, with reset times. It reads only the rate-limit figures Claude Code already receives; nothing is fetched.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install skills-mod --marketplace UtkarsHMer05/claude-skills-mod
```

For the usage card:

```
/plugin install usage-card --marketplace UtkarsHMer05/claude-skills-mod
```

Answer `y` to add the marketplace, then pick a scope.

### Cloud sessions

`.claude/skills/usage-card` links to `mods/usage-card`, so a Claude Code session opened on this repo (including a cloud session) loads the usage card by itself, once the workspace is trusted. The bars appear after the session's first reply. To get the card in cloud sessions on another repo, copy `mods/usage-card` into that repo's `.claude/skills/usage-card`.

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
