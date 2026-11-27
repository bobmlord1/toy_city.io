# ARCHITECTURE

Owner of this file: whichever agent changes the structure. Update it in the same change as the code. Keep it short and true. If code and this file disagree, fix this file.

## Stack

- Plain JavaScript, raw WebGL 1. No framework, no engine, no build step, no npm dependencies for the game itself.
- Static files only. Serve the folder with any web server and open `index.html`.
- Do not open `index.html` via `file://`. The game fetches binary models from `assets/`, which browsers block on file URLs. Quick local server: `python3 -m http.server` then visit `http://localhost:8000`.

## Folder layout

```
index.html          UI markup, CSS, and the boot script (loads assets, then src/ files in order)
assets/             vehicle_meshes.json + .bin (CC0 models from Grab3D, see ASSET_CREDITS.txt)
src/                all game code, one concern per file
tools/smoke_test.js headless check, run before every handoff
DESIGN.md           what we are making and why
ARCHITECTURE.md     this file
TASKS.md            what to do next
agent_comments.md   messages between agents
AGENTS.md           short rules for any agent working here
```

## How code is organized

The files in `src/` are **plain scripts that share one global scope**, not ES modules. A top-level `const`, `let` or `function` in one file is visible to every file loaded after it, and functions in earlier files can call functions in later files at runtime.

**Load order matters** for code that runs immediately at load. The order is the `SCRIPTS` list in `index.html`:

| File | Responsibility |
| --- | --- |
| `core.js` | Canvas, WebGL context, start button, fatal error screen, math helpers. Loads first. |
| `renderer.js` | `MeshBuilder`, shaders, lighting modes, matrices, `draw()`. |
| `world_config.js` | World size, street dimensions, ramp definitions, ground height (`driveSurfaceH`). |
| `world_streets.js` | Data-driven street kit and its colliders. |
| `world_city.js` | Yard, ramp meshes, buildings, trees, lamps. Ends by building `worldMesh`. |
| `shadows.js` | Projected shadows. |
| `vehicles.js` | Vehicle assets, `vehicle()` factory, player vehicles, semi and trailer, persistent mixed traffic fleet. |
| `props.js` | Smashable props. |
| `state.js` | Shared mutable state (`controlled`, `onFoot`, `player`, `keys`, `touch`). |
| `economy.js` | Cash, crash rewards, tuning pad, upgrades, and `awardCash()` for non-crash rewards. |
| `activities.js` | Optional activities: start pads, objective markers, minimap markers, payouts. Ships `delivery`, `smash` and `stunt`. |
| `events.js` | Toybox Events: pool timer, comms slide-out, event map symbols, City Under Attack, Tuning Ray, Reward Ring. |
| `interaction.js` | `say()`, enter/exit vehicle, small vehicle helpers. |
| `input.js` | Keyboard and touch, steering convention, boost. |
| `collisions.js` | Collision resolution, trailer physics, suspension, airtime. |
| `vehicle_update.js` | `updateVehicle()`, the per-vehicle driving and traffic AI step. |
| `physics.js` | On-foot movement, prop and debris updates, `updatePhysics()`. |
| `camera_render.js` | Chase camera, `drawWorld()`. |
| `hud.js` | Molded dashboard readouts and player-relative objective minimap. |
| `main.js` | Frame loop and startup. Loads last. |

Every frame runs: `updatePhysics(dt)`, then `drawWorld(dt)`, then `updateUI()`, then `drawMap()`. The T-012 minimap projects the player and active objective into a fixed world-oriented view, with the vehicle marker rotated to match vehicle yaw; only the quiet street grid is retained as context.

## Adding a file

1. Create `src/yourfile.js` starting with `"use strict";` and a short header comment.
2. Add its name to the `SCRIPTS` list in `index.html` at the right position.
3. Add a row to the table above.
4. Avoid names that clash with browser globals (`name`, `top`, `status`, `self`, `length`, `event`, `screen`, `history`, `location`, `open`, `close`, `stop`, `print`, `focus`). Top-level `let` or `const` with those names can break the page.

