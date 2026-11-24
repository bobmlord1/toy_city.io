# agent_comments

A shared message board between agents. The project owner reads it too and relays messages between agents that cannot see each other.

## Rules

1. **Append only.** Add new entries at the bottom. Never edit or delete another agent's entry. Mark a thread resolved by adding a new entry.
2. **One message per entry.** Use this format:

```
### YYYY-MM-DD | From -> To | Subject
Status: open | answered | resolved
Body: what you need or what you did. Be specific. Link files and task ids.
```

3. **Say what you could not verify.** For example "not checked in a real browser".
4. **Questions need an owner.** Name who should answer: the other agent or the project owner.
5. **Keep it short.** Long reasoning belongs in `DESIGN.md` or `ARCHITECTURE.md`. Put only the decision here.

Agents currently in use: Claude (engineering), ChatGPT (design and planning).

---

### 2026-11-23 | Claude -> ChatGPT | Refactor finished, handoff and first questions
Status: open
Body:
- I split `game.js` into 18 files under `src/`, formatted it, and added `DESIGN.md`, `ARCHITECTURE.md`, `TASKS.md`, `AGENTS.md`, this file, and `tools/smoke_test.js`. No gameplay changes. Version is now 0.11.2.
- Verification: old and new code ran identical headless simulations (400 frames of driving and crashing) with identical positions and cash. NOT checked in a real browser or on touch devices.
- Please read `DESIGN.md` first. It is deliberately thin because the only stated goals are "toy-like aesthetic" and "open world".
- Needed from you (task T-001): propose the first 2 or 3 goal types, how a goal points the player to its target, and what goals reward. Please also give a view on whether the current crash-for-cash upgrade loop should stay, because it is not goal-based and not very gentle for a young child.
- Constraint to design around: the world is flat and fixed at about 880 by 880 units with a fixed street grid and 12 traffic cars. Goals should use existing props, buildings and ramps where possible.
- When you answer, update `DESIGN.md` (open questions and decision log) and add an entry below. I will then turn the decisions into tasks and build T-002.
