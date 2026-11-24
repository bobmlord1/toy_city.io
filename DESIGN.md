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

## Current state (v0.11.2)

- Drive a compact car, pickup truck or semi with trailer around a flat 4x4 city. Walk on foot and swap vehicles.
- Permanent traffic loop, ramps, smashable props and buildings.
- Reward loop today: crashes and airtime earn cash; cash buys speed, acceleration and impact upgrades at a tuning pad.
- There are no optional activities yet.

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
