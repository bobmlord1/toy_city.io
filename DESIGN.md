# DESIGN

Owner of this file: the design agent (currently ChatGPT). Engineering reads it, and only edits it to flag a conflict in `agent_comments.md`.

## Vision

A small, colorful toy city a young child can drive around in. The player mostly wants to roam an open world and complete simple activities. This is a toy first and a game second.

The visual identity is **die-cast cars on a molded-plastic playset**: glossy toy paint, chunky proportions, colorful modular scenery and playful physics. It should feel like a physical toy world, not a realistic driving simulator or a literal LEGO clone.

## Audience

- A young child, with a parent often nearby.
- Likely plays on keyboard or touch. The input device is still unconfirmed (see `TASKS.md`).

## Principles

1. **Toy aesthetic.** Chunky shapes, bright saturated colors, glossy plastic and molded playset construction. Keep the visual language consistent across cars, buildings, trees, roads and props.
2. **Open world.** No loading screens, no walls, no forced route. The whole city is always available.
3. **No way to lose.** No timers, fail states, game over or punishment. Activities wait forever and can be ignored.
4. **Forgiving controls.** Cars should be hard to get stuck and easy to steer. Big targets, generous collision, easy recovery.
5. **Big, immediate feedback.** Every action gets a visible reward (color, motion, a number popping up). Sound later.
6. **Few words.** Prefer icons, colors and arrows over text. A child may not read well yet.
7. **Short loops.** A simple activity should usually take about 30–90 seconds, but there is no time limit.
8. **Safe.** No ads, tracking, external links, chat or real-money features.

## Interface design direction (T-012 — selected for design phase)

The HUD should feel like a **molded dashboard** built into the same toy world as the vehicles: compact, tactile, friendly and easy to scan. It should not look like a pile of unrelated translucent game panels or a loud arcade overlay.

### Visual language
- **Surfaces:** deep petrol/navy panels with a subtle molded-plastic finish; restrained translucency, soft edge highlights and minimal shadow. Avoid strong neon glows, stacked borders and decorative gradients.
- **Typography:** use the existing readable system sans-serif. Large, tabular numerals for speed and cash; short labels; muted secondary text. Avoid long all-caps instructions.
- **Shapes:** one consistent family of rounded rectangles and circular controls, with a small spacing/radius scale reused everywhere. Buttons should look and behave like the same family of physical dashboard controls.
- **Palette:** deep petrol/navy for surfaces; warm ivory for primary text; muted blue-grey for secondary text; restrained aqua for interaction; warm yellow for rewards/objectives; coral for warnings/impact; soft green for success. Color is semantic, not decoration.
- **Hierarchy:** one primary action at a time. Essential driving and navigation remain visible; help, tuning, camera and other secondary actions appear only when needed.

### HUD and minimap principles
- Keep the driving HUD to a compact speed/vehicle/cash cluster, with boost integrated into that cluster rather than occupying its own permanent panel.
- The minimap is north-up for stable bearings, with a visible N marker, a high-contrast player arrow and a small heading cone. Reduce static building/rock detail to a quiet block silhouette; prioritize street connectivity, the player, traffic and the current activity.
- Cache the minimap's static geometry once. Draw only moving vehicles, the player and activity markers each frame.
- Allow the map to expand on tap/click. The expanded map remains north-up and should not cover essential driving controls for longer than needed.
- Use short icon-led prompts. Show the activity card only when an activity is offered/active, tuning controls only at the tuning pad, and enter/exit controls only when interaction is relevant.
- On touch devices, use a subdued but discoverable left thumbstick and right-side accelerator with a smaller brake. Keep large hit areas; let inactive controls become visually quiet rather than removing their affordance. Secondary actions are contextual.

## Current state (v0.15.2)

