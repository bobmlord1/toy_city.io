FREE ROAM CAR PLAYGROUND - VERSION 0.11

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
