FREE ROAM CAR PLAYGROUND - VERSION 0.22.0

WHAT'S NEW
- Imported toy vehicles now have separately animated wheels.
- Front wheels steer with A/D and the arrow keys.
- Wheel rotation follows signed forward/reverse speed.
- The semi tractor has six animated wheels; its trailer has four independently animated wheels.
- The pickup, compact car and traffic cars all animate their wheels.

Do not open index.html directly using file://. The game loads its binary vehicle meshes from the assets folder, and browsers restrict fetch() from file URLs.

ASSET LICENSE
Compact Car, Pickup Truck, Semi Truck and trailer geometry are adapted from the Grab3D Cozy Vehicles collection, dedicated under CC0 1.0.
CC0 legal text: https://creativecommons.org/publicdomain/zero/1.0/
Publisher: https://grab3d.com/kits/cozy-vehicles/
\nVersion 0.9 changes:\n- World expanded to a 4x4 layout of the original play area.\n- Connected avenue grid and perimeter traffic circuit.\n- Twelve persistent traffic vehicles follow the city loop and can be knocked off line.\n- Added varied low-rise, mid-rise and tower buildings across the expanded districts.\n

Version 0.11 changes:
- Replaced the rolling terrain with a single flat green baseplate.
- Rebuilt streets from reusable box-based road, intersection, sidewalk and corner modules.
- Street layout is data-driven; each placed pavement module registers its matching ground-support collider.
- Road runs use discrete chunks and dedicated intersection boxes to avoid overlapping top surfaces.

Version 0.11.2 changes:
- Code refactor only, no gameplay changes. game.js is now split into files in src/ (load order is listed in index.html).
- Added DESIGN.md, ARCHITECTURE.md, TASKS.md, AGENTS.md and agent_comments.md for the multi-agent workflow.
- Added tools/smoke_test.js (run: npm install jsdom, then node tools/smoke_test.js).
- To run locally: python3 -m http.server, then open http://localhost:8000

Version 0.12.0 changes:
- Optional delivery activities: drive to the package beacon, then to the marked house for a cash payout. No timers or penalties. Press G or tap SKIP to get a different one.

Version 0.12.1 changes:
- Fixed a stray fin and a hole in the upgrade ramp's right side wall.
- Fixed vehicle and prop shadows clipping through ramps and the tuning pad.

Version 0.13.0 changes:
- Replaced the single perimeter traffic loop with four fixed district circuits.

Version 0.14.0 changes:
- Traffic now starts at varied, seeded road locations across the full city grid.
- Traffic chooses to continue, turn left or turn right at intersections and can travel between districts.
- The traffic fleet remains at twelve persistent cars; no spawning or despawning was added.
Version 0.15.0 changes:
- Increased moving AI traffic from 12 to 24 persistent vehicles: 12 compact cars plus 12 pickup trucks.
- Pickup traffic uses four body paint variants, a larger collision footprint and slightly lower cruising speeds.
- All 24 vehicles share the seeded intersection-grid navigation, varied starting locations and collision recovery.
- Moving AI semis are deferred until the route controller can account for the combined tractor-trailer footprint through turns.

Version 0.15.1 changes:
- Traffic cars now slow down for a slower car ahead in the same lane instead of ramming it.
- Performance: collision checks skip far-away objects (physics cost per frame is about 3x lower) and the HUD only updates text when it changes.
- Removed unused old traffic loop code.

Version 0.15.2 changes:
- Traffic top speeds now vary by up to 5 mph either way, chosen at random each time the game loads.
- A car stuck behind a slower car is less likely to take the same exit at the next intersection, and less likely again at each following one.


Version 0.16.0 (T-012 first HUD pass):
- Added the top-center molded dashboard, integrated objective map, Auto / Desktop / Mobile profiles and invisible mobile swipe controls.

Version 0.16.1 (T-012 HUD refinement branch):
- Replaced the counter-rotating heading-up map with a fixed world-oriented map and a vehicle marker that rotates with the car.
- Added a circular digital speed gauge and strengthened the approved aqua, yellow, coral and green accents across the molded-plastic interface.
- Moved the PBR lighting selector to the startup screen; it is no longer part of the driving HUD.
- Added smoke-test coverage for map orientation, speed-gauge markup and startup-only lighting placement.
- Automated smoke testing and real browser/touch playtesting are still required.

Version 0.16.2:
- Made the speed gauge optional at runtime; older/cached page markup falls back to a numeric MPH readout instead of stopping the game loop.
- Versioned dynamic game-script URLs to reduce stale HTML/script combinations.


