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


### T-025 Gameplay regression and integration sweep
Assigned to: Claude; project owner playtests.
Files: relevant gameplay files, `tools/smoke_test.js`, `TASKS.md` (only as needed to document findings/fixes).
Why: With all activity types and Toybox Events arriving, ensure the core systems coexist without reward exploits, stuck states, crashes or conflicting objectives.
Done when: smoke tests cover critical activity/event transitions and regressions; owner can test free roam, all activities, events, vehicle collisions, reset/recovery and rewards without encountering a critical issue; remaining known issues are documented rather than hidden.
Notes: Fix only scoped, reproducible defects; avoid broad architecture changes.

### T-026 Backyard equirectangular skybox
Assigned to: Claude; project owner supplies and playtests the texture.
Files: rendering/environment files as required, startup/settings UI only if needed, asset(s) (new), `tools/smoke_test.js` where applicable, `TASKS.md`.
Why: Establish the toy-world setting with a backyard panorama featuring grass, sandbox, distant fence and house, without expanding the playable terrain.
Done when: a skybox test/integration renders a panoramic backyard around the existing world; horizontal wrap seam and horizon placement are acceptable in play; camera orientation behaves correctly; no new collision/world geometry is required; performance remains acceptable on target devices.
Notes: Prefer a self-contained test or reversible integration. Avoid redesigning the renderer or introducing an asset pipeline.

### T-027 Gameplay feedback and reward clarity
Assigned to: Claude; project owner playtests.
Files: gameplay feedback/HUD files as required, `tools/smoke_test.js`, `TASKS.md`.
Why: Make the existing activities, smashing, deliveries, jumps, upgrades, cash and event outcomes immediately understandable and satisfying.
Done when: critical gameplay actions provide consistent, legible feedback (visual/audio only where existing systems support it), rewards are clearly communicated, and feedback does not obscure driving or stack confusingly across activities/events.
Notes: Polish existing feedback; do not add new progression or gameplay systems.

### T-028 Traffic behavior polish
Assigned to: Claude; project owner playtests.
Files: `src/vehicle_update.js`, `src/collisions.js`, related traffic files and tests as required, `TASKS.md`.
Why: Address visible traffic routing, spacing, intersection incidents, post-collision recovery and traffic interaction with buildings.
Done when: traffic recovers reliably from bumps and route deviations, does not routinely drive through buildings or remain wedged, and intersections/spacing feel credible in owner playtesting; regression checks cover fixes.
Notes: Avoid adding traffic vehicles or complex right-of-way simulation without a demonstrated need. Resolve the known post-knock building traversal if reproducible.

### T-029 Toy-playset material and lighting consistency
Assigned to: Claude; project owner reviews visually.
Files: rendering/material files and affected assets as required, `TASKS.md`.
Why: Reinforce the molded-plastic toy aesthetic across the existing cars, roads, buildings, props, ramps and upgrade pads.
Done when: a focused visual audit identifies and improves inconsistent materials/lighting using the existing renderer and procedural asset approach; the world reads as a cohesive toy playset; performance and legibility remain acceptable.
Notes: No new rendering engine, external asset pipeline, or broad visual rebuild. Make a few targeted improvements and review them in-game.

### T-030 Free-roam discovery and world layout review
Assigned to: project owner / ChatGPT design; Claude only for approved placement changes.
Files: world/prop/activity placement files and `TASKS.md` if implementation is authorized.
Why: Ensure free driving is rewarding through discoverable ramps, pads, props and activity locations without constant objective prompts.
Done when: owner reviews a representative drive through all districts and identifies concrete placement/readability issues; only approved, specific adjustments are implemented and playtested.
Notes: Design/review task first; do not expand the map or add new systems by default.

### T-031 Existing vehicle handling differentiation pass
Assigned to: Claude; project owner playtests.
Files: vehicle handling/configuration files and tests as required, `TASKS.md`.
Why: Make current vehicles feel distinct through their existing handling, weight, acceleration, traction, braking and impact behavior.
Done when: owner can identify meaningful handling differences between current vehicles in play; tuning is regression-tested and remains fun/controllable on keyboard and touch.
Notes: Tune existing vehicles only; no new vehicle fleet in this task.

### T-032 Dr. BadDude event presentation
Assigned to: ChatGPT (design/assets); Claude (integration), with owner approval.
Files: portrait asset(s) (new), event/HUD files as required, `TASKS.md`.
Why: Give Toybox Events a recognizable character presentation using the approved Dr. BadDude design.
Done when: the portrait is presented consistently in appropriate event announcements or results, with legible dialogue and layout on desktop and mobile; no cutscene or character animation system is introduced.
Notes: Static portrait is the baseline; animated portrait/GIF is optional and must not block the task.

### T-033 Camera comfort and recovery polish
Assigned to: Claude; project owner playtests.
Files: camera and vehicle/recovery files as required, `tools/smoke_test.js` if applicable, `TASKS.md`.
Why: Improve camera comfort and robustness during driving, collisions, jumps, vehicle switching and recovery.
Done when: camera smoothing and positioning are comfortable, avoid persistent clipping or disorienting transitions, and recovery returns the player to a usable state; owner playtests representative situations.
Notes: Keep the current camera design; avoid a camera-system rewrite.

### T-034 Lightweight sound-effects pass
Assigned to: project owner / ChatGPT (asset/design); Claude (integration).
Files: sound assets (new), audio/gameplay/UI files as required, `TASKS.md`.
Why: Add restrained audio feedback to reinforce driving, collisions, prop destruction, rewards, activities, upgrades and Toybox Events.
Done when: a small cohesive set of sounds is integrated at appropriate moments, volume is conservative, audio can be muted/adjusted, and audio does not interfere with play or performance.
Notes: Prefer free/licensable or original assets with clear provenance. Do not make sound production a blocker for other polish.

### T-035 HUD motion and transition polish
Assigned to: Claude; project owner reviews.
Files: HUD/UI files as required, `TASKS.md`.
Why: Add restrained motion to existing notifications, activity/event transitions, rewards and minimap indicators to improve clarity and presentation.
Done when: existing UI feedback has consistent, brief transitions where useful; animation remains readable, does not distract from driving, and behaves correctly at mobile and desktop layouts.
Notes: Only animate existing UI; no HUD redesign or motion-heavy effects.

### T-036 Optional backyard perimeter billboard accents
Assigned to: Claude; project owner approves placement and visuals.
Files: environment/skybox files and asset(s) (new) as required, `TASKS.md`.
Why: If the skybox alone feels flat, add a small set of inexpensive billboard details such as oversized grass, flowers or garden objects to reinforce backyard scale.
Done when: owner confirms the backdrop needs more depth; a restrained set of billboards improves the visual composition without distracting from driving, intersecting the playable area or harming performance.
Notes: Optional follow-on to T-026; do not implement unless playtesting demonstrates a need.

### T-037 Input, accessibility and device usability audit
Assigned to: project owner playtests; Claude for approved fixes.
Files: input/HUD files as required, `tools/smoke_test.js`, `TASKS.md`.
Why: Review control clarity, mobile touch conflicts, UI scale/readability, audio controls and recovery usability across supported devices.
Done when: owner checks keyboard and touch play; critical usability problems are documented and fixed with targeted changes; controls and essential information remain usable at tested screen sizes.
Notes: Audit first and fix demonstrated issues; no new input modes by default.

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
