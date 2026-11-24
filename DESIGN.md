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
- There are **no goals yet**.

## Proposed gameplay loop (T-001 — pending project-owner approval)

The goal system should add direction and rewards without turning the sandbox into a mandatory mission game.

**Core loop:** free driving and exploration → optionally try a short activity → follow a clear visual marker → complete a simple action → receive an immediate cash payout and celebration → spend cash on vehicle upgrades → return to free driving.

- Activities are suggestions, not obligations. The player can ignore one, drive elsewhere, or stop at any time.
- No countdowns, lives, fail states, penalties, or forced route.
- Keep at most one activity active at a time in v1. After completion, offer another; do not interrupt free-roam play to force acceptance.
- A completed activity pays once. Leaving its area must not silently fail it or remove earned cash.
- The first version should use fixed, hand-authored locations and existing world objects. Do not add procedural mission generation yet.

### First three proposed activity types

1. **Delivery — pick up and drop off.** Drive to a pickup beacon, activate the pickup, then drive to a marked destination. Use existing buildings/yard locations as endpoints. For v1, the package can be represented by a simple icon or small visual attachment; do not build a cargo physics system.
2. **Smash targets — find and break marked props.** Break a small set of designated crates/barrels already supported by the prop system. Mark only the target props, count progress visibly, and pay when all targets are broken. Do not require crashing into traffic or buildings.
3. **Stunt jump — use a marked ramp and land.** Drive over one of the existing stunt ramps, achieve a modest airtime threshold, and land. Reuse the current ramp detection and airtime state rather than creating a new stunt physics system.

These three activities deliberately exercise different existing systems: navigation, destructible props, and ramps/airtime.

### Guidance and feedback

- Use a bright, high-contrast 3D beacon/marker at the current target and a corresponding minimap marker.
- For delivery, clearly distinguish pickup and drop-off states/colors.
- Keep the HUD instruction very short, with an icon where practical (for example: package, crate, ramp).
- Show clear completion feedback and the payout immediately. Do not rely on text alone.
- Avoid a full GPS route/pathfinding system in v1. A visible beacon plus minimap marker is enough.

### Reward and crash-economy proposal

- **Activity payouts should become the predictable, primary way to earn upgrade cash.**
- Start playtesting with approximate payouts of $75–$150 depending on activity length/effort. These are tuning values, not final balance. Aim for one or two short activities to afford an early upgrade.
- Keep the existing crash/airtime rewards as incidental sandbox bonuses for now. Do not remove or redesign the crash-for-cash loop in the same change as the first goal system; it is part of the toy-play feedback and can be rebalanced after activity payouts are tested.
- Never deduct cash for collisions, abandoned activities, or failed attempts. There should be no failed attempt state.
- Cosmetic unlocks (vehicle colors, stickers, decorations) are a possible later reward, not a requirement for v1.

## Open questions for the project owner

1. Approve, reject or amend the three proposed activity types: delivery, smash marked props, and stunt jump.
2. Approve the proposed reward direction: activity payouts become the main predictable income; crash/airtime cash remains as a smaller incidental bonus for the first iteration.
3. Confirm the child's primary input device (keyboard, touch, or controller). This affects how the activity is started and how much HUD space is available.

## Decision log

Newest at the bottom. Add a line when a decision is made.

- 2026-11-23: Project goals are only "toy-like aesthetic" and "open world". Everything else is open.
- 2026-11-24: Proposed a short, optional activity loop with delivery, marked-prop smashing and stunt-jump activities. Proposed $75–$150 activity payouts as the primary predictable upgrade income while retaining crash/airtime rewards as incidental bonuses. **Pending project-owner approval; no gameplay implementation authorized yet.**
