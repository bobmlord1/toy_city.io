# TASKS

Keep this file concise. Each coding agent works on one task at a time. Move finished items to Done with a date.

## How to write a task

```
### T-000 Short title
Assigned to: Claude | ChatGPT | project owner
Files: files this task may touch (new files marked "new")
Why: one sentence.
Done when: observable result a person can check.
Notes: constraints, links to DESIGN.md decisions.
```

## Outstanding tasks

### T-003 Confirm the child's primary input device
Assigned to: project owner.
Status: no longer blocks interface design; T-012 supports keyboard and touch with automatic desktop/mobile detection and a manual override. Confirm the most-used device after further playtesting if it becomes useful.
Why: Knowing the primary device can guide later usability tuning, but both input modes are supported.
Done when: record the most-used device in `DESIGN.md` if/when confirmed.

### T-015 Toybox Events: Dr. BadDude's Bad Ideas (future milestone)
Assigned to: project owner / design; engineering assignment after normal activity types are implemented and event designs are finalized.
Status: design concept approved for future planning; discussion only. Do not begin implementation yet.
Files: to be determined when the milestone is authorized.
Why: Add occasional, optional, surprising city-wide events that make the world feel like a toybox, using familiar driving controls and existing gameplay systems wherever possible.
Done when:
- Establish a lightweight event framework for occasional, self-contained, optional events that do not forcibly interrupt free roam or cancel an activity already in progress.
- All events share a recognizable connection to Dr. BadDude, an overconfident inventor whose experiments and excuses create the situations the player gets to resolve.
- Keep event instructions and announcements short and child-readable; each event should be immediately understandable and have a satisfying visual/reward payoff.
- Finalize event timing, activation/acceptance, map markers, duration, rewards, cleanup and compatibility with normal activities before implementation.
- Implement the approved event set below only after the normal activity types are complete and the owner authorizes the milestone.

**Approved event concepts and current one-liners**

1. **City Under Attack:** A blocky giant toy creature spawns in the city. Smash it before the event timer expires. Support a few difficulty tiers with different creature models/health/rewards. The creature is stationary and unanimated; it uses prop-like health and the existing destruction/particle system. Give it exaggeratedly light physical response so even low-speed bumps visibly move it. No enemy AI or combat system.
   - Dr. BadDude: “Technically, the containment system worked. The City is the containment system!”
2. **Tuning Ray:** Dr. BadDude's ray temporarily changes the player's vehicle handling rather than its physical size. Candidate effects include Soap Tires (very slippery), Super Springs (exaggerated bouncing), Turbo Overload (extreme acceleration / temporary speed boost) and Tank Treads (heavy steering with strong traction). Final effect list and duration remain to be tuned.
   - Dr. BadDude: “Your car is 37% better. I just need to measure what!”
3. **Reward Ring:** A golden ring appears at a random eligible location. Drive through it to receive a random stat upgrade; decide later whether upgrades are temporary or permanent and balance accordingly.
   - Dr. BadDude: “It's perfectly safe. The test dummy only exploded once!”
4. **Rival:** A marked rival vehicle appears. Wreck into it before the time limit expires. Reuse existing vehicle collision behavior where possible.
   - Dr. BadDude: “I've maxed out my crash insurance! Let's see what it pays out!”
5. **Treasure:** A special smashable object appears somewhere in the city with extremely low, one-hit health. Destroy it for a very large payout. Keep its reward separate from ordinary prop rewards and balance it as a rare event.
   - Dr. BadDude: “Someone asked about my research fund: What research fund?!”

**Shared character direction**
- Dr. BadDude is the common source or catalyst for every Toybox Event, but his role varies: sometimes he hires the player, sometimes asks for help, sometimes tries to prove a theory, and sometimes simply loses control of an experiment.
- Personality: overconfident, evasive through technicalities, oblivious to the consequences, and generous with other people's willingness to take risks. He delivers excuses sincerely, as if they are perfectly reasonable.
- Keep the humor accessible to children on the surface, with optional extra absurdity for adults. Do not rely on obscure references or long explanations.
- Use the five one-liners above as the current approved working dialogue. Preserve their wording unless the owner revises it.

Notes:
- This is a future milestone goal, not authorization to implement. The owner explicitly wants normal event/activity types implemented first and all Toybox Events kept in discussion until then.
- Toybox Events are a separate occasional spectacle layer alongside free roam and repeatable normal activities; they should remain optional and should not punish players for ignoring them.
- Reuse current systems and keep scope modest. Avoid introducing complex AI, elaborate cutscenes, voice acting or a new combat system.

