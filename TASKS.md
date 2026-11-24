# TASKS

Keep this short. Each coding agent works on one task at a time. Move finished items to Done with a date.

## How to write a task

```
### T-000 Short title
Assigned to: Claude | ChatGPT | project owner
Files: files this task may touch (new files marked "new")
Why: one sentence.
Done when: observable result a person can check.
Notes: constraints, links to DESIGN.md decisions.
```

## Now

### T-001 Approve the first activity types and reward model
Assigned to: project owner, informed by the design proposal in `DESIGN.md`.
Why: Engineering needs a stable gameplay decision before building objectives.
Done when: the project owner approves or amends the three proposed activities and the reward direction in `DESIGN.md`.
Status: design proposal is written; awaiting owner approval. Either agent may review feasibility but must not implement the goal system until approval.

## Next

### T-002 Goals system v1
Assigned to: unassigned (either coding agent). Blocked by T-001 approval.
Files: provisional, a new `src/goals.js` plus small hooks in `hud.js`, `camera_render.js` and `index.html`. The assigned agent confirms this in its CLAIM entry.
Why: Add optional direction and predictable payouts without compromising free-roam play.
Done when:
- One activity can be active at a time and can be ignored or left without penalty.
- The first approved activity type works end to end with a visible 3D target, minimap marker, progress/completion feedback and one-time cash payout.
- The activity can be completed and another offered without reloading the game.
- Existing driving, traffic, vehicle switching, ramps, upgrades and crash/airtime rewards still work.
Notes: Follow the approved decisions in `DESIGN.md`. Keep v1 data-driven and use fixed locations/existing systems. No timers, fail states, cargo physics, procedural mission generation or full GPS routing.

### T-003 Confirm the child's primary input device
Assigned to: project owner.
Why: Keyboard, touch or controller changes activity controls and HUD decisions.
Done when: the primary input device is written into `DESIGN.md` under Audience.

## Later: proposed order, not yet authorized

- Add the other two approved activity types after T-002 proves the activity framework.
- Improve traffic variety and route selection; assess density before simply increasing the car count.
- Add more smashable physics props in selected districts, using deterministic placement and keeping streets/ramps clear.
- Distribute upgrade access around the city only if playtesting shows the single tuning pad is inconvenient.
- Reapply the accepted toy-playset visual direction after the refactor, using the existing WebGL renderer and procedural geometry/material system. See the prior visual-development brief in the project conversation; do not introduce Blender or a new rendering engine.
- Consider cosmetic rewards (vehicle colors, stickers, city decorations) after the cash/activity loop is balanced.
- Treat the flying/hover car as a late-game capstone, not part of the first objective milestone.
- Kid-friendly HUD: fewer words, bigger icons, hide the tuning panel unless needed.
- Sound: engine hum, crash pops, goal jingle. Keep volume low by default.
- Optional driving assist and an easy un-stick action.
- Replace stale README launch instructions (mentions scripts that are not in the repo).
- Remove or clearly archive the unused root `game.js` after confirming it is no longer a supported entry point; avoid two apparent sources of truth.
- Optional: convert `src/` to ES modules only if the shared global scope becomes a real problem.

## Done

- 2026-11-23 Refactor: split the single 2,971-line `game.js` into 18 files in `src/`, formatted the code, added `tools/smoke_test.js`, and added the project docs. Gameplay is unchanged. Claude reports identical old/new 400-frame headless simulations; browser/touch playtesting remains outstanding.