Version 0.16.3 (T-013 compact dashboard):
- Cut the dashboard's vertical footprint to roughly half by arranging vehicle and cash telemetry in compact side panels.
- Moved the active delivery instruction, distance and SKIP action into a reserved strip immediately above the minimap.
- Kept the objective strip's space reserved so the dashboard does not jump when an activity appears or clears.


Version 0.16.4 (T-014 side-by-side map/objective layout):
- Placed the integrated minimap beside the objective information and SKIP control instead of stacking the objective above a very short map.
- Enlarged the minimap while keeping the compact top dashboard; desktop and mobile have separate map/objective column sizing.
- The objective panel keeps its column reserved when hidden, so the dashboard does not shift when an activity starts or ends.


Version 0.17.0 (T-016 to T-019 activities):
- Activities are no longer handed out one after another. Every activity now has a marked pad in the city and on the minimap; drive onto one to start it. SKIP stops it at any time with no penalty.
- New smash targets activity: break the marked barrels and crates that appear by the pad.
- New stunt jump activity: drive off the marked ramp fast enough for a good jump.
- Deliveries now cover the whole city: 17 routes, paying more for longer trips.
- Fixed the headless smoke test, which had stopped running after the prop changes.

Version 0.18.0 (T-020 to T-022 Toybox Events):
- Dr. BadDude's Toybox Events: every so often something surprising may appear in the city. A message slides in from the side and the event gets its own symbol on the map. Events are optional and simply vanish when their time is up.
- City Under Attack: smash a giant toy creature (three sizes) for a big payout. It is very light, so even small bumps push it around.
- Tuning Ray: drive through the ray gate for 25 seconds of Soap Tires, Super Springs, Turbo Overload or Tank Treads.
- Reward Ring: drive through the golden ring for a free permanent upgrade.
- Traffic cars knocked onto the grass no longer drive through buildings.

Version 0.19.0 (T-038, T-039):
- Only three activity markers are on the map at a time: one delivery, one smash and one stunt, spread out across the city. Finishing or skipping one brings up a new three.
- Toybox Events now take turns better: once an event has appeared it becomes less likely until every option has had a turn, so none goes missing for long.
- For testing: add ?event=tuningRay (or cityAttack, rewardRing) to the page address to start that event right away. Extras: &effect=soapTires, superSprings, turboOverload or tankTreads for the ray, and &tier=small, medium or large for the creature.

Version 0.20.0 (T-040 Tuning Ray rework):
- Turbo Overload is now wild: 100 mph and huge acceleration for 6 seconds, then the car eases back to normal speed.
- Super Springs hops about twice as high.
- Tank Treads is gone. New: Boing Bumpers. Hit a wall or another car and you bounce off with a BOING.
- Dr. BadDude's Tuning Ray line now reads: "This will make your car at least 37% better. I just need to measure at what!"
- Test switch effect names: soapTires, superSprings, turboOverload, boingBumpers.

Version 0.21.0 (T-025, T-028, T-033 fixes):
- Getting out of a car anywhere in the city now leaves you next to it. Before, outside the center you appeared far away and could never get back to that car.
- Crates, barrels and Dr. BadDude's creature can no longer be pushed off the edge of the map.
- Traffic slows down for corners, so cars stay in their own lane after turning and crash into each other less.
- The camera keeps up at Turbo Overload speed and no longer ends up inside buildings.
- For developers: tools/soak_test.js runs long randomized play and reports problems.

Version 0.21.1 (T-041):
- Touch steering is now gradual: slide a little for a small turn, all the way for a sharp one. Small wobbles of your thumb no longer swerve the car, so driving straight is easy.

Version 0.21.2 (T-042):
- Turbo Overload lasts 18 seconds (three times as long).
- Super Springs hops about three times higher.
- Boing Bumpers throws you back much harder and farther when you hit something.

Version 0.21.3 (T-043):
- The tuning pad now helps you stop on it: let go of the gas near the pad and the car gently rolls onto it and stops. Press gas or reverse to drive away any time.
- The tuning panel has an X button (or press Escape) to close it, so it never blocks the touch controls. It comes back the next time you drive onto the pad.

Version 0.22.0 (T-045 to T-049):
- City Under Attack creatures are now giant: about as tall as a house, an apartment block, or most of a tower. They take more hits to smash but still slide around when you bump them.
- New Toybox Event, Treasure: smash Dr. BadDude's treasure chest in one hit for $1,000.
- New Toybox Event, Rival: one traffic car is marked. Ram it three times before time runs out.
- Crates and barrels now stand in every part of the city, not just the center.
- Test switch: ?event=treasure and ?event=rival also work.
- For developers: tools/economy_report.js measures how fast each way of playing earns money.
