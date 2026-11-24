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
| `vehicles.js` | Vehicle assets, `vehicle()` factory, player car, semi and trailer, fixed district traffic routes. |
| `props.js` | Smashable props. |
| `state.js` | Shared mutable state (`controlled`, `onFoot`, `player`, `keys`, `touch`). |
| `economy.js` | Cash, crash rewards, tuning pad, upgrades, and `awardCash()` for non-crash rewards. |
| `activities.js` | Optional activities: offers, beacons, minimap markers, payouts. Ships the `delivery` type. |
| `interaction.js` | `say()`, enter/exit vehicle, small vehicle helpers. |
| `input.js` | Keyboard and touch, steering convention, boost. |
| `collisions.js` | Collision resolution, trailer physics, suspension, airtime. |
| `vehicle_update.js` | `updateVehicle()`, the per-vehicle driving and traffic AI step. |
| `physics.js` | On-foot movement, prop and debris updates, `updatePhysics()`. |
| `camera_render.js` | Chase camera, `drawWorld()`. |
| `hud.js` | HUD text and minimap. |
| `main.js` | Frame loop and startup. Loads last. |

Every frame runs: `updatePhysics(dt)`, then `drawWorld(dt)`, then `updateUI()`, then `drawMap()`.

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
- **Keep the world flat for now.** Hills were removed on purpose until the street kit is stable.

## Traffic navigation

The 12 persistent traffic cars use the full street grid, not closed loops. `streetLines` supplies the eight north-south/east-west road centerlines. `trafficBuildLeg()` plans one road segment to the next intersection and chooses a legal straight, left or right exit (weighted 56% / 22% / 22%, renormalized at city edges). Cars follow a sampled lane-center path; turns use a short cubic curve within the intersection. The next leg is planned when the current one completes, so routes can continue across all four city quadrants without a pathfinding engine.

Starting road edges are shuffled with a fixed layout seed, so the 12 vehicles begin on distinct, varied street segments across the full grid while remaining reproducible. Each vehicle has its own deterministic decision seed. The AI stores its current grid node, heading, leg progress and visited-region mask for validation. Traffic remains persistent, and `aiKnockTime` still reduces the lane-recovery spring after collisions.

## Activities

`src/activities.js` is the optional-activity framework. It is deliberately small.

- **One offer at a time.** `currentActivity` is `{ def, phase, t }` or `null`. An "offer" is just a visible pickup beacon. Ignoring it costs nothing. The next offer appears about 2.6 seconds after a completion or a skip.
- **Data plus type.** `activityDefs` holds hand-authored locations and payouts. `activityTypes[type]` holds behaviour: `markers(act)` returns what to draw, `hud(act)` returns an icon and short text, `update(act)` returns `"complete"` when the reward is due.
- **Hooks into other files** (the only places other code touches it): `updateActivities(dt)` in `main.js`, `drawActivityMarkers(vp)` in `camera_render.js`, `drawActivityMapMarkers()` and `updateActivityHud()` in `hud.js`, the `G` key in `input.js`, and `awardCash()` in `economy.js`. The HUD panel markup is in `index.html`.
- **Payout safety.** `completeActivity()` clears `currentActivity` before paying, so an activity can pay only once. There is no timer, no failure state and no cash deduction anywhere.
- **Not built yet:** smash-target and stunt-jump types. Smash targets need stable prop identity and a break event: props have no ids and broken props are spliced out of `props` (see `damageProp()` in `collisions.js` and `updateProps()` in `physics.js`). Stunt jump needs the ramp that launched the vehicle to be identifiable (ramps have ids, but airtime state does not record which one was used).

## Recipes

- **New building:** call `addBuilding(...)` in `world_city.js`. Keep it inside a street block, off the road grid.
- **New prop:** today there are two types, `crate` and `barrel`. Their meshes are built in `vehicles.js` (`crateModel`, `barrelModel`), their stats are in `addProp()` in `props.js`, and they are drawn in `camera_render.js`. A new type touches all three. Place props with `addProp(type, x, z)`.
- **New street piece:** add an entry to `streetModules` in `world_streets.js` and place it through `placeStreetUnit`.
- **New vehicle:** add its mesh to `assets/`, create it with `createVehicleVisual`, and spawn it with `vehicle(...)` in `vehicles.js`.
- **New delivery:** add an entry to `activityDefs` in `activities.js` with fixed `pickup` and `dropoff` coordinates and a payout between $75 and $150. Run `node tools/smoke_test.js`, which rejects zones that overlap buildings, rocks or ramps.
- **New activity type (smash targets, stunt jump):** add an entry to `activityTypes` with `markers(act)`, `hud(act)` and `update(act)`, then add defs that use it. See "Activities" below.

## Testing

- `node tools/smoke_test.js` (after `npm install jsdom`). Boots the game headless, drives for 400 frames, checks the 12-car persistent grid fleet, unique seeded starts across the four quadrants, legal intersection decisions, sampled turn geometry, two minutes of turning/cross-district travel, and collision recovery, plays a full delivery (pickup, carry, drop-off, single payout, skip, next offer), checks activity locations against buildings and ramps, checks that ramp side walls match their decks and that shadows stay above ramp surfaces, and fails on exceptions or NaN. It cannot judge visuals, so a human still needs to look at changes.
- Visual and feel changes need a real browser check. Say so in `agent_comments.md` when you could not do one.

## Known technical debt

- Large functions: `updateVehicle()` in `vehicle_update.js` is about 200 lines.
- Shared global state makes the dependency graph implicit. Converting to ES modules is possible later but needs explicit exports for all shared state. Not worth doing until it hurts.
- `README.txt` mentions `run_game.py` and `start_game_linux.sh`, which are not in the repo.