- Drive a compact car, pickup truck or semi with trailer around a flat 4x4 city. Walk on foot and swap vehicles. The AI traffic fleet uses compact cars and pickups; semis remain player-driven for now.
- Twenty-four persistent AI traffic vehicles start on varied road segments: 12 compact cars and 12 pickup trucks. They share the connected-grid controller and choose to continue, turn left or turn right, travelling between all four city quadrants.
- Traffic starts and route choices use seeded randomness: varied but repeatable between runs. Pickup trucks have four paint variants and larger collision footprints. v0.15.2 adds varied traffic speeds, speed matching behind slower vehicles and reduced route preference for a slower leader's chosen exit when a car remains held back.
- One optional delivery activity is available at a time. The player can ignore or skip it without penalty; completing it pays predictable cash and offers another activity.
- Cash comes from delivery payouts plus incidental crash and airtime rewards. It buys top-speed, acceleration and impact upgrades at the tuning pad.
- The upgrade-ramp side-wall and ramp-shadow fixes are implemented; the owner still needs to confirm their appearance in a real browser.

## Approved gameplay loop (T-001 — approved 2026-11-24)

The goal system adds direction and rewards without turning the sandbox into a mandatory mission game.

**Core loop:** free driving and exploration → optionally try a short activity → follow a clear visual marker → complete a simple action → receive an immediate cash payout and celebration → spend cash on vehicle upgrades → return to free driving.

- Activities are suggestions, not obligations. The player can ignore one, drive elsewhere, or stop at any time.
- No countdowns, lives, fail states, penalties, or forced route.
- Keep at most one activity active at a time in v1. After completion, offer another; do not interrupt free-roam play to force acceptance.
- A completed activity pays once. Leaving its area must not silently fail it or remove earned cash.
- The first version uses fixed, hand-authored locations and existing world objects. No procedural mission generation in v1.

### First three approved activity types

1. **Delivery — pick up and drop off.** Drive to a pickup beacon, activate the pickup, then drive to a marked destination. Use existing buildings/yard locations as endpoints. For v1, the package can be represented by a simple icon or small visual attachment; do not build a cargo physics system.
2. **Smash targets — find and break marked props.** Break a small set of designated crates/barrels already supported by the prop system. Mark only the target props, count progress visibly, and pay when all targets are broken. Do not require crashing into traffic or buildings.
3. **Stunt jump — use a marked ramp and land.** Drive over a marked stunt ramp, achieve a modest airtime threshold, and land. Reuse the current ramp detection and airtime state rather than creating a new stunt physics system.

These activities exercise navigation, destructible props, and ramps/airtime.

### Guidance and feedback

- Use a bright, high-contrast 3D beacon/marker at the current target and a corresponding minimap marker.
- For delivery, clearly distinguish pickup and drop-off states/colors.
- Keep the HUD instruction very short, with an icon where practical (package, crate, ramp).
- Show clear completion feedback and the payout immediately. Do not rely on text alone.
- Avoid a full GPS route/pathfinding system in v1. A visible beacon plus minimap marker is enough.

### Reward and crash-economy decisions

- **Activity payouts are the predictable, primary way to earn upgrade cash.**
- Start playtesting with approximate payouts of $75–$150 depending on activity length/effort. These are tuning values, not final balance. Aim for one or two short activities to afford an early upgrade.
- Keep existing crash/airtime rewards as incidental sandbox bonuses. Do not remove or redesign the crash-for-cash loop in the first objective milestone; it can be rebalanced after activity payouts are tested.
- Never deduct cash for collisions, abandoned activities, or failed attempts. There is no failed attempt state.
- Cosmetic unlocks (vehicle colors, stickers, decorations) are a possible later reward, not a v1 requirement.

## Open questions

1. Confirm the child's primary input device (keyboard, touch, or controller). This affects how an activity is started and how much HUD space is available.

## Decision log

- 2026-11-23: Project goals are only "toy-like aesthetic" and "open world". Everything else is open.
- 2026-11-24: Approved optional delivery, marked-prop smash, and stunt-jump activities; visual beacon plus minimap guidance; activity payouts of approximately $75–$150 as primary predictable income; retain crash/airtime cash as incidental bonuses. No timers, failure states, penalties, or forced participation. T-002 authorized.
- 2026-11-24: Owner playtest of v0.13.0 found that fixed district loops did not produce visible traffic moving through the wider street grid. T-007 replaces closed loops with simple intersection decisions and seeded, varied starting road segments.
- 2026-11-24: The owner reported that the city still felt empty after T-007 and requested 12 additional trucks plus six semis. T-008 adds 12 AI pickups using the same seeded grid controller (24 traffic vehicles total); moving AI semis are deferred until the route planner handles tractor-trailer swept clearance.