## Rules that must not be broken

- **Steering signs are intentional.** The camera looks along +Z, so positive yaw is LEFT on screen. A and Left Arrow are +1, D and Right Arrow are -1. Read the comment in `input.js` before touching it.
- **Touch steering is proportional (T-041).** `steeringInput()` returns -1 to 1: keys and buttons give full on/off, and the swipe stick adds `swipeTouch.steer` from `swipeSteer(dx)`: nothing for the first `SWIPE_STEER_DEAD_ZONE` (22%, about 14 px) of `SWIPE_STEER_RANGE` (64 px), then a curve (`SWIPE_STEER_CURVE` 1.5) up to full lock at 64 px. Before this the stick was on/off and about 10 px of drift gave full lock. Headless: a thumb holding gas with a +/-20 px sideways wobble swung the car up to 119 degrees off straight before, about 1 degree now. Vehicle steering code is unchanged; it already scales with the input.
- **`driveSurfaceH(x, z)` is the single source of truth for ground height.** Do not add a second height query.
- **Streets and their colliders come from the same placement code** (`placeStreetUnit`). Never add road geometry that has no matching collider, or the reverse.
- **No `Math.random` in static world building** unless seeded. The world should look the same every load.
- **Shadows follow the surface.** `shadowSurfaceH()` in `shadows.js` is the height every shadow vertex uses. Anything new that sits above the ground on a ramp (like the gold pad, see `upgradePad` in `world_config.js`) must be added there, or shadows will vanish under it. Near ramps, shadow triangles are subdivided so they follow the slope.
- **Cheap checks first.** Any collision test that loops over many boxes (buildings, rocks, props, other vehicles) must run the `farApart()` broad phase in `collisions.js` before building an oriented box or running SAT. It only skips pairs that cannot overlap, so it never changes results.
- **Write the HUD only when it changes.** DOM writes cost real time on phones. Compare with the last written value first (see `updateUI()` in `hud.js`).
- **Keep the world flat for now.** Hills were removed on purpose until the street kit is stable.

## Traffic navigation

The 24 persistent AI traffic vehicles use the full street grid, not closed loops: 12 compact cars and 12 pickup trucks. `streetLines` supplies the eight north-south/east-west road centerlines. `trafficBuildLeg()` plans one road segment to the next intersection and chooses a legal straight, left or right exit (weighted 56% / 22% / 22%, renormalized at city edges). Both types follow the same sampled lane-center path; turns use a short cubic curve within the intersection. Pickup traffic reuses the existing pickup mesh in four paint variants, with a 5-by-2-unit collision footprint and slightly lower cruising speeds. The intersection curve and road width accommodate that footprint; the smoke test checks all four oriented body corners at every sampled point rather than testing only the route centerline.

Starting road edges are shuffled with a fixed layout seed, so all 24 vehicles begin on distinct, varied street segments across the full grid while remaining reproducible. Each vehicle has its own deterministic decision seed. The AI stores its current grid node, heading, leg progress and visited-region mask for validation. Traffic remains persistent, and `aiKnockTime` still reduces the lane-recovery spring after collisions knock vehicles off their lanes. The player semi and trailer continue using the separate articulation and collision simulation; moving AI semis are deferred until route planning accounts for the combined tractor-trailer swept footprint at turns.

### Following behavior

A traffic car slows to the speed of the nearest traffic car ahead of it in the same lane, heading roughly the same way, and keeps a gap of about 2.5 units plus 0.7 seconds of that car's speed (`trafficFollowLimit()` in `vehicles.js`, constants `TRAFFIC_*`). `updateVehicle()` turns that limit into a smoothed `trafficCruise` speed: it brakes at up to 9 units per second squared and recovers at 3.5. The route progresses at the cruise speed, so a slowed car stays on its path. With a clear road ahead there is no limit, so free-flowing traffic is unchanged. Only other traffic counts as a leader, so the player can still catch up with and crash into traffic. It does not handle right of way at intersections, so crossing and oncoming contacts can still happen.

