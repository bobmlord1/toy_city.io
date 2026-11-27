"use strict";
// =============================================================================
// src/events.js
// Toybox Events (T-015, T-021, T-022): occasional optional surprises from Dr. BadDude.
// - Every EVENT_ROLL_INTERVAL seconds with no event running, one option is drawn from
//   EVENT_POOL. Every event and "no event" (null) has equal weight.
// - At most one event at a time. It never cancels or blocks a normal activity.
// - A comms panel slides out with the event name and Dr. BadDude's line, and the event gets
//   its own minimap symbol. When its timer runs out it simply disappears: no fail state,
//   no message, no penalty.
// Types: "cityAttack" (smash a giant toy creature), "tuningRay" (drive through a ray gate for
// a temporary handling effect), "rewardRing" (drive through a golden ring for a free upgrade).
// =============================================================================

const EVENT_FIRST_ROLL = 45; // seconds of play before the first draw
const EVENT_ROLL_INTERVAL = 75; // seconds between draws while no event runs
const EVENT_POOL = ["cityAttack", "tuningRay", "rewardRing", "treasure", "rival", null]; // null = no event
const EVENT_COMMS_SECONDS = 7;
const EVENT_SPAWN_MIN = 60; // events appear this far from the player...
const EVENT_SPAWN_MAX = 200; // ...but not farther, when a site allows it
const RAY_EFFECT_SECONDS = 25; // default length of a Tuning Ray effect
const TURBO_TOP_SPEED = 100 * MPH_TO_MS; // Turbo Overload: deliberately unmanageable, but short
const TURBO_ACCEL = 30; // m/s^2: 0 to 100 mph in about 1.5 s
const TURBO_SECONDS = 18; // tripled after the 2026-11-26 playtest (was 6)
const TURBO_FADE_SECONDS = 1.5; // afterwards top speed eases back down instead of snapping
const SPRING_HOP_SPEED = 8.6; // m/s upward: about 2.5 units high (v0.20 was 0.8, v0.18 was 0.4)
const SPRING_GROUND_SECONDS = 0.25; // time on the ground between hops, to steer and speed up
const BOING_MIN_IMPACT = 1.5; // m/s: slower scrapes do not bounce
const BOING_BOUNCE = 13; // m/s extra rebound off walls and vehicles, plus a hop (v0.20 was 7)
const BOING_IMPACT_SHARE = 1.0; // plus this share of the impact speed (v0.20 was 0.6)
const BOING_HOP_SPEED = 5.5; // m/s upward (v0.20 was 3.6)
// After a bounce the car may fly back or sideways faster than its normal reverse limit and
// slides with little grip, so the rebound carries instead of being cut off the next frame.
const BOING_SLIDE_SECONDS = 1.8; // long enough for the rebound to slow on its own before limits return
const BOING_SLIDE_GRIP = 0.2;
const BOING_SPEED_CAP = 30; // m/s while sliding from a bounce

// Dr. BadDude's approved one-liners (TASKS.md T-015). Keep the wording unless the owner revises it.
const eventTypes = {
  cityAttack: {
    name: "City Under Attack!",
    line: "Technically, the containment system worked. The City is the containment system!",
    duration: 120,
    mapShape: "burst",
    mapColor: "#F28F73",
  },
  tuningRay: {
    name: "Tuning Ray",
    line: "This will make your car at least 37% better. I just need to measure at what!",
    duration: 75,
    mapShape: "diamond",
    mapColor: "#72D2DC",
  },
  rewardRing: {
    name: "Reward Ring",
    line: "It's perfectly safe. The test dummy only exploded once!",
    duration: 75,
    mapShape: "ring",
    mapColor: "#F4CF59",
  },
  treasure: {
    name: "Treasure!",
    line: "Someone asked about my research fund: What research fund?!",
    duration: 90,
    mapShape: "square",
    mapColor: "#F4CF59",
  },
  rival: {
    name: "Rival",
    line: "I've maxed out my crash insurance! Let's see what it pays out!",
    duration: 90,
    mapShape: "triangle",
    mapColor: "#F28F73",
  },
};
const TREASURE_PAYOUT = 500; // owner: $1,000 (2026-11-26) was too strong; two chests bought 70 mph (2026-11-27)
const RIVAL_PAYOUT = 350; // between the small and medium creature (T-044 scale); tune with T-044
const RIVAL_HITS = 3; // rams needed to wreck the rival
const RIVAL_MIN_IMPACT = 2.2; // m/s closing speed (about 5 mph): gentle touches do not count
// While marked, the rival cruises at most this fast (about 12 mph), so a stock car (20 mph) closes
// on it at a speed that counts as a hit. Applied in vehicle_update.js (traffic speed).
const RIVAL_MAX_CRUISE = 5.5;

