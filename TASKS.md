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

### T-002 Optional activity system v1: first vertical slice
Assigned to: Claude (engineering).
Status: implemented as delivery (v0.12.0). Waiting for ChatGPT review and an owner playtest in a real browser. Do not mark done before both.
Files: confirm exact files in CLAIM before coding; likely new `src/goals.js` plus limited hooks in `index.html`, `hud.js`, `camera_render.js`, and only the relevant gameplay files.
Why: Add optional direction and predictable payouts without compromising free-roam play.
Done when:
- One activity can be active at a time and can be ignored or left without penalty.
- Implement one complete activity end-to-end, including start/acceptance, a visible 3D target, minimap marker, progress/completion feedback and one-time cash payout.
- The activity can be completed and another offered without reloading the game.
- Existing driving, traffic, vehicle switching, ramps, upgrades and crash/airtime rewards still work.
- The other two approved activity types can be added later without rewriting the activity framework.
Notes:
- Follow the approved decisions in `DESIGN.md`.
- Before coding, review the code paths and post a feasibility note in `agent_comments.md` naming the proposed first activity and exact files. Prefer the smallest vertical slice; the owner has approved all three types, but has not mandated which one must be implemented first.
- Keep v1 data-driven and use fixed locations/existing systems. No timers, fail states, cargo physics, procedural mission generation or full GPS routing.
- Props currently have no stable IDs and broken props are spliced out of the array; use stable identity or a destruction event if choosing smash targets.
- Ramp launches do not currently identify a specific ramp; add a stable ramp identity if choosing stunt jump.
- Centralize activity payouts through a small economy helper if practical; do not refactor the entire existing crash reward economy.

### T-004 Fix upgrade ramp side wall geometry
Assigned to: Claude (engineering).
Status: implemented (v0.12.1). Waiting for an owner visual check in a real browser.
Files: `src/world_city.js`.
Why: The upgrade ramp's right side wall used a wrong vertex, leaving a fin above the up-slope and a gap along the down-slope.
Done when: both side walls of every ramp match their decks (checked by `tools/smoke_test.js`), and the owner confirms the ramp looks right.

### T-005 Fix shadows clipping through ramps
Assigned to: Claude (engineering).
Status: implemented (v0.12.1). Waiting for an owner visual check in a real browser.
Files: `src/shadows.js`, `src/world_config.js` (new `upgradePad` constants), `src/world_city.js` (uses them), `tools/smoke_test.js`.
Why: Shadows were flat triangles stretched across ramp slope changes and sat too close to the deck, so they cut through ramps and were buried under the tuning pad.
Done when: shadows stay above ramp decks and the tuning pad (checked by `tools/smoke_test.js`), flat-ground shadows are unchanged, and the owner confirms they look right on ramps.
Notes: Known limit: a shadow straddling a ramp's vertical side wall can still look slightly off in a thin band. Not worth fixing.

### T-003 Confirm the child's primary input device
Assigned to: project owner.
Why: Keyboard, touch or controller changes activity controls and HUD decisions.
Done when: the primary input device is written into `DESIGN.md` under Audience.