### Turns (T-028)

Traffic steers at most `TRAFFIC_YAW_RATE` (1.55 rad/s). Turns toward the near lane have an average radius of about 4.3 units, which allows only about 6.7 m/s, while traffic cruises at 7 to 13.5 m/s, so cars used to swing wide into the oncoming lane after turning. `trafficTurnLimit(v)` in `vehicle_update.js` caps the cruise speed on a turning leg at 75% of (yaw rate x average curve radius) and brakes toward it gently (`TRAFFIC_TURN_BRAKE`) before the curve. Measured over four 10-minute `traffic_report.js` seeds: collisions about 30% fewer, opposite-direction contacts about half, lawn excursions about 60% fewer, and wrong-side samples just past intersections from about 780 to about 60 per 2 minutes. Remaining contacts are mostly left turns meeting oncoming cars inside intersections; there is still no right-of-way logic.

### Buildings (T-020)

Traffic normally never touches buildings, because buildings and rocks only stand outside the street corridors. A car knocked onto a lawn, though, steers back toward its lane in a wide arc. `trafficOffStreet(v)` in `vehicle_update.js` is true once the car has left the corridor far enough to touch something, and only then does the traffic branch run `resolveVehicleBuilding()` against `buildingColliders` (the same check the player gets). On-road traffic skips it, so normal traffic costs nothing extra. Measured headless: cars aimed at buildings from the lawn previously ended up to 8.7 units inside; now 0. A car that bounces off a wall can take a little longer to get back to its lane than one that passed through: over six 6-minute `traffic_report.js` seeds, three were identical and three had 1 to 6 more lawn excursions.

### Speed variation and routing while held back

Each traffic car's `maxSpeed` is its type's base speed (`trafficBaseSpeed`) plus a random offset of up to 5 mph either way (`TRAFFIC_SPEED_VARIATION_MPH` in `vehicles.js`), chosen once at startup with `Math.random`, so it differs on every page load. Routes stay seeded and repeatable, and the test tools seed `Math.random`, so their runs repeat. Pickups are still slower than compacts on average, but individual cars can overlap.

When a car is being held below its top speed by a slower car ahead, `trafficFollowLimit()` records that car in `v.trafficLeader`. `trafficChooseNextHeading()` then compares the leader's planned exit at the same intersection with the follower's options and halves the weight of that exit, halving again at each further intersection reached while still held back (`v.trafficFollowStreak`: 1/2, 1/4, 1/8). The weights stay 0.56 straight, 0.22 left, 0.22 right otherwise, and the streak resets as soon as the car is not held back at a decision.

## Activities

`src/activities.js` is the optional-activity framework. It is deliberately small.