// ---------------------------------------------------------------------------
// Where events can appear. Both lists are built once, deterministically, from the world.
// Lawn sites (City Under Attack): open ground inside street blocks, clear of buildings, rocks,
// ramps, props and activity pads. Road spots (Tuning Ray, Reward Ring): street centerlines away
// from intersections, ramps and activity pads.
// ---------------------------------------------------------------------------
const EVENT_LAWN_CLEARANCE = 12; // room for the large creature (radius 8.6) plus a car
function eventLawnSiteClear(x, z) {
  if (Math.abs(x) > WORLD_HALF - 30 || Math.abs(z) > WORLD_HALF - 30) return false;
  if (!propSpotAllowed(x, z) || isNearAnyRamp(x, z, EVENT_LAWN_CLEARANCE)) return false;
  for (const line of streetLines)
    if (Math.abs(x - line) < SIDEWALK_OUTER + 10 || Math.abs(z - line) < SIDEWALK_OUTER + 10)
      return false;
  for (const b of buildingColliders) {
    const dx = Math.max(Math.abs(x - b.x) - b.hw, 0),
      dz = Math.max(Math.abs(z - b.z) - b.hl, 0);
    if (Math.hypot(dx, dz) < EVENT_LAWN_CLEARANCE) return false;
  }
  for (const p of props) if (Math.hypot(p.x - x, p.z - z) < EVENT_LAWN_CLEARANCE + 2) return false;
  for (const def of activityDefs) {
    const s = activityStart(def);
    if (Math.hypot(s.x - x, s.z - z) < EVENT_LAWN_CLEARANCE + ACTIVITY_ZONE_RADIUS + 8) return false;
  }
  return true;
}
const eventLawnSites = [];
for (const cx of [-330, -220, -110, 0, 110, 220, 330])
  for (const cz of [-330, -220, -110, 0, 110, 220, 330])
    for (const [ox, oz] of [[0, 0], [-20, -20], [20, 20], [-20, 20], [20, -20], [0, 24], [0, -24], [24, 0], [-24, 0]])
      if (eventLawnSiteClear(cx + ox, cz + oz)) {
        eventLawnSites.push({ x: cx + ox, z: cz + oz });
        break; // one site per block keeps them spread out
      }

const eventRoadSpots = [];
for (const line of streetLines)
  for (let t = -WORLD_HALF + 30; t <= WORLD_HALF - 30; t += 11)
    for (const axis of ["x", "z"]) {
      // axis "z": the road runs along z at x = line. axis "x": along x at z = line.
      const x = axis === "z" ? line : t,
        z = axis === "z" ? t : line;
      if (streetLines.some((other) => Math.abs((axis === "z" ? z : x) - other) < 24)) continue;
      if (isNearAnyRamp(x, z, 12)) continue;
      if (activityDefs.some((def) => {
        const s = activityStart(def);
        return Math.hypot(s.x - x, s.z - z) < 16;
      })) continue;
      eventRoadSpots.push({ x, z, axis });
    }

// Choose a site in the preferred distance band (ahead of the player when possible).
function pickEventSite(list, preferAhead) {
  const p = onFoot ? player : controlled;
  if (!p || list.length === 0) return null;
  const fx = Math.sin(p.yaw || 0),
    fz = Math.cos(p.yaw || 0);
  let band = list.filter((s) => {
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    return d >= EVENT_SPAWN_MIN && d <= EVENT_SPAWN_MAX;
  });
  if (preferAhead) {
    const ahead = band.filter((s) => (s.x - p.x) * fx + (s.z - p.z) * fz > 0);
    if (ahead.length) band = ahead;
  }
  if (band.length === 0) {
    // Nothing in the band: take the nearest site that is not right on top of the player.
    band = list
      .filter((s) => Math.hypot(s.x - p.x, s.z - p.z) >= 25)
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))
      .slice(0, 1);
  }
  return band.length ? band[Math.floor(Math.random() * band.length)] : null;
}

