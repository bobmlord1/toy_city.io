# ARCHITECTURE

Owner of this file: the engineering agent (currently Claude). Keep it short and true. If code and this file disagree, fix this file.

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
| `vehicles.js` | Vehicle assets, `vehicle()` factory, player car, semi and trailer, traffic. |
| `props.js` | Smashable props. |
| `state.js` | Shared mutable state (`controlled`, `onFoot`, `player`, `keys`, `touch`). |
| `economy.js` | Cash, crash rewards, tuning pad, upgrades. |
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
- **Keep the world flat for now.** Hills were removed on purpose until the street kit is stable.

## Recipes

- **New building:** call `addBuilding(...)` in `world_city.js`. Keep it inside a street block, off the road grid.
- **New prop:** today there are two types, `crate` and `barrel`. Their meshes are built in `vehicles.js` (`crateModel`, `barrelModel`), their stats are in `addProp()` in `props.js`, and they are drawn in `camera_render.js`. A new type touches all three. Place props with `addProp(type, x, z)`.
- **New street piece:** add an entry to `streetModules` in `world_streets.js` and place it through `placeStreetUnit`.
- **New vehicle:** add its mesh to `assets/`, create it with `createVehicleVisual`, and spawn it with `vehicle(...)` in `vehicles.js`.
- **Goals (planned, not built):** a new `src/goals.js`, loaded after `economy.js`. Each goal is a plain data object, for example `{ type: "deliver", pickup: [x, z], dropoff: [x, z], prompt: "Take the pizza to the school" }`. Build each goal TYPE once in code. New goals should then be data only. Shape will be finalized when design picks the first goal types.

## Testing

- `node tools/smoke_test.js` (after `npm install jsdom`). Boots the game headless, drives for 400 frames, fails on exceptions or NaN. It cannot judge visuals, so a human still needs to look at changes.
- Visual and feel changes need a real browser check. Say so in `agent_comments.md` when you could not do one.

## Known technical debt

- Large functions: `updateVehicle()` in `vehicle_update.js` is about 200 lines.
- Shared global state makes the dependency graph implicit. Converting to ES modules is possible later but needs explicit exports for all shared state. Not worth doing until it hurts.
- `README.txt` mentions `run_game.py` and `start_game_linux.sh`, which are not in the repo.