- **Activity board, nothing auto-assigned.** Every entry in `activityDefs` has a start pad, but only three are live at a time (T-038): `activityBoard` holds one delivery, one smash and one stunt. `drawActivityBoard(excludeId)` takes the types in random order and picks each pad at random from those at least `ACTIVITY_BOARD_SPACING` (150) from the pads already picked, falling back to the farthest one. Measured over 1000 draws: always at least 140 apart, usually 150 or more, and every pad comes up. Finishing or skipping redraws the board without the activity just played. While no activity runs, the three live pads are drawn in the world (within `ACTIVITY_DRAW_DISTANCE` of the camera) and on the minimap, pinned to the map edge. Driving onto one starts it; walking onto it does nothing. Code that loops over live pads uses `activityBoardDefs()`; validation still checks every def.
- **Start on entry only.** `updateActivities()` keeps the set of pads the vehicle is on (`activityPadsInside`) and starts an activity only when the vehicle enters a pad. Finishing, spawning or skipping on top of a pad never starts it, and pads are also inactive for `ACTIVITY_RESTART_DELAY` seconds after a finish.
- **One at a time.** `currentActivity` is `{ def, phase, t, ... }` or `null`. While one runs, other pads are hidden and ignored. SKIP (or the `G` key) stops it with no penalty; the SKIP button is hidden when nothing is running.
- **Data plus type.** `activityDefs` holds hand-authored locations and payouts. `activityTypes[type]` holds behaviour: `start(def)` (pad position), `begin(act)`, `markers(act)`, `hud(act)`, `update(act)` (returns `"complete"` when the reward is due), `finish(act)` (celebration spot and text) and optional `cleanup(act)` on skip.
- **Types.**
  - `delivery`: pickup pad, then a drop-off. Payout is $75 plus 25 cents per world unit between them, capped at $150 (`deliveryPayout()`).
  - `smash`: on start, `addProp()` places the def's targets (barrels and crates) just past the pad, and the activity keeps references to those prop objects. Broken props are spliced out of `props` but keep `broken = true`, which is how progress is counted. A target broken by traffic still counts. Skipping removes unbroken targets. Prop smash cash ($18 each) is still paid as usual.
  - `stunt`: `updateVehicle()` records `v.lastRampId` at launch. The activity watches the controlled vehicle while it is airborne from the def's `rampId` and completes on landing if it stayed up at least `STUNT_MIN_AIR_SECONDS` (0.49 s). Measured headless: any launch gets about 0.47 s, and full throttle from the pad gives 0.5 to 0.7 s with every player vehicle at stock speed. A short jump says "go faster" and the activity keeps waiting.
- **Hooks into other files** (the only places other code touches it): `updateActivities(dt)` in `main.js`, `drawActivityMarkers(vp)` in `camera_render.js`, `activeMarkers()`, `ACTIVITY_MAP_COLORS` and `updateActivityHud()` in `hud.js`, the `G` key in `input.js`, `awardCash()` in `economy.js`, `addProp()`/`propSpotAllowed()` in `props.js` and `v.lastRampId` in `vehicle_update.js`. The HUD panel markup is in `index.html`.
- **Payout safety.** `completeActivity()` clears `currentActivity` before paying, so an activity can pay only once per run. There is no timer, no failure state and no cash deduction anywhere.

## Toybox Events

`src/events.js` holds the occasional Dr. BadDude events (T-015). It runs beside the activity board and never touches `currentActivity`.