### T-006 Traffic routing improvements (first pass)
Assigned to: ChatGPT (delegated by the project owner on 2026-11-24).
Status: merged as v0.13.0; the owner's follow-up playtest found the closed-loop behavior still too restrictive. T-007 addresses that limitation.
Files: `src/vehicles.js`, `src/vehicle_update.js`, `tools/smoke_test.js`, `ARCHITECTURE.md`, `DESIGN.md`, `index.html`.
Why: Improve how busy and varied traffic feels without raising rendering and physics cost.
Done when: The same 12 persistent traffic cars are redistributed across four fixed 2×2-block district circuits on existing inner street centerlines; each circuit has traffic moving in both directions, with cars spread across both lanes. No traffic cars are added or despawned. The route samples stay within the existing road/intersection footprint, and collisions still knock cars off-line with the existing soft recovery. The smoke test checks the 12-car fleet, four circuits, direction/lane distribution, inner-grid coverage and a sustained finite AI update. In a minute of free driving, a player should see traffic using inner streets instead of only the outer perimeter.
Notes:
- Baseline before T-006: all 12 traffic cars followed one rounded-square loop around the outer edge of the city (`loopPoint()` and the `route === "loop"` branch of `updateVehicle()`). The inner streets were empty.
- Design preference from the project owner's recommended order: smarter routing and better distribution before simply adding more cars.
- Traffic cars are never spawned or despawned. Collisions push them off their lane and a soft spring guides them back. Keep that behavior.
- Run `node tools/smoke_test.js` and keep crash cash, delivery activities and the rest of free roam working.
- Implementation notes (2026-11-24): four 2×2-block circuits are aligned to inner street lines; three of the existing 12 cars are assigned to each route. The new route/lane checks are in `tools/smoke_test.js`. The full smoke test has not yet been run in the implementation environment; syntax and standalone route/AI simulations passed.
- Owner playtest finding (2026-11-24): despite the four predefined district loops, the owner watched the minimap for several minutes and observed that the cars started and stayed on the outer portion of their assigned loops, never using the connecting grid as intended. T-007 addresses that gap rather than increasing the fleet.

### T-007 Intersection-based traffic AI and distributed starts
Assigned to: ChatGPT (requested by the project owner on 2026-11-24).
Status: merged to `main` as v0.14.0 (PR #6). Owner browser playtest passed the key intersection-collision recovery check on 2026-11-24.
Files: `src/vehicles.js`, `src/vehicle_update.js`, `tools/smoke_test.js`, `ARCHITECTURE.md`, `DESIGN.md`, `TASKS.md`, `index.html`, `README.txt`.
Why: Make the existing traffic fleet behave like city traffic that can turn at intersections and travel between districts, instead of remaining locked to closed rectangular loops.
Done when:
- Keep the existing 12 persistent traffic cars; do not add or despawn vehicles.
- Replace closed-circuit-only movement with simple intersection decisions: at each grid intersection a car can continue, turn left, or turn right when the road grid allows it. It must be able to leave the area/circuit where it started and use connecting streets across the city.
- Turns follow a smooth, lane-aware path through the existing intersection surface; no snapping/teleporting, no driving across sidewalks, buildings or off-road ground.
- Give cars semi-randomized but repeatable starting positions across distinct road segments in the full city grid. Use seeded randomness so tests and play sessions are reproducible.
- Preserve collision knockback and soft recovery; cars continue making route decisions while recovering.
- Smoke tests verify start distribution, valid intersection choices, actual turns, travel across multiple districts/grid regions, 12-car persistence, and finite road-constrained AI updates.
Notes:
- This is a direct response to the owner's v0.13.0 playtest: they watched for several minutes using the minimap indicators, confirmed v0.13.0, and saw that traffic cars started and stayed on the outer loop without coming inside the grid.
- The owner proposed (1) "some rudimentary AI that can choose to make a turn jumping onto another predefined circuit" and (2) "Semi-randomized starting locations on the circuit." Implement both, with intersection decisions taking priority over decorative variation.
- The owner also asked to confirm whether cars could ever leave the outer grid in the current code. The v0.13.0 route code had no transition: each car retained one `routeIndex` and advanced `routeS` modulo that route's length. T-007 must make cross-grid travel possible and prove it in the smoke test.
- Keep this deliberately simple: no pathfinding engine, road graph editor, new vehicles, traffic lights, or rendering system.
- Implementation (2026-11-24): PR #6 replaces T-006 closed circuits with an 8×8 grid controller. Standalone simulation confirms repeated turns and cross-quadrant travel.
- Owner browser playtest (2026-11-24): deliberately hit a traffic car as it approached an intersection. It continued through the intersection and corrected its path afterward. Record this as a pass for collision recovery during intersection navigation.

## Later: proposed order, not yet authorized as coding tasks

- Add the other two approved activity types after T-002 proves the activity framework.
- Reassess traffic density after T-007 playtesting; increase the vehicle count only if the city still feels empty.
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