// ---------------------------------------------------------------------------
// Meshes (built once)
// ---------------------------------------------------------------------------
// A blocky toy creature: stubby legs, round-ish body, big eyes, horns and little arms.
function buildMonsterMesh(s, body, accent) {
  const b = new MeshBuilder();
  b.useMaterial(0.32, 0, 0);
  const box = (x0, y0, z0, x1, y1, z1, c) => b.box(x0 * s, y0 * s, z0 * s, x1 * s, y1 * s, z1 * s, c);
  box(-0.9, 0, -0.5, -0.3, 0.9, 0.4, accent); // legs
  box(0.3, 0, -0.5, 0.9, 0.9, 0.4, accent);
  box(-1.2, 0.8, -0.9, 1.2, 2.9, 0.9, body); // body
  box(-0.9, 1.0, 0.85, 0.9, 2.3, 1.0, [0.98, 0.88, 0.62]); // belly
  box(-1.0, 2.8, -0.8, 1.0, 4.0, 0.8, body); // head
  box(-0.75, 3.25, 0.78, -0.2, 3.8, 0.95, [1, 1, 1]); // eyes
  box(0.2, 3.25, 0.78, 0.75, 3.8, 0.95, [1, 1, 1]);
  box(-0.55, 3.35, 0.93, -0.3, 3.65, 1.0, [0.08, 0.08, 0.1]);
  box(0.3, 3.35, 0.93, 0.55, 3.65, 1.0, [0.08, 0.08, 0.1]);
  box(-0.6, 2.95, 0.78, 0.6, 3.1, 0.92, [0.95, 0.95, 0.95]); // teeth
  box(-1.0, 4.0, -0.2, -0.6, 4.7, 0.2, accent); // horns
  box(0.6, 4.0, -0.2, 1.0, 4.7, 0.2, accent);
  box(-1.9, 1.9, -0.3, -1.2, 2.4, 0.5, body); // arms
  box(1.2, 1.9, -0.3, 1.9, 2.4, 0.5, body);
  box(-0.3, 2.9, -1.1, 0.3, 3.6, -0.8, accent); // back spikes
  box(-0.3, 1.9, -1.1, 0.3, 2.6, -0.85, accent);
  return b.finish();
}
// City Under Attack difficulty tiers (chosen with equal weight).
// T-045: about 12, 18 and 28 units tall (the child found the old 5 to 8 "tiny"; buildings are
// 9 to 55, median 18). Radius covers the arms. Payouts are T-044's; health is about 5, 8 and 12
// stock hits (a 20 mph hit does about 4.5).
const MONSTER_TIERS = [
  { id: "small", scale: 2.55, radius: 3.7, hp: 22, payout: 250, body: [0.36, 0.82, 0.4], accent: [0.98, 0.78, 0.22] },
  { id: "medium", scale: 3.83, radius: 5.6, hp: 36, payout: 375, body: [0.62, 0.42, 0.92], accent: [0.98, 0.5, 0.75] },
  { id: "large", scale: 5.96, radius: 8.6, hp: 55, payout: 550, body: [0.95, 0.38, 0.28], accent: [0.25, 0.75, 0.95] },
];
for (const tier of MONSTER_TIERS) tier.model = buildMonsterMesh(tier.scale, tier.body, tier.accent);

function buildEventBeaconMesh(color) {
  const b = new MeshBuilder();
  b.useMaterial(0.2, 0, 0);
  b.cylinderY(0, 0, 0, 0.35, 30, color, 10);
  return b.finish();
}
const eventBeacons = {
  cityAttack: buildEventBeaconMesh([0.96, 0.34, 0.27]),
  tuningRay: buildEventBeaconMesh([0.2, 0.85, 0.95]),
  rewardRing: buildEventBeaconMesh([1.0, 0.8, 0.2]),
  treasure: buildEventBeaconMesh([1.0, 0.85, 0.3]),
  rival: buildEventBeaconMesh([0.98, 0.45, 0.4]),
};
// T-046: a toy treasure chest: wooden box and lid, gold bands, lock and a heap of coins and gems.
const treasureChestMesh = (() => {
  const b = new MeshBuilder();
  const s = 1.8;
  const box = (x0, y0, z0, x1, y1, z1, c) => b.box(x0 * s, y0 * s, z0 * s, x1 * s, y1 * s, z1 * s, c);
  const wood = [0.62, 0.36, 0.16],
    darkWood = [0.48, 0.27, 0.12],
    gold = [1.0, 0.78, 0.2];
  b.useMaterial(0.55, 0, 0);
  box(-1.2, 0, -0.75, 1.2, 0.9, 0.75, wood); // chest body
  box(-1.24, 0.9, -0.79, 1.24, 1.35, 0.79, darkWood); // lid
  box(-1.0, 1.35, -0.6, 1.0, 1.5, 0.6, darkWood); // lid top
  b.useMaterial(0.2, 0.85, 0);
  for (const x of [-0.95, 0, 0.95]) box(x - 0.1, -0.01, -0.8, x + 0.1, 1.52, 0.8, gold); // bands
  box(-1.26, 0.82, -0.81, 1.26, 0.95, 0.81, gold); // rim
  box(-0.2, 0.55, 0.76, 0.2, 1.05, 0.86, gold); // lock
  box(-0.06, 0.66, 0.85, 0.06, 0.82, 0.9, [0.15, 0.1, 0.05]); // keyhole
  for (const [x, z, h] of [[-0.5, -0.2, 0.18], [0.1, 0.15, 0.24], [0.55, -0.15, 0.16], [-0.1, -0.35, 0.12]])
    box(x - 0.28, 1.5, z - 0.28, x + 0.28, 1.5 + h, z + 0.28, gold); // coin heap
  b.useMaterial(0.15, 0.3, 0);
  box(-0.75, 1.6, 0.1, -0.5, 1.85, 0.35, [0.3, 0.85, 0.45]); // gems
  box(0.35, 1.62, 0.2, 0.6, 1.87, 0.45, [0.9, 0.25, 0.4]);
  box(0.0, 1.72, -0.3, 0.25, 1.97, -0.05, [0.3, 0.6, 1.0]);
  return b.finish();
})();
const monsterHealthPip = (() => {
  const b = new MeshBuilder();
  b.useMaterial(0.3, 0, 0);
  b.box(-0.22, -0.22, -0.22, 0.22, 0.22, 0.22, [0.96, 0.34, 0.27]);
  return b.finish();
})();
// The ray gate is built along local +X (across the road) and placed with a yaw for its road.
const tuningRayGate = (() => {
  const b = new MeshBuilder();
  const half = ROAD_HALF_WIDTH + 1.6;
  b.useMaterial(0.3, 0.2, 0);
  b.box(-half - 0.5, 0, -0.5, -half + 0.5, 6.4, 0.5, [0.95, 0.36, 0.3]); // posts
  b.box(half - 0.5, 0, -0.5, half + 0.5, 6.4, 0.5, [0.95, 0.36, 0.3]);
  b.box(-half - 0.6, 6.2, -0.6, half + 0.6, 7.0, 0.6, [0.98, 0.8, 0.25]); // top bar
  b.box(-1.0, 7.0, -1.0, 1.0, 7.6, 1.0, [0.3, 0.3, 0.35]); // ray emitter
  b.cone(0, 7.6, 0, 1.3, 1.4, [0.2, 0.85, 0.95], 10);
  b.useMaterial(0.15, 0, 0);
  for (let i = 0; i < 7; i++) {
    // Thin glowing "beam" strands hanging from the bar, and a stripe across the road.
    const x = -half + 1.2 + (i * (half * 2 - 2.4)) / 6;
    b.box(x - 0.06, 0.4, -0.06, x + 0.06, 6.2, 0.06, [0.45, 0.95, 1.0]);
  }
  b.box(-half, 0.02, -0.7, half, 0.08, 0.7, [0.45, 0.95, 1.0]);
  return b.finish();
})();
const RING_RADIUS = 3.6,
  RING_CENTER_Y = 3.9;
