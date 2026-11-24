# DESIGN

Owner of this file: the design agent (currently ChatGPT). Engineering reads it, and only edits it to flag a conflict in `agent_comments.md`.

## Vision

A small, colorful toy city a young child can drive around in. He loves vehicle games. He mostly wants to roam an open world and complete simple goals. This is a toy first and a game second.

## Audience

- A young child, with a parent often nearby.
- Likely plays on keyboard or touch. The input device is still unconfirmed (see `TASKS.md`).

## Principles

1. **Toy aesthetic.** Chunky shapes, bright saturated colors, glossy plastic look, brick-built buildings. Nothing realistic or gritty.
2. **Open world.** No loading screens, no walls, no forced route. The whole city is always available.
3. **No way to lose.** No timers, no fail states, no game over, no punishment. Goals wait forever.
4. **Forgiving controls.** Cars should be hard to get stuck and easy to steer. Big targets, generous collision, easy recovery.
5. **Big, immediate feedback.** Every action gets a visible reward (color, motion, a number popping up). Sound later.
6. **Few words.** Prefer icons, colors and arrows over text. A child may not read well yet.
7. **Short loops.** A goal should be completable in about a minute.
8. **Safe.** No ads, no real-money purchases, no chat, no external links in the game.

## Current state (v0.11.2)

- Drive a compact car, pickup truck or semi with trailer around a flat 4x4 city. Walk on foot and swap vehicles.
- Permanent traffic loop, ramps, smashable props, buildings.
- Reward loop today: crashes and airtime earn cash, cash buys speed, acceleration and impact upgrades at a tuning pad.
- There are **no goals yet**.

## Open questions (design agent to propose, owner to decide)

1. What are the first 3 goal types? Candidates: deliver an item to a marked building, collect a set of floating items, park on a marked spot, smash a set of marked props, drive over all ramps.
2. How does a goal show where to go? Candidates: floating arrow, colored beam of light, a marker on the minimap.
3. What do goals reward? Cash, new vehicle colors, new vehicles, stickers, city decorations.
4. Does the crash-for-cash economy stay, become optional, or go away? It fits "toy" but not "gentle". Decide before building goals on top of it.
5. Does he need a simpler control scheme (auto-steer assist, bigger touch buttons, one-button drive)?

## Decision log

Newest at the bottom. Add a line when a design decision is made.

- 2026-11-23: Project goals are only "toy-like aesthetic" and "open world". Everything else is open.
