# TASKS

Keep this short. One task at a time goes to engineering. Move finished items to Done with a date.

## How to write a task

```
### T-000 Short title
Why: one sentence.
Done when: observable result a person can check.
Notes: constraints, links to DESIGN.md decisions.
```

## Now

### T-001 Decide the first goal types and the reward model
Owner: design agent (ChatGPT), final say with the project owner.
Why: Engineering cannot build goals until the first 2 or 3 goal types and how they reward the player are chosen.
Done when: `DESIGN.md` answers open questions 1 to 4, and a decision log line is added.

## Next

### T-002 Goals system v1
Owner: engineering (Claude). Blocked by T-001.
Why: The game has no goals yet. A child needs something simple to do.
Done when: a new `src/goals.js` runs one data-driven goal type end to end (marker in the world, minimap marker, completion feedback, next goal starts), and adding a second goal of the same type needs data only.

### T-003 Goal guidance marker
Owner: engineering. Blocked by T-001.
Why: A child must be able to see where to go without reading.
Done when: the active goal shows a visible beacon or arrow in the 3D world and a marker on the minimap.

### T-004 Confirm how the child plays
Owner: project owner.
Why: Keyboard, touch, or controller changes control and UI decisions.
Done when: the input device is written into `DESIGN.md` under Audience.

## Later

- Kid-friendly HUD: fewer words, bigger icons, hide the tuning panel unless needed.
- Sound: engine hum, crash pops, goal jingle. Keep volume low by default.
- Simpler driving assist (optional): gentle auto-steer, easy un-stick button.
- Cosmetic rewards: vehicle colors, stickers, city decorations.
- Revisit the crash-for-cash economy once goals exist.
- Replace `README.txt` run instructions (mentions scripts that are not in the repo).
- Optional: convert `src/` to ES modules if the shared global scope becomes a problem.

## Done

- 2026-11-23 Refactor: split the single 2,971-line `game.js` into 18 files in `src/`, formatted the code, added `tools/smoke_test.js`, and added the project docs. Gameplay is unchanged. Verified by running the old and new code through identical 400-frame simulations with identical results. Version bumped to 0.11.2.
