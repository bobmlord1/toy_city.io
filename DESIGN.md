# DESIGN

Owner of this file: the design agent (currently ChatGPT). Engineering reads it, and only edits it to flag a conflict in `agent_comments.md`.

## Vision

A small, colorful toy city a young child can drive around in. The player mostly wants to roam an open world and complete simple activities. This is a toy first and a game second.

The visual identity is **die-cast cars on a molded-plastic playset**: glossy toy paint, chunky proportions, colorful modular scenery and playful physics. It should feel like a physical toy world, not a realistic driving simulator or a literal LEGO clone.

## Audience

- A young child, with a parent often nearby.
- Desktop keyboard and mobile touch are both supported. The HUD auto-selects a desktop/mobile profile with a persistent manual override; the child's most-used device is still unconfirmed.

## Principles

1. **Toy aesthetic.** Chunky shapes, bright saturated colors, glossy plastic and molded playset construction. Keep the visual language consistent across cars, buildings, trees, roads and props.
2. **Open world.** No loading screens, no walls, no forced route. The whole city is always available.
3. **No way to lose.** No timers, fail states, game over or punishment. Activities wait forever and can be ignored.
4. **Forgiving controls.** Cars should be hard to get stuck and easy to steer. Big targets, generous collision, easy recovery.
5. **Big, immediate feedback.** Every action gets a visible reward (color, motion, a number popping up). Sound later.
6. **Few words.** Prefer icons, colors and arrows over text. A child may not read well yet.
7. **Short loops.** A simple activity should usually take about 30–90 seconds, but there is no time limit.
8. **Safe.** No ads, tracking, external links, chat or real-money features.

## Interface design direction (T-012 — owner-approved design phase)

The HUD should feel like a **molded toy dashboard**: playful, chunky and integrated with the die-cast / molded-plastic toy world. It should be less like a realistic car instrument cluster and more like a friendly control console on a toy vehicle or playset. Keep it calm and compact rather than turning it into a collection of arcade panels.

### Design tokens (approved palette and initial specification)

| Token | Value | Use |
|---|---|---|
| Deep petrol | `#152A34` | Main HUD surface |
| Raised teal | `#203D48` | Secondary surface / selected control |
| Warm ivory | `#F4F1E8` | Primary text and high-contrast symbols |
| Blue-grey | `#AFC2C8` | Secondary text and quiet map detail |
| Aqua | `#72D2DC` | Interactive / selected / player-navigation accent |
| Warm yellow | `#F4CF59` | Objective, reward and upgrade accent |
| Soft coral | `#F28F73` | Impact, warning and destructive action |
| Soft green | `#8BC99B` | Completion and success |

Use a 4 px spacing base (4, 8, 12, 16, 24 px), three shared corner radii (8, 12, 18 px), and a single subtle 1 px light border. Keep typography to a small scale: 11–12 px secondary labels, 14 px standard controls, 18 px section values and 26–30 px primary speed. Use sentence case; reserve all-caps for very short status abbreviations. Prefer mostly opaque surfaces over heavy backdrop blur so mobile controls stay crisp and inexpensive to composite.

### Visual language
- **Toy-like, not realistic:** use chunky, friendly proportions, rounded molded edges, raised plastic-like bezels and simple high-contrast symbols. Avoid realistic dials, dense instrument markings, metallic cockpit styling and tiny decorative details.
- **Surfaces:** deep petrol/navy panels with restrained translucency, soft edge highlights and minimal shadow. Avoid strong neon glows, stacked borders and decorative gradients.
- **Typography:** use the existing readable system sans-serif. Large, tabular numerals for speed and cash; short labels; muted secondary text.
- **Shapes:** one consistent family of rounded rectangles and circular controls, with a small spacing/radius scale reused everywhere. All buttons should feel like parts of the same toy dashboard.
- **Palette:** use the approved colors semantically, not decoratively. Aqua marks interaction/player navigation; yellow marks objectives/rewards/upgrades; coral marks warnings/impact; green marks success.

### Dashboard placement and hierarchy
- Use one compact dashboard centered along the **top/overhead edge** of the play area. Keep the lower screen clear because thumbs naturally rest there during mobile play.
- Integrate the minimap into the center of this dashboard; it is the visual anchor, not a separate floating panel.
- Arrange only essential readouts around it: speed, current vehicle and cash. Integrate boost status rather than giving it a permanent standalone panel.
- Keep the same dashboard and map visible across all views and modes, including driving, on-foot play and camera/view changes.
- Activity details appear only when relevant. Tuning controls appear only at the tuning pad. Enter/exit appears only when an interaction is possible. Help and secondary actions stay contextual.
- Prefer symbols and very short labels over sentences. Never require reading a paragraph while driving.

