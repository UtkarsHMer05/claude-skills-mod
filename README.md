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

`.claude/settings.json` registers this repo as a marketplace and enables both plugins (`skills-mod@skills-mod`, `usage-card@skills-mod`). A Claude Code session opened on this repo, including a cloud session, installs and loads them once the workspace is trusted, with nothing to run by hand. The `.claude/skills/*` links remain as a skills-only fallback.

The usage bars appear after the session's first reply, once Claude Code has received the rate-limit figures.

For cloud sessions on another repo, copy `.claude/settings.json` into that repo, or install from the marketplace in that session.

## Develop

```bash
./scripts/validate.sh
```

```bash
claude --plugin-dir .
```

Add a skill as `skills/<name>/SKILL.md` with `name` and `description` frontmatter.