- **Pool timer.** `updateEvents(dt)` (from `main.js`) draws one option from `EVENT_POOL` every `EVENT_ROLL_INTERVAL` seconds while no event runs (first draw after `EVENT_FIRST_ROLL`). The pool lists every event plus `null` for "no event". `drawFromEventPool()` (T-039) starts every option at weight 1, halves an option's weight each time it is drawn, and resets all weights once every option has been drawn. Options stay equal overall, but the longest run without one option drops from about 28 draws (plain random, per 4000 draws) to about 15. At most one event runs (`currentEvent`).
- **Test switch.** `?event=cityAttack|tuningRay|rewardRing` in the page address starts that event on the first frame of play (`applyEventTestSwitch()`), optionally with `&tier=small|medium|large` or `&effect=soapTires|superSprings|turboOverload|tankTreads`. Unknown values are ignored. It is for playtests; nothing in the game links to it.
- **Lifetime.** `startEvent(id)` places the event (`eventSpawners`) and slides out the comms panel (`#comms` in `index.html`) with the event name and Dr. BadDude's line for `EVENT_COMMS_SECONDS`. Each frame `eventUpdaters[id]` returns `"done"` on success. When `eventTypes[id].duration` runs out, `endEvent()` removes what was placed with no message, no cash change and no fail state.
- **Placement.** Built once at load from the world, deterministically: `eventLawnSites` (one open lawn spot per block, clear of buildings, rocks, ramps, props and activity pads) and `eventRoadSpots` (street centerlines away from intersections, ramps and pads). `pickEventSite()` prefers 60 to 200 units from the player, and for the ray and ring, ahead of the player.
- **Map and world.** `eventMarkers()` returns one pinned marker with a `shape` (burst, diamond, ring) that `hud.js` draws with `drawMapEventSymbol()`, so events never look like the round activity markers. `drawEvents(vp)` in `camera_render.js` draws gates, the ring, beacons and health pips.
- **City Under Attack.** A creature prop (`type: "monster"`) is pushed into `props`, so the normal prop collision, damage latching, debris and shadows all apply. Extra prop fields it uses: `model` (drawn instead of crate/barrel), `height` (airborne cars pass over only above it), `kickScale` (2.5, so gentle bumps shove it hard) and `smashCash: 0` (no ordinary $18; the event pays the tier payout). Tiers (T-045): small/medium/large, about 12/18/28 units tall, radius 3.7/5.6/8.6, health 22/36/55 (about 5/9/13 full-speed stock rams); payouts as set by T-044. Lawn sites need `EVENT_LAWN_CLEARANCE` (12) from buildings and more room from streets, leaving 46 sites.
- **Treasure (T-046).** A one-hit chest prop (`type: "treasure"`, `treasureChestMesh`, `hp` 0.5, `smashCash: 0`) on a lawn site. Breaking it pays `TREASURE_PAYOUT` ($500 since v0.22.1; $1,000 was too strong) through `awardCash()`, so the progression multiplier applies (up to $1,250 late in a session). Map symbol: square.
- **Rival (T-047).** Marks one on-road traffic car (`v.isRival`) in the usual distance band. While marked it cruises at most `RIVAL_MAX_CRUISE` (5.5 m/s, about 12 mph; the cap is applied in the traffic speed line of `vehicle_update.js`) so a stock car can catch it. `resolveVehiclePair()` calls `eventVehicleHit(a, b, impact)`; contacts between the rival and the controlled vehicle at `RIVAL_MIN_IMPACT` (2.2 m/s closing speed) or more count, with a 0.5 s cooldown. `RIVAL_HITS` (3) pays `RIVAL_PAYOUT` ($350). On timeout the car is simply unmarked. Map symbol: arrowhead.
- **Tuning pad assist (T-043).** `upgradePadAssist(v, dt, driving)` in `economy.js`, called from the player branch of `updateVehicle()` after the speed clamp. It does nothing while gas, reverse or boost is held, in the air, after the panel was closed, outside `inPadAssistArea()` (from the ramp crest to the far end, 6.3 to each side), or above `PAD_ASSIST_MAX_SPEED` (12 m/s). Otherwise it pulls toward `padCenter` (none within `PAD_ASSIST_REST_RADIUS`, so the car rests where it is on the pad), drifts slowly sideways toward the center line (cars barely slide sideways), and damps speed. Headless: driving in at full speed and letting go anywhere from z 20 to 34 stopped on the pad 8 of 8 times (3 of 8 without the assist); a 35 mph car 6 of 6. Note that the upgrade ramp launches cars at its crest like any ramp, so a heavily upgraded car arriving very fast still jumps past the pad.
- **Tuning panel close button.** `#upgradeClose` (and Escape) calls `dismissUpgradePanel()`; `upgradePanelDismissed` keeps the panel hidden and the assist off until the car leaves the pad area.
- **Props across the city (T-048).** `PROP_GROUPS` in `props.js` places a small group (2 to 5) of crates and barrels in every block outside the center, 196 props in total. Two costs were handled: drawing (`PROP_DRAW_DISTANCE`, 170 Manhattan units: ordinary props farther from the camera are not drawn; event props with `p.model` always are; draw calls 181 with 28 props, 195 with 196), and physics (`updateProps()` skips the building check for a prop that has not moved since its last check, and settles tiny drift to zero; physics 0.27 ms/frame with 28 props before, 0.48 ms with 196 after, headless).
- **Playable area.** `PLAY_LIMIT` (world_config.js, `WORLD_HALF - 4`) bounds vehicles, props (`updateProps`) and the walking player (`updateFoot`). Before T-025 the walking player was still clamped to the original +/-106 map, and props had no limit at all.
- **Tuning Ray.** A gate across a road. Crossing its line inside the road width (checked against the previous frame's side, so speed cannot skip it) gives the vehicle `v.rayEffect` for `RAY_EFFECT_SECONDS` (25 s), or the effect's own `seconds`. Effects are read where they are used in `vehicle_update.js` (`rayMul(v, "steer" | "grip")`, `rayAccel(v)`, `rayTopSpeed(v)`), so upgrades are never overwritten and nothing needs restoring. Effects (T-040):
  - Soap Tires: grip x0.12.
  - Super Springs: automatic hops from `updateRayEffects()` at `SPRING_HOP_SPEED` (8.6 m/s, about 2.5 units high since T-042), with `SPRING_GROUND_SECONDS` on the ground between hops so the player can steer. Hops set `v.rayHopActive`, which skips the airtime bonus on landing (a real ramp launch clears it), clear `v.lastRampId` so they never count as a stunt jump, and suppress "Nice landing!".
  - Turbo Overload: 100 mph top speed and `TURBO_ACCEL` (30 m/s^2, 0 to 100 mph in about 1.8 s) for `TURBO_SECONDS` (18 s since T-042). Afterwards `v.turboFade` eases the top speed back to normal over `TURBO_FADE_SECONDS`. At the 0.04 s frame cap 100 mph is about 1.8 units a frame, shorter than a car; 120 headless 100 mph wall hits never put the car inside a building.
  - Boing Bumpers: `rayBounce(v, awayX, awayZ, impact)` is called from `resolveVehicleBuilding()` and `resolveVehiclePair()`. Above `BOING_MIN_IMPACT` it adds a hard rebound (`BOING_BOUNCE` 13 m/s plus `BOING_IMPACT_SHARE` of the impact) and a hop. The car's normal reverse limit (36% of top speed, about 7 mph) used to cut the rebound off on the next frame. Since T-042 a bounce opens a `BOING_SLIDE_SECONDS` (1.8 s) window in which `rayReverseCap()` / `rayForwardCap()` (used by the speed clamp in `vehicle_update.js`) and grip ease back linearly from `BOING_SPEED_CAP` and `BOING_SLIDE_GRIP`, so the rebound carries and slows smoothly. A 15 mph wall hit now throws the car back about 19 units at up to 36 mph (v0.20: about 2.6 units). Props are not bounced off, so smashing still works.
- **Reward Ring.** A golden ring standing on a road. Crossing it inside the ring gives one random permanent upgrade through `applyUpgrade(v, tier)` in `economy.js` (the same function the tuning pad uses).
- **Not built yet:** Rival and Treasure (T-015).

## Recipes

- **New building:** call `addBuilding(...)` in `world_city.js`. Keep it inside a street block, off the road grid.
- **New prop:** today there are two types, `crate` and `barrel`. Their meshes are built in `vehicles.js` (`crateModel`, `barrelModel`), their stats are in `addProp()` in `props.js`, and they are drawn in `camera_render.js`. A new type touches all three. Place props with `addProp(type, x, z)`.
- **New street piece:** add an entry to `streetModules` in `world_streets.js` and place it through `placeStreetUnit`.
- **New vehicle:** add its mesh to `assets/`, create it with `createVehicleVisual`, and spawn it with `vehicle(...)` in `vehicles.js`.
- **New delivery:** add a `delivery(id, pickup, dropoff)` line to `activityDefs` in `activities.js`; the payout comes from the distance. Run `node tools/smoke_test.js`, which rejects pads that overlap buildings, rocks, ramps or each other, and drop-offs that sit on another activity's pad.
- **New smash site or stunt jump:** add a def with `type: "smash"` (a `start` pad and `targets`) or `type: "stunt"` (a `start` pad on a ramp run-up and its `rampId`). The smoke test checks target spots and that a stunt pad lines up with its ramp.
- **New activity type:** add an entry to `activityTypes` with the functions listed under "Activities", then add defs that use it.

- **New Toybox Event:** add an entry to `eventTypes`, a spawner in `eventSpawners`, an updater in `eventUpdaters`, drawing in `drawEvents()`, and its id to `EVENT_POOL` (equal weight is the rule). `validateEventData()` fails if an event is missing from the pool.

## Testing

- `node tools/smoke_test.js` (after `npm install jsdom`). Boots the game headless, drives for 400 frames, checks the 24-vehicle mixed grid fleet (12 compact cars and 12 pickups), unique seeded starts across the four quadrants, legal intersection decisions, full-body pickup clearance through sampled turns, two minutes of turning/cross-district travel, and collision recovery, checks the activity board (three live pads, one per type, spread apart, every pad gets a turn, redraw on finish and skip without the activity just played, off-board pads do nothing, nothing starts on its own, pads start only on entry, on foot does nothing, one activity at a time), plays a delivery, a smash run (including skip cleanup and a traffic-broken target) and a real full-throttle stunt jump (plus a slow roll and a wrong ramp that must not count), checks single payouts, checks activity locations against buildings, ramps and each other, checks that knocked traffic stays out of buildings, checks the Toybox Events (pool with "no event", halving weights with reset, no long gaps, the test switch, the four ray effects including a real 100 mph Turbo run, 100 mph wall hits, the Turbo fade, Boing Bumpers rebounds and the doubled hop height, timer draws, one at a time, comms, map symbol, quiet timeouts, activities unaffected, creature shove and single payout, all three tiers, ray gate opt-in by crossing, effects that undo without losing upgrades, Turbo cap, Super Springs hops, ring upgrade exactly once), checks that ramp side walls match their decks and that shadows stay above ramp surfaces, and fails on exceptions or NaN. It cannot judge visuals, so a human still needs to look at changes.
- `node tools/traffic_report.js [minutes]` simulates the AI traffic with no player and reports collision incidents (grouped, not per frame), their kinds, and how often and how long cars leave the road. Run it before and after changing traffic code. It is a measurement, not a pass/fail test.
- Visual and feel changes need a real browser check. Say so in `agent_comments.md` when you could not do one.

`tools/soak_test.js [minutes] [seed]` (T-025) runs long randomized play: a "monkey" driver alternates random inputs with heading for the current objective, and also boosts, handbrakes, switches vehicles, skips and starts events. It reports errors, non-finite state, money per minute by source, hard-stuck episodes (forward and reverse both fail), objective props outside the playable area, the longest activity and event, camera time inside buildings and camera lag, and wedged traffic. It exits non-zero on a hard problem. About 45 s per 10 simulated minutes.

`tools/economy_report.js [minutesPerStyle] [seed]` (T-049) prints upgrade prices by level, the reward multiplier stages, base payouts, earnings per minute for several play styles measured in the real game (wall ramming, head-on traffic, props, ramp jumps, focused activities on the real board, the event pool's expected value, and mixed play from `soak_test.js`), and minutes to afford 3, 6 and 12 upgrades for each. It reports only; balance lives in T-044. About 2 minutes at the default 4 minutes per style.

### Camera (T-033)

`updateCamera()` keeps its smoothing, with two additions. `CAMERA_MAX_LAG` (4.5) caps how far the camera may trail its intended spot: normal driving lags about 2.5, so only very fast travel is affected (at Turbo Overload's 100 mph the camera sat 23 units from the car; now 15, against 13 normally). `keepCameraOutOfBuildings(target)` casts from the look-at point to the camera against building footprints below their roofs and moves the camera just in front of the nearest wall. Soak runs went from about 1 to 1.6% of frames with the camera inside a building to none.

## Known technical debt

- Large functions: `updateVehicle()` in `vehicle_update.js` is about 170 lines.
- Shared global state makes the dependency graph implicit. Converting to ES modules is possible later but needs explicit exports for all shared state. Not worth doing until it hurts.
- `README.txt` mentions `run_game.py` and `start_game_linux.sh`, which are not in the repo.
