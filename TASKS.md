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

### T-003 Confirm the child's primary input device
Assigned to: project owner.
Status: no longer blocks interface design; T-012 supports keyboard and touch with automatic desktop/mobile detection and a manual override. Confirm the most-used device after further playtesting if it becomes useful.
Why: Knowing the primary device can guide later usability tuning, but both input modes are supported.
Done when: record the most-used device in `DESIGN.md` if/when confirmed.

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

### T-008 Add a dedicated pickup-truck traffic fleet
Assigned to: ChatGPT.
Status: merged to main as v0.15.0 (PR #7). Owner reports no major perceived slowdown on phone/laptop, but has no objective FPS measurement. Full smoke test passed on `main` (Claude, 2026-11-24). Truck appearance and congestion in a real browser remain owner checks. Headless traffic measurements are in the Claude REVIEW entry in `agent_comments.md`.
Files: `src/vehicles.js`, `tools/smoke_test.js`, `index.html`, `DESIGN.md`, `ARCHITECTURE.md`, `TASKS.md`, `README.txt`, `agent_comments.md`.
Why: The owner reports that the city still feels empty and lacks vehicle variety after T-007; more traffic types should make free-roam feel busier without changing the route system.
Done when:
- Keep the existing 12 compact-car traffic vehicles and add 12 AI pickup trucks using the existing pickup asset, for 24 persistent AI traffic vehicles total.
- All 24 use the same seeded intersection-grid navigation, legal turns, and collision knockback/recovery behavior.
- Pickup traffic uses several distinct paint variants and slightly lower cruising speeds than compact traffic.
- Give all 24 unique seeded starting road segments across the city grid; verify road-path clearance for the larger pickup footprint, not just its centerline.
- Update smoke tests and v0.15.0 documentation/start-screen version. Keep the player pickup and player semi unchanged.
Notes:
- The owner also asked for six semis. Defer moving AI semis in this task: the trailer articulation simulation already runs for AI vehicles, but the existing compact-car turn path does not account for a tractor-trailer swept footprint. Do not add six semis as untested moving traffic; a later task should add trailer-aware path planning, turn clearance and speed control.
- No new assets, spawning/despawning, pathfinding engine, road geometry or dependencies.
 
### T-012 HUD, minimap and mobile interaction redesign (design phase)
Assigned to: ChatGPT (design specification; implementation requires separate approval).
Status: owner-approved visual language and layout direction; detailed specification recorded in `DESIGN.md`. Desktop/mobile mockups are the next design deliverable. No UI code authorized yet.
Files: `DESIGN.md`, `TASKS.md`, `agent_comments.md`; mockups may be added as design references.
Why: The owner identifies screen clutter, a noisy and hard-to-orient minimap, inconsistent UI elements and excessive wording as the largest current usability problems.
Done when:
- Define one cohesive toy-like visual language: approved palette, typography, shapes, spacing, surfaces, borders, icon treatment and semantic status colors.
- Specify a compact, persistent top-center dashboard with the minimap integrated into its center and essential vehicle/speed/cash readouts around it.
- Specify separate desktop and mobile HUD layouts, automatic profile detection, and a persistent manual Auto / Desktop / Mobile override.
- Specify a tilted, player-relative minimap that rotates with the player's heading, stays visible in every view and focuses on the player plus relevant objectives rather than all world objects or traffic.
- Specify mobile invisible swipe-stick driving, with brake, boost and contextual enter/exit icon buttons at the bottom right.
- Include child-focused language rules: icons first, short labels, no paragraphs of instructions during play.
- Keep desktop keyboard and mobile touch both supported. No code changes in this design phase.
Notes:
- **Approved visual direction:** Molded dashboard, but intentionally more toy-like and less realistic than a real instrument cluster. Use chunky rounded shapes, raised molded-plastic edges and friendly simple icons.
- **Approved palette:** deep petrol `#152A34`, raised teal `#203D48`, warm ivory `#F4F1E8`, blue-grey `#AFC2C8`, aqua `#72D2DC`, warm yellow `#F4CF59`, soft coral `#F28F73`, soft green `#8BC99B`. Use accents semantically.
- **Approved placement:** one compact dashboard centered at the top/overhead edge of the play area so the bottom remains clear for thumbs. The minimap is integrated into the dashboard center and persists across driving, on-foot and other views.
- **Approved minimap:** tilted/oblique toy-diorama view, player-relative rotation with the direction of travel always toward the top; show the player and relevant objective markers, with only faint road context if needed. Do not show all traffic, buildings, rocks and ordinary props. No north-up compass requirement.
- **Approved desktop/mobile approach:** distinct layouts. Auto-detect using pointer capability and viewport dimensions rather than user-agent sniffing; offer a persistent Auto / Desktop / Mobile override for hybrid devices or detection errors.
- **Approved mobile controls:** invisible floating swipe-stick on the left/lower-left area (touch origin plus finger displacement for steering and forward/reverse); brake, boost and contextual enter/exit icon buttons in a bottom-right cluster. Support simultaneous touches. A brief first-use cue may teach the invisible stick, but no permanent joystick graphic or instruction panel.
- The prior north-up map, N marker, traffic-rich minimap and visible left thumbstick/right accelerator proposal are superseded.
- T-003's exact primary device remains unconfirmed, but supporting both profiles with automatic detection and manual override means it no longer blocks T-012.
 
## Later: proposed order, not yet authorized as coding tasks

- Renderer: `draw()` rebinds buffers and attribute pointers on every call (about 177 calls a frame), and the matrix helpers allocate a new array per call. Skip rebinding when consecutive draws share a mesh, or use vertex array objects. Needs a real browser to check, so only worth doing if a phone shows frame-rate problems.
- Optional traffic experiment: raising the AI steering cap from 1.55 to 2.6 rad/s halved moderate lawn excursions in simulation (39 to 21 in 10 minutes) but left severe ones unchanged. It makes turns tighter, which is a visual call for the owner.
- Intersection yielding: remaining traffic incidents are crossing and oncoming contacts at intersections. Fixing them needs right-of-way rules, which is a design decision before it is a coding task.

- Add the other two approved activity types after T-002 proves the activity framework.
- After the owner playtests T-008, reassess whether 24 mixed traffic vehicles feel busy enough and whether desktop/mobile performance remains comfortable; do not add more traffic until that check.
- Add more smashable physics props in selected districts, using deterministic placement and keeping streets/ramps clear.
- Distribute upgrade access around the city only if playtesting shows the single tuning pad is inconvenient.
- Reapply the accepted toy-playset visual direction after the refactor, using the existing WebGL renderer and procedural geometry/material system. See the prior visual-development brief in the project conversation; do not introduce Blender or a new rendering engine.
- Consider cosmetic rewards (vehicle colors, stickers, city decorations) after the cash/activity loop is balanced.
- Treat the flying/hover car as a late-game capstone, not part of the first objective milestone.
- Sound: engine hum, crash pops, goal jingle. Keep volume low by default.
- Optional driving assist and an easy un-stick action.
- Replace stale README launch instructions (mentions scripts that are not in the repo).
- Remove or clearly archive the unused root `game.js` after confirming it is no longer a supported entry point; avoid two apparent sources of truth.
- Optional: convert `src/` to ES modules only if the shared global scope becomes a real problem.

## Done

- 2026-11-25 T-004 Fixed the upgrade ramp's right side wall (one wrong vertex left a fin above the up-slope and a gap on the down-slope). Owner confirmed in a real browser that the ramp looks right.
- 2026-11-25 T-005 Fixed shadows clipping through ramps and the tuning pad (shadows now follow the ramp surface and clear the pad). Owner confirmed in a real browser that shadows look right on the ramps. Known limit: a shadow straddling a ramp's vertical side wall can still look slightly off in a thin band.
- 2026-11-23 Refactor: split the single 2,971-line `game.js` into 18 files in `src/`, formatted the code, added `tools/smoke_test.js`, and added the project docs. Gameplay is unchanged. Claude reports identical old/new 400-frame headless simulations; browser/touch playtesting remains outstanding.

- 2026-11-25 T-009 Traffic following behavior — owner playtested v0.15.2 and tailed several cars; no blocking behavior reported. Claude's smoke test passed.
- 2026-11-25 T-010 Dead-code cleanup and performance once-over — behavior-preserving fingerprint test and smoke test passed; headless physics CPU cost reduced from 0.46 to 0.15 ms/frame.
- 2026-11-25 T-011 Traffic speed variation and weighted rerouting — owner playtested v0.15.2 and tailed several cars; Claude's smoke test passed.