const rewardRingMesh = (() => {
  // A golden hoop standing upright in the local XY plane; the car drives through along local Z.
  const b = new MeshBuilder();
  b.useMaterial(0.18, 0.75, 0);
  const n = 20,
    t = 0.38;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2,
      x = Math.cos(a) * RING_RADIUS,
      y = Math.sin(a) * RING_RADIUS + RING_CENTER_Y;
    b.box(x - t, y - t, -t, x + t, y + t, t, [1.0, 0.8, 0.2]);
  }
  return b.finish();
})();

// ---------------------------------------------------------------------------
// Tuning Ray effects. Multipliers are applied where the value is used (vehicle_update.js),
// so upgrades bought or won during an effect are kept when it ends.
// ---------------------------------------------------------------------------
const RAY_EFFECTS = {
  soapTires: { name: "SOAP TIRES!", grip: 0.12, steer: 1.1 },
  superSprings: { name: "SUPER SPRINGS!", hop: true },
  turboOverload: { name: "TURBO OVERLOAD!", topSpeed: TURBO_TOP_SPEED, accel: TURBO_ACCEL, seconds: TURBO_SECONDS },
  boingBumpers: { name: "BOING BUMPERS!", bounce: true },
};
const RAY_EFFECT_IDS = Object.keys(RAY_EFFECTS);
// Multiplier for one handling value of a vehicle ("grip" or "steer"). 1 when no effect.
function rayFx(v) {
  return v && v.rayEffect ? RAY_EFFECTS[v.rayEffect.id] || null : null;
}
function rayMul(v, key) {
  const fx = rayFx(v);
  const m = fx && fx[key] !== undefined ? fx[key] : 1;
  if (key !== "grip" || !rayBoingSliding(v)) return m;
  return m * (BOING_SLIDE_GRIP + (1 - BOING_SLIDE_GRIP) * (1 - rayBoingShare(v)));
}
function rayBoingSliding(v) {
  return !!v && v.boingUntil > eventClock;
}
// 1 right after a bounce, easing to 0 when the slide ends, so limits and grip return smoothly.
function rayBoingShare(v) {
  return rayBoingSliding(v) ? clamp((v.boingUntil - eventClock) / BOING_SLIDE_SECONDS, 0, 1) : 0;
}
// Speed limits used by vehicle_update.js for reverse and forward travel. Normally the car's own
// limits; for a moment after a Boing Bumpers bounce, high enough to let the rebound fly.
function rayReverseCap(v, topSpeed) {
  const base = topSpeed * 0.36;
  return base + Math.max(0, BOING_SPEED_CAP - base) * rayBoingShare(v);
}
function rayForwardCap(v, topSpeed) {
  return topSpeed + Math.max(0, BOING_SPEED_CAP - topSpeed) * rayBoingShare(v);
}
// Acceleration with any ray effect. Turbo Overload sets a fixed, very high value.
function rayAccel(v) {
  const fx = rayFx(v);
  return fx && fx.accel ? Math.max(v.accel, fx.accel) : v.accel;
}
// Top speed with any ray effect. After Turbo Overload it eases back to normal over
// TURBO_FADE_SECONDS, so the car slows hard but smoothly instead of stopping dead.
function rayTopSpeed(v) {
  const fx = rayFx(v);
  if (fx && fx.topSpeed) return Math.max(v.maxSpeed, fx.topSpeed);
  if (v.turboFade) {
    const k = clamp((v.turboFade.until - eventClock) / TURBO_FADE_SECONDS, 0, 1);
    if (k > 0) return v.maxSpeed + (Math.max(v.maxSpeed, v.turboFade.from) - v.maxSpeed) * k;
    v.turboFade = null;
  }
  return v.maxSpeed;
}
function applyRayEffect(v, id) {
  const fx = RAY_EFFECTS[id];
  v.rayEffect = { id, until: eventClock + (fx.seconds || RAY_EFFECT_SECONDS), nextHop: 0, nextBoing: 0 };
  v.turboFade = null;
  say(fx.name, 2400);
}
// Boing Bumpers: called by the wall and vehicle collisions in collisions.js with the
// direction pointing away from what was hit. Bounces the car off hard and adds a small hop.
function rayBounce(v, awayX, awayZ, impact) {
  const fx = rayFx(v);
  if (!fx || !fx.bounce || impact < BOING_MIN_IMPACT || eventClock < v.rayEffect.nextBoing) return;
  v.rayEffect.nextBoing = eventClock + 0.25;
  const push = BOING_BOUNCE + impact * BOING_IMPACT_SHARE;
  v.boingUntil = eventClock + BOING_SLIDE_SECONDS;
  v.vx += awayX * push;
  v.vz += awayZ * push;
  if (v.grounded !== false) {
    v.grounded = false;
    v.vy = BOING_HOP_SPEED;
    v.airTime = 0;
    v.lastRampId = null;
    v.rayHopActive = true;
  }
  v.suspensionVelocity -= 0.5;
  if (v === controlled) say("BOING!", 500);
}
function updateRayEffects(dt) {
  for (const v of vehicles) {
    if (!v.rayEffect) continue;
    if (eventClock >= v.rayEffect.until) {
      if (v.rayEffect.id === "turboOverload")
        v.turboFade = { from: TURBO_TOP_SPEED, until: eventClock + TURBO_FADE_SECONDS };
      v.rayEffect = null;
      if (v === controlled && !onFoot) say("Back to normal!", 1400);
      continue;
    }
    // Super Springs: automatic hops while driving. rayHopActive stops a hop from paying the
    // airtime bonus, and clearing lastRampId stops it counting as a stunt-ramp jump.
    if (RAY_EFFECTS[v.rayEffect.id].hop && v.grounded === false) v.rayEffect.groundSince = null;
    if (RAY_EFFECTS[v.rayEffect.id].hop && v === controlled && !onFoot && v.grounded !== false) {
      if (v.rayEffect.groundSince == null) v.rayEffect.groundSince = eventClock;
      const rested = eventClock - v.rayEffect.groundSince >= SPRING_GROUND_SECONDS;
      if (rested && Math.hypot(v.vx, v.vz) > 2.5 && eventClock >= v.rayEffect.nextHop) {
        v.grounded = false;
        v.vy = SPRING_HOP_SPEED;
        v.airTime = 0;
        v.lastRampId = null;
        v.rayHopActive = true;
        v.suspensionVelocity -= 0.6;
        v.rayEffect.nextHop = eventClock + 0.85;
        v.rayEffect.groundSince = null;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Event state and flow
// ---------------------------------------------------------------------------
let currentEvent = null; // { type, t, ... } while an event runs, otherwise null
let eventClock = 0;
let eventNextRollAt = EVENT_FIRST_ROLL;
let completedEvents = 0;

// Places the event in the world. Returns false if no site was available (treated as no event).
const eventSpawners = {
  cityAttack(ev) {
    const site = pickEventSite(eventLawnSites, false);
    if (!site) return false;
    const tier = ev.force.tier || MONSTER_TIERS[Math.floor(Math.random() * MONSTER_TIERS.length)];
    ev.tier = tier;
    ev.monster = {
      type: "monster",
      model: tier.model,
      x: site.x,
      z: site.z,
      y: driveSurfaceH(site.x, site.z),
      vx: 0,
      vz: 0,
      yaw: Math.random() * Math.PI * 2,
      roll: 0,
      mass: 10,
      radius: tier.radius,
      height: 4.2 * tier.scale, // vehicles in the air only clear it above this height
      kickScale: 2.5, // exaggeratedly light: a 5 mph bump shoves even the large one about 3.5 units
      hp: tier.hp,
      maxHp: tier.hp,
      smashCash: 0, // the event pays instead of the ordinary prop reward
      broken: false,
    };
    props.push(ev.monster);
    ev.x = site.x;
    ev.z = site.z;
    return true;
  },
  treasure(ev) {
    const site = pickEventSite(eventLawnSites, false);
    if (!site) return false;
    ev.chest = {
      type: "treasure",
      model: treasureChestMesh,
      x: site.x,
      z: site.z,
      y: driveSurfaceH(site.x, site.z),
      vx: 0,
      vz: 0,
      yaw: Math.random() * Math.PI * 2,
      roll: 0,
      mass: 20,
      radius: 2.3,
      height: 3.4,
      kickScale: 1.5,
      hp: 0.5, // one-hit: any real ram (about 7 mph or more) breaks it
      maxHp: 0.5,
      smashCash: 0, // the event pays instead of the ordinary prop reward
      broken: false,
    };
    props.push(ev.chest);
    ev.x = site.x;
    ev.z = site.z;
    return true;
  },
  rival(ev) {
    // A traffic car on the road, not already knocked, in the usual distance band.
    const p = onFoot ? player : controlled;
    if (!p) return false;
    const onRoad = trafficFleet.filter((v) => !v.aiKnockTime && !trafficOffStreet(v));
    const pick = pickEventSite(onRoad.map((v) => ({ x: v.x, z: v.z, v })), false);
    if (!pick) return false;
    ev.rival = pick.v;
    ev.rival.isRival = true;
    ev.hits = 0;
    ev.hitCooldown = 0;
    ev.x = ev.rival.x;
    ev.z = ev.rival.z;
    return true;
  },
  tuningRay(ev) {
    const spot = pickEventSite(eventRoadSpots, true);
    if (!spot) return false;
    Object.assign(ev, { x: spot.x, z: spot.z, axis: spot.axis });
    return true;
  },
  rewardRing(ev) {
    const spot = pickEventSite(eventRoadSpots, true);
    if (!spot) return false;
    Object.assign(ev, { x: spot.x, z: spot.z, axis: spot.axis });
    return true;
  },
};

// Gate crossing for the ray and the ring: true on the frame the controlled vehicle passes the
// gate line inside its width. Uses the previous frame's side, so fast cars cannot skip it.
function eventGateCrossed(ev, halfWidth) {
  if (onFoot || !controlled) {
    ev.prevSide = undefined;
    return false;
  }
  const v = controlled;
  const along = ev.axis === "z" ? v.z - ev.z : v.x - ev.x;
  const across = ev.axis === "z" ? v.x - ev.x : v.z - ev.z;
  const side = Math.sign(along);
  const crossed =
    ev.prevSide !== undefined && side !== 0 && side !== ev.prevSide && Math.abs(along) < 6 &&
    Math.abs(across) <= halfWidth;
  if (side !== 0) ev.prevSide = side;
  return crossed;
}

const eventUpdaters = {
  cityAttack(ev) {
    if (!ev.monster.broken) {
      ev.x = ev.monster.x;
      ev.z = ev.monster.z;
      return null;
    }
    awardCash(ev.tier.payout);
    spawnConfetti(ev.monster.x, ev.monster.z, 60);
    say("MONSTER SMASHED!  +$" + ev.tier.payout, 2800);
    return "done";
  },
  treasure(ev) {
    if (!ev.chest.broken) {
      ev.x = ev.chest.x;
      ev.z = ev.chest.z;
      return null;
    }
    awardCash(TREASURE_PAYOUT);
    spawnConfetti(ev.chest.x, ev.chest.z, 90);
    say("TREASURE!  +$" + TREASURE_PAYOUT, 3200);
    return "done";
  },
  rival(ev) {
    ev.x = ev.rival.x;
    ev.z = ev.rival.z;
    if (ev.hits < RIVAL_HITS) return null;
    awardCash(RIVAL_PAYOUT);
    spawnConfetti(ev.rival.x, ev.rival.z, 60);
    say("RIVAL WRECKED!  +$" + RIVAL_PAYOUT, 2800);
    return "done";
  },
  tuningRay(ev) {
    if (!eventGateCrossed(ev, ROAD_HALF_WIDTH + 1.6)) return null;
    applyRayEffect(
      controlled,
      ev.force.effect || RAY_EFFECT_IDS[Math.floor(Math.random() * RAY_EFFECT_IDS.length)],
    );
    spawnConfetti(controlled.x, controlled.z, 24);
    return "done";
  },
  rewardRing(ev) {
    if (!eventGateCrossed(ev, RING_RADIUS - 0.4)) return null;
    const tiers = ["speed", "acceleration", "impact"];
    const tier = tiers[Math.floor(Math.random() * tiers.length)];
    applyUpgrade(controlled, tier);
    const text = {
      speed: "TOP SPEED +5 MPH",
      acceleration: "ACCELERATION +15%",
      impact: "IMPACT POWER +20%",
    }[tier];
    spawnConfetti(controlled.x, controlled.z, 50);
    say("REWARD RING!  " + text, 2800);
    ev.reward = tier;
    return "done";
  },
};

// Removes what an event placed, without any message. Used for timeouts and after success.
function cleanupEvent(ev) {
  for (const p of [ev.monster, ev.chest]) {
    if (!p || p.broken) continue;
    const i = props.indexOf(p);
    if (i >= 0) props.splice(i, 1);
  }
  if (ev.rival) ev.rival.isRival = false; // back to ordinary traffic
}
// Rival hits (T-047): called from resolveVehiclePair() in collisions.js for every vehicle contact.
function eventVehicleHit(a, b, impact) {
  const ev = currentEvent;
  if (!ev || ev.type !== "rival" || onFoot || !controlled) return;
  const other = a === ev.rival ? b : b === ev.rival ? a : null;
  if (other !== controlled || impact < RIVAL_MIN_IMPACT || eventClock < ev.hitCooldown) return;
  ev.hitCooldown = eventClock + 0.5;
  ev.hits++;
  if (ev.hits < RIVAL_HITS) say("RIVAL HIT!  " + ev.hits + " / " + RIVAL_HITS, 900);
}

function startEvent(typeId, force) {
  if (currentEvent || !eventTypes[typeId]) return false;
  const ev = { type: typeId, t: 0, force: force || {} };
  if (!eventSpawners[typeId](ev)) return false;
  currentEvent = ev;
  showEventComms(eventTypes[typeId]);
  return true;
}
function endEvent() {
  const ev = currentEvent;
  if (!ev) return;
  currentEvent = null;
  cleanupEvent(ev);
  eventNextRollAt = eventClock + EVENT_ROLL_INTERVAL;
}
// Draw weights (T-039): every option starts at 1. Each draw halves the drawn option's weight,
// and once every option (including "no event") has been drawn, all weights reset to 1.
// This keeps the options equal overall while making a long run without one option unlikely.
let eventPoolWeights = EVENT_POOL.map(() => 1);
let eventPoolDrawn = EVENT_POOL.map(() => false);
function drawFromEventPool() {
  const total = eventPoolWeights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total,
    i = 0;
  while (i < EVENT_POOL.length - 1 && r >= eventPoolWeights[i]) r -= eventPoolWeights[i++];
  eventPoolWeights[i] *= 0.5;
  eventPoolDrawn[i] = true;
  if (eventPoolDrawn.every(Boolean)) {
    eventPoolWeights = EVENT_POOL.map(() => 1);
    eventPoolDrawn = EVENT_POOL.map(() => false);
  }
  return EVENT_POOL[i];
}
function rollEvent() {
  eventNextRollAt = eventClock + EVENT_ROLL_INTERVAL;
  const pick = drawFromEventPool();
  if (pick) startEvent(pick);
  return pick;
}

// Test switch (T-039), for playtests only: add ?event=cityAttack, ?event=tuningRay or
// ?event=rewardRing to the page address to start that event as soon as play begins.
// Optional extras: &tier=small|medium|large (creature) and
// &effect=soapTires|superSprings|turboOverload|boingBumpers (ray). Normal play is unchanged.
let eventTestSwitchChecked = false;
function applyEventTestSwitch(search) {
  const q = new URLSearchParams(search || "");
  const id = q.get("event");
  if (!id || !eventTypes[id]) return false;
  const tier = MONSTER_TIERS.find((t) => t.id === q.get("tier"));
  const effect = RAY_EFFECTS[q.get("effect")] ? q.get("effect") : null;
  if (currentEvent) endEvent();
  return startEvent(id, { tier, effect });
}
function updateEvents(dt) {
  eventClock += dt;
  if (!eventTestSwitchChecked) {
    eventTestSwitchChecked = true;
    applyEventTestSwitch(typeof location !== "undefined" ? location.search : "");
  }
  updateRayEffects(dt);
  updateEventComms();
  if (!currentEvent) {
    if (eventClock >= eventNextRollAt) rollEvent();
    return;
  }
  const ev = currentEvent;
  ev.t += dt;
  if (eventUpdaters[ev.type](ev) === "done") {
    completedEvents++;
    endEvent();
  } else if (ev.t >= eventTypes[ev.type].duration) endEvent(); // timer: vanish quietly
}

// ---------------------------------------------------------------------------
// Comms slide-out (markup and style in index.html)
// ---------------------------------------------------------------------------
const commsEl = $("comms"),
  commsTitleEl = $("commsTitle"),
  commsLineEl = $("commsLine");
let commsHideAt = 0;
function showEventComms(type) {
  commsTitleEl.textContent = type.name;
  commsLineEl.textContent = type.line;
  commsEl.classList.add("show");
  commsEl.setAttribute("aria-hidden", "false");
  commsHideAt = eventClock + EVENT_COMMS_SECONDS;
}
function updateEventComms() {
  if (commsHideAt && eventClock >= commsHideAt) {
    commsHideAt = 0;
    commsEl.classList.remove("show");
    commsEl.setAttribute("aria-hidden", "true");
  }
}

// ---------------------------------------------------------------------------
// Markers for the minimap (hud.js) and the world (camera_render.js)
// ---------------------------------------------------------------------------
function eventMarkers() {
  if (!currentEvent) return [];
  const type = eventTypes[currentEvent.type];
  return [
    { kind: "event", x: currentEvent.x, z: currentEvent.z, pin: true, shape: type.mapShape, color: type.mapColor },
  ];
}
function drawEvents(vp) {
  const ev = currentEvent;
  if (!ev) return;
  const cam = [camera.x, camera.y, camera.z];
  const t = performance.now() / 1000;
  const ground = driveSurfaceH(ev.x, ev.z);
  if (ev.type === "cityAttack") {
    // The creature itself is a prop (drawn with the props). Add a beacon and health pips.
    const m = ev.monster;
    draw(eventBeacons.cityAttack, modelMatrix(m.x, m.y + m.height + 1.2, m.z, 0), vp, cam);
    const pips = Math.max(1, Math.ceil((m.hp / m.maxHp) * 5));
    for (let i = 0; i < pips; i++)
      draw(
        monsterHealthPip,
        modelMatrix(
          m.x + (i - (pips - 1) / 2) * 0.62 * ev.tier.scale,
          m.y + m.height + 0.6 * ev.tier.scale + Math.sin(t * 3 + i) * 0.08 * ev.tier.scale,
          m.z,
          t,
          ev.tier.scale,
        ),
        vp,
        cam,
      );
    return;
  }
  if (ev.type === "treasure") {
    const c = ev.chest;
    draw(eventBeacons.treasure, modelMatrix(c.x, c.y + c.height + 1.5, c.z, 0, 1 + Math.sin(t * 5) * 0.12), vp, cam);
    return;
  }
  if (ev.type === "rival") {
    const r = ev.rival;
    const top = (Number.isFinite(r.y) ? r.y : driveSurfaceH(r.x, r.z)) + 3.2;
    draw(eventBeacons.rival, modelMatrix(r.x, top + 1.5, r.z, 0, 0.8), vp, cam);
    for (let i = 0; i < RIVAL_HITS - ev.hits; i++)
      draw(monsterHealthPip, modelMatrix(r.x + (i - (RIVAL_HITS - ev.hits - 1) / 2) * 0.7, top + Math.sin(t * 3 + i) * 0.08, r.z, t, 1.3), vp, cam);
    return;
  }
  const yaw = ev.axis === "z" ? 0 : Math.PI / 2; // local Z points along the road
  if (ev.type === "tuningRay") {
    draw(tuningRayGate, modelMatrix(ev.x, ground, ev.z, yaw), vp, cam);
    draw(eventBeacons.tuningRay, modelMatrix(ev.x, ground + 9, ev.z, 0, 1 + Math.sin(t * 6) * 0.15), vp, cam);
  } else if (ev.type === "rewardRing") {
    draw(rewardRingMesh, modelMatrix(ev.x, ground + Math.sin(t * 2) * 0.2, ev.z, yaw), vp, cam);
    draw(eventBeacons.rewardRing, modelMatrix(ev.x, ground + RING_CENTER_Y + RING_RADIUS + 1, ev.z, 0), vp, cam);
  }
}

// ---------------------------------------------------------------------------
// Data check used by tools/smoke_test.js. Returns a list of problems (empty means OK).
// ---------------------------------------------------------------------------
function validateEventData() {
  const problems = [];
  if (eventLawnSites.length < 12) problems.push("only " + eventLawnSites.length + " lawn sites for City Under Attack");
  if (eventRoadSpots.length < 60) problems.push("only " + eventRoadSpots.length + " road spots for the ray and ring");
  for (const s of eventLawnSites)
    for (const b of buildingColliders)
      if (Math.abs(s.x - b.x) < b.hw + MONSTER_TIERS[2].radius && Math.abs(s.z - b.z) < b.hl + MONSTER_TIERS[2].radius)
        problems.push("lawn site " + s.x + "," + s.z + " touches a " + (b.kind || "building"));
  for (const s of eventRoadSpots) {
    const across = s.axis === "z" ? s.x : s.z;
    if (!streetLines.includes(across)) problems.push("road spot " + s.x + "," + s.z + " is not on a street");
    if (roadSurfaceAt(s.x, s.z) === null) problems.push("road spot " + s.x + "," + s.z + " has no road under it");
  }
  for (const id of EVENT_POOL) if (id && !eventTypes[id]) problems.push("pool has unknown event " + id);
  if (!EVENT_POOL.includes(null)) problems.push("pool is missing the no-event option");
  for (const id in eventTypes) if (!EVENT_POOL.includes(id)) problems.push(id + " is not in the pool");
  return problems;
}