### Minimap: player-relative toy diorama
- Use a **tilted / oblique miniature-playset view** with a restrained tilt-shift toy-diorama feel. Keep markers crisp; do not blur important information for a photographic depth-of-field effect.
- Rotate the map with the player's heading so the direction the player is travelling always points toward the top of the map. Do not use the previous north-up orientation or a permanent N marker.
- Keep the player marker prominent and centered or near-centered. Show only the player and relevant activity/objective markers. A very quiet, simplified road pattern may remain as spatial context, but omit traffic icons, individual buildings, rocks, ordinary props and other background clutter.
- Use large, distinct, icon-led objective markers with the approved semantic colors. Make current/next objective state obvious at a glance.
- Keep the minimap present in every view, including when walking or when no objective is active. When there is no active objective, show the player and only relevant available activity cues rather than filling the map with world detail.
- Cache the simplified map backdrop. Update player position/orientation and objective markers dynamically; do not redraw every city object each frame.
- Any optional map expansion should enlarge the integrated map in place and preserve the dashboard relationship, rather than opening an unrelated full-screen map by default.

### Desktop and mobile profiles
- Design separate desktop and mobile HUD arrangements; do not simply scale one layout down.
- In automatic mode, infer the layout from primary pointer capability and viewport dimensions. Prefer capability/responsive detection rather than user-agent string sniffing.
- Provide a user-accessible override with three modes: **Auto / Desktop / Mobile**. A manual choice must take precedence over detection and persist across reloads. This covers hybrid devices and cases where detection chooses incorrectly.
- Desktop keeps keyboard support and uses the top-center dashboard with a roomier layout. Keyboard help belongs in a small temporary help overlay, not permanently across the play area.
- Mobile keeps the same top-center dashboard but uses a more compact arrangement and leaves the bottom of the screen open for touch interaction.

### Mobile driving controls
- Use an **invisible, floating swipe stick** on the lower-left / left-side play area. The initial touch establishes the stick's origin; finger displacement controls steering and forward/reverse movement. Do not draw a permanent joystick base or knob.
- Releasing the touch returns the stick to neutral. Support simultaneous touches so the player can steer while pressing a right-side button.
- Put **brake**, **boost** and the contextual **enter/exit** action in a consistent icon-button cluster at the bottom right. Show enter when near a usable vehicle and exit while inside one; use one contextual enter/exit button rather than two permanent buttons.
- The stick and buttons must have forgiving hit areas and avoid overlapping the top dashboard. The control buttons should share the dashboard's molded-plastic shape language and remain visually distinct from the driving scene.
- On-foot movement uses the same invisible stick. Only show vehicle-specific actions when they apply.
- Because the stick is invisible, allow a brief, optional first-use swipe cue; it should fade quickly and never become a permanent instructional panel.

### Shared behavior and implementation constraints
- Desktop keyboard and mobile touch must both remain fully supported, regardless of the selected HUD profile.
- Keep controls icon-first and child-readable. Do not introduce long labels, paragraphs, or a full GPS route system as part of the HUD redesign.
- Preserve the existing game systems and keep the implementation incremental. The owner authorized implementation on 2026-11-25. The first pass is on `feature/t012-molded-dashboard`; treat this specification as the acceptance criteria for review and playtesting.

## Current state (v0.16.0 HUD implementation branch)

- Drive a compact car, pickup truck or semi with trailer around a flat 4x4 city. Walk on foot and swap vehicles. The AI traffic fleet uses compact cars and pickups; semis remain player-driven for now.
- Twenty-four persistent AI traffic vehicles start on varied road segments: 12 compact cars and 12 pickup trucks. They share the connected-grid controller and choose to continue, turn left or turn right, travelling between all four city quadrants.
- Traffic starts and route choices use seeded randomness: varied but repeatable between runs. Pickup trucks have four paint variants and larger collision footprints. v0.15.2 adds varied traffic speeds, speed matching behind slower vehicles and reduced route preference for a slower leader's chosen exit when a car remains held back.
- One optional delivery activity is available at a time. The player can ignore or skip it without penalty; completing it pays predictable cash and offers another activity.
- Cash comes from delivery payouts plus incidental crash and airtime rewards. It buys top-speed, acceleration and impact upgrades at the tuning pad.
- The owner confirmed the upgrade-ramp side-wall and ramp-shadow fixes look right in a real browser.
- T-012 first implementation pass: top-center molded dashboard, integrated player-relative tilted objective map, Auto/Desktop/Mobile profile selector, invisible mobile swipe steering and bottom-right brake/boost/contextual enter-exit controls. This is on a feature branch and has not yet passed owner browser/touch playtesting.

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
- 2026-11-25: The owner approved the T-012 palette and dashboard direction, moved the dashboard to the top-center, chose a toy-like interface, and replaced the proposed north-up map/visible stick with a player-relative tilted objective map and invisible swipe-stick mobile controls. Desktop/mobile profiles should be detected automatically with a manual override.
