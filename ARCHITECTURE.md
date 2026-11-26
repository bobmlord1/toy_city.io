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
- **City Under Attack.** A creature prop (`type: "monster"`) is pushed into `props`, so the normal prop collision, damage latching, debris and shadows all apply. Extra prop fields it uses: `model` (drawn instead of crate/barrel), `height` (airborne cars pass over only above it), `kickScale` (2.5, so gentle bumps shove it hard) and `smashCash: 0` (no ordinary $18; the event pays the tier payout). Tiers: small/medium/large, $200/$300/$450.
- **Tuning Ray.** A gate across a road. Crossing its line inside the road width (checked against the previous frame's side, so speed cannot skip it) gives the vehicle `v.rayEffect` for `RAY_EFFECT_SECONDS` (25 s), or the effect's own `seconds`. Effects are read where they are used in `vehicle_update.js` (`rayMul(v, "steer" | "grip")`, `rayAccel(v)`, `rayTopSpeed(v)`), so upgrades are never overwritten and nothing needs restoring. Effects (T-040):
  - Soap Tires: grip x0.12.
  - Super Springs: automatic hops from `updateRayEffects()` at `SPRING_HOP_SPEED` (about 0.8 units high). Hops set `v.rayHopActive`, which skips the airtime bonus on landing (a real ramp launch clears it), clear `v.lastRampId` so they never count as a stunt jump, and suppress "Nice landing!".
  - Turbo Overload: 100 mph top speed and `TURBO_ACCEL` (30 m/s^2, 0 to 100 mph in about 1.8 s) for `TURBO_SECONDS` (6 s). Afterwards `v.turboFade` eases the top speed back to normal over `TURBO_FADE_SECONDS`. At the 0.04 s frame cap 100 mph is about 1.8 units a frame, shorter than a car; 120 headless 100 mph wall hits never put the car inside a building.
  - Boing Bumpers: `rayBounce(v, awayX, awayZ, impact)` is called from `resolveVehicleBuilding()` and `resolveVehiclePair()`. Above `BOING_MIN_IMPACT` it adds a hard rebound (`BOING_BOUNCE` plus a share of the impact) and a small hop. Props are not bounced off, so smashing still works.
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

## Known technical debt

- Large functions: `updateVehicle()` in `vehicle_update.js` is about 170 lines.
- Shared global state makes the dependency graph implicit. Converting to ES modules is possible later but needs explicit exports for all shared state. Not worth doing until it hurts.
- `README.txt` mentions `run_game.py` and `start_game_linux.sh`, which are not in the repo.
