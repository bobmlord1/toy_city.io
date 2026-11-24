# AGENTS

Rules for any AI agent working in this repo. Read in this order: `AGENTS.md`, `DESIGN.md`, `ARCHITECTURE.md`, `TASKS.md`, then the latest entries in `agent_comments.md`.

## Roles

- **Project owner:** final decisions, approvals, playtests. Copies finished work into the repo and commits it. Only one set of changes is committed at a time.
- **ChatGPT:** design and planning, and also a hands-on co-coder. Owns `DESIGN.md` and writes tasks in `TASKS.md`. May take code tasks.
- **Claude:** engineering and review. Owns `ARCHITECTURE.md`. May take code tasks, and can review code for the other agent.

Either agent can be assigned code work. Ownership of code files is by task, not by role (see below).

## Ownership by task

1. Every task in `TASKS.md` has an `Assigned to` line and a `Files` line listing the files it will touch.
2. The assigned agent owns those files until the task is marked done. The other agent does not edit them.
3. Before writing code, **claim the task** with a CLAIM entry in `agent_comments.md` (format in that file). If another open claim already lists a file you need, stop and ask in `agent_comments.md` or ask the project owner.
4. Put new features in new files in `src/` where possible. Hook into existing files with small, clearly marked changes.
5. Docs files each have one owner: `DESIGN.md` is ChatGPT's, `ARCHITECTURE.md` is whoever changes the structure (update it in the same change), `TASKS.md` is shared but only edit your own task's status plus the Done list.
6. No approved task, no code. Items under Later in `TASKS.md` are not authorized.

## Working agreements

1. **One task at a time.** Finish or hand off before starting another.
2. **Small, reviewable changes.** Prefer a focused change over a rewrite. Do not reformat files you are not otherwise changing.
3. **Test before handoff.** Run `node tools/smoke_test.js` if you can. If you cannot run code (some chat tools cannot), say so and ask the other agent or the owner to run it.
4. **Say what you did not verify,** for example "not checked in a real browser" or "not checked on touch".
5. **Deliver whole files.** Send complete changed files or a zip, never fragments. List every file changed.
6. **Keep docs true.** If you change behavior, structure or the file list, update `ARCHITECTURE.md` and `TASKS.md` in the same change.
7. **Do not break the guardrails** listed in `ARCHITECTURE.md` (steering signs, single ground-height source, street colliders, load order in `index.html`).
8. **Hand off cleanly.** Usage limits can end a session without warning. When you stop, for any reason, write a HANDOFF entry in `agent_comments.md` so the next session can continue without guessing.
9. **Review each other.** After a code task, the other agent reviews the changed files against the task's "Done when" list and the guardrails, and logs the result.
10. **Kid-safe by default.** No ads, tracking, external links, chat or real-money features.

## When a session starts

The owner pastes the matching prompt from `SESSION_PROMPTS.md`. Agents should read the files listed there before doing anything else, and should not trust a summary of the repo over the files themselves.
