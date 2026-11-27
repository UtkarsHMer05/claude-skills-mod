---
name: commit-message
description: Write a Conventional Commits message for the staged changes. Use when the user asks for a commit message or to commit staged work.
---

# Commit message

1. Run `git diff --cached --stat` and `git diff --cached` to see what is staged.
2. Pick one type: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build` or `ci`.
3. Write a subject line under 72 characters: `<type>(<optional scope>): <imperative summary>`.
4. Add a body only when the reason for the change isn't obvious from the diff. Wrap it at 72 columns.
5. Show the message and wait for the user to approve it before you run `git commit`.
