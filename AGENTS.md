# AGENTS

Rules for any AI agent working in this repo. Read in this order: `AGENTS.md`, `DESIGN.md`, `ARCHITECTURE.md`, `TASKS.md`, then the latest entries in `agent_comments.md`.

## Roles

- **Project owner:** final decisions, playtests, moves files between agents.
- **ChatGPT, design and planning:** owns `DESIGN.md` and writes tasks in `TASKS.md`. Does not change code.
- **Claude, engineering:** owns `ARCHITECTURE.md` and everything in `src/`, `index.html` and `tools/`. Does not change design decisions, and raises conflicts in `agent_comments.md` instead.

## Working agreements

1. **One task at a time.** Work from the top of Now or Next in `TASKS.md`. Do not start unrelated changes.
2. **Respect file ownership.** Do not edit a file another agent owns. Leave a note in `agent_comments.md`.
3. **Small, reviewable changes.** Prefer a focused change over a rewrite. Do not reformat files you are not otherwise changing.
4. **Test before handoff.** Run `node tools/smoke_test.js`. State in `agent_comments.md` what was and was not verified.
5. **Deliver whole files.** When sharing code between chats, send complete changed files or a zip, not fragments.
6. **Keep docs true.** If you change behavior or structure, update `ARCHITECTURE.md` and `TASKS.md` in the same change.
7. **Do not break the guardrails** listed in `ARCHITECTURE.md` (steering signs, single ground-height source, street colliders).
8. **Kid-safe by default.** No ads, tracking, external links, chat or real-money features.