### T-017 Activity board: drive-over start markers, no auto-assign
Assigned to: Claude. Owner approved 2026-11-25.
Files: `src/activities.js`, `src/props.js` (return the placed prop), `src/vehicle_update.js` (record the launch ramp id), `src/hud.js` (map marker color and edge pins only), `index.html` (skip button label and version), `tools/smoke_test.js`, `README.txt`, `ARCHITECTURE.md`, `TASKS.md`.
Why: the owner wants every activity to sit on the map as a marked start pad that the player drives onto, instead of the game assigning the next one.
Done when: with no activity running, every activity's start pad shows in the world and on the minimap; driving onto one starts it; SKIP stops it with no penalty; nothing starts on its own; still only one activity at a time.
Status: code complete in v0.17.0, waiting on owner playtest.

### T-018 Smash targets and stunt jump activity types
Assigned to: Claude. Owner approved 2026-11-25.
Files: same as T-017.
Why: the remaining two approved activity types from T-001.
Done when: smash targets spawns a few marked barrels and crates near its pad and pays once when all are broken; stunt jump asks for a jump off one marked ramp with modest airtime and pays once on landing; neither has a timer or a fail state.
Status: code complete in v0.17.0, waiting on owner playtest.

### T-019 More delivery locations across the city
Assigned to: Claude. Owner approved 2026-11-25.
Files: `src/activities.js`, `tools/smoke_test.js`.
Why: the five deliveries all sit in the middle of the city.
Done when: deliveries start and end in every part of the city, payouts stay in the $75 to $150 range and grow with distance, and the smoke test rejects pads that overlap buildings, rocks, ramps or each other.
Status: code complete in v0.17.0, waiting on owner playtest.

## Unnumbered backlog

- Renderer: `draw()` rebinds buffers and attribute pointers on every call (about 177 calls a frame), and the matrix helpers allocate a new array per call. Skip rebinding when consecutive draws share a mesh, or use vertex array objects. Needs a real browser to check, so only worth doing if a phone shows frame-rate problems.
- Optional traffic experiment: raising the AI steering cap from 1.55 to 2.6 rad/s halved moderate lawn excursions in simulation (39 to 21 in 10 minutes) but left severe ones unchanged. It makes turns tighter, which is a visual call for the owner.
- Intersection yielding: remaining traffic incidents are crossing and oncoming contacts at intersections. Fixing them needs right-of-way rules, which is a design decision before it is a coding task.
- Traffic can drive through buildings after a knock (found while fixing the smoke test, 2026-11-25): a traffic car spun around by a second collision drove through the yard warehouse and then the Yellow House. `resolveVehicleBuilding()` runs for traffic, but the route spring appears to pull the car through once it is deep enough. Needs a look in `vehicle_update.js` and `collisions.js` before it is a task.
- Activity tuning after playtest: smash payout ($100 for four targets plus $18 per prop), the stunt airtime goal (0.49 s) and whether 24 pads feel like too many or too few.
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

- **T-016 Smoke test harness repair:** the prop regression checks returned objects instead of JSON, so the test crashed before checking anything. Fixed 2026-11-25; the smoke test runs again.
- **T-002 — Optional activity system v1:** Added the optional delivery activity loop with visible guidance, completion feedback and cash payout; owner playtested the loop repeatedly and confirmed it is fun.
- **T-004 — Upgrade ramp side-wall fix:** Corrected the ramp geometry so the right wall follows the slope without a fin or gap; owner confirmed in-browser.
- **T-005 — Ramp and tuning-pad shadow fix:** Aligned shadows to ramp surfaces and cleared the tuning pad; owner confirmed in-browser. A narrow visual artifact can remain where a shadow crosses a ramp's vertical side wall.
- **T-006 — First traffic-routing pass:** Added four fixed district circuits and lane distribution; superseded by T-007's intersection-based routing.
- **T-007 — Intersection-based traffic AI:** Replaced closed loops with seeded grid navigation, turns and distributed starts; owner confirmed collision recovery at intersections.
- **T-008 — Pickup-truck traffic fleet:** Added 12 AI pickups alongside 12 compact cars for 24 persistent traffic vehicles; smoke test passed and owner reported no major slowdown on phone/laptop.
- **T-009 — Traffic following:** Improved traffic behavior behind slower vehicles; owner playtested and reported no blocking behavior.
- **T-010 — Dead-code cleanup and performance:** Removed unused code; behavior fingerprint and smoke tests passed, with lower headless physics CPU cost.
- **T-011 — Traffic speed variation and weighted rerouting:** Added varied traffic speeds and route choices; owner playtested the traffic behavior.
- **T-012 — HUD, minimap and mobile controls:** Established the molded dashboard, fixed world-oriented minimap, desktop/mobile profiles and touch controls.
- **T-013 — Compact dashboard and objective strip:** First compact stacked layout; superseded by T-014's side-by-side map/objective arrangement.
- **T-014 — Side-by-side minimap and objective panel:** Enlarged the minimap and placed objective details beside it; merged as v0.16.4 in PR #8 and approved by the owner.
- **2026-11-23 — Source refactor:** Split the monolithic `game.js` into 18 files under `src/`, added smoke-test tooling and project documentation; gameplay behavior was preserved in headless comparison.
