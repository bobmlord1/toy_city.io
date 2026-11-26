"use strict";
// =============================================================================
// src/activities.js
// Optional activities on an "activity board": every activity has a start pad in the world and
// on the minimap. Driving onto a pad starts that activity. Nothing starts on its own, only one
// activity runs at a time, SKIP stops it, and each run pays once.
// Types: "delivery" (pickup -> drop-off), "smash" (break marked props), "stunt" (jump a marked ramp).
// Design rules (DESIGN.md): never forced, no timers, no fail states, no penalties, pays once.
// =============================================================================

const ACTIVITY_ZONE_RADIUS = 4.5; // how close the vehicle must get to a pad
const ACTIVITY_RESTART_DELAY = 2.6; // seconds after a finish or skip before a pad can start again
const ACTIVITY_PAYOUT_MIN = 75; // tuning range from DESIGN.md (approximately $75-$150)
const ACTIVITY_PAYOUT_MAX = 150;
const ACTIVITY_DRAW_DISTANCE = 320; // start pads farther than this from the camera are not drawn
const STUNT_MIN_AIR_SECONDS = 0.49; // any committed run-up passes (stock top speed gives 0.5-0.7 s); slow rolls get about 0.47 s
// World marker colors (glossy toy paint) and matching minimap colors (approved HUD palette).
const ACTIVITY_COLORS = {
  pickup: [1.0, 0.62, 0.12],
  dropoff: [0.16, 0.86, 0.46],
  smash: [0.96, 0.34, 0.27],
  smashTarget: [0.96, 0.34, 0.27],
  stunt: [0.2, 0.7, 0.98],
  stuntGoal: [0.2, 0.7, 0.98],
};
const ACTIVITY_MAP_COLORS = {
  pickup: "#F4CF59",
  dropoff: "#8BC99B",
  smash: "#F28F73",
  smashTarget: "#F28F73",
  stunt: "#72D2DC",
  stuntGoal: "#72D2DC",
};

// ---------------------------------------------------------------------------
// Hand-authored, fixed locations. Every zone must be open ground; validateActivityDefs() checks it.
// Delivery: { pickup:{x,z}, dropoff:{x,z,label}, payout }. The pickup is the start pad.
// Smash:    { start:{x,z}, targets:[{type,dx,dz}], payout }. Targets spawn when the activity starts.
// Stunt:    { start:{x,z}, rampId, payout }. Jump off that ramp and stay up STUNT_MIN_AIR_SECONDS.
// ---------------------------------------------------------------------------
// Longer deliveries pay more: $75 plus 25 cents per world unit, capped at $150.
function deliveryPayout(pickup, dropoff) {
  const d = Math.hypot(dropoff.x - pickup.x, dropoff.z - pickup.z);
  return Math.round(Math.min(ACTIVITY_PAYOUT_MAX, ACTIVITY_PAYOUT_MIN + d * 0.25) / 5) * 5;
}
function delivery(id, pickup, dropoff) {
  return { id, type: "delivery", pickup, dropoff, payout: deliveryPayout(pickup, dropoff) };
}
// Four targets in a shallow arc just past the pad, so driving off the pad heads into them.
const SMASH_TARGET_LAYOUT = [
  { type: "barrel", dx: -8, dz: 6 },
  { type: "barrel", dx: -3, dz: 9 },
  { type: "crate", dx: 3, dz: 9 },
  { type: "barrel", dx: 8, dz: 6 },
];
const activityDefs = [
  // Central district (the original five).
  delivery("yard-to-yellow-house", { x: -34, z: 14 }, { x: -20, z: 27, label: "the Yellow House" }),
  delivery("south-to-blue-house", { x: 5, z: -20 }, { x: 26, z: -3, label: "the Blue House" }),
  delivery("park-to-purple-house", { x: 39, z: -12 }, { x: 78, z: 0, label: "the Purple House" }),
  delivery("west-to-yellow-house", { x: -75, z: -2 }, { x: -20, z: 27, label: "the Yellow House" }),
  delivery("east-to-orange-house", { x: 28, z: -27 }, { x: -75, z: -17, label: "the Orange House" }),
  // Outer districts (T-019).
  delivery("southwest-to-green-house", { x: -189, z: -220 }, { x: -98, z: -146, label: "the Green House" }),
  delivery("southeast-to-green-house", { x: 220, z: -189 }, { x: 122, z: -125, label: "the Green House" }),
  delivery("northwest-to-blue-house", { x: -220, z: 189 }, { x: -107, z: 112, label: "the Blue House" }),
  delivery("northeast-to-yellow-tower", { x: 189, z: 220 }, { x: 315, z: 319, label: "the Yellow Tower" }),
  delivery("west-to-green-tower", { x: -299, z: 0 }, { x: -197, z: -115, label: "the Green Tower" }),
  delivery("east-to-purple-house", { x: 299, z: 0 }, { x: 205, z: 73, label: "the Purple House" }),
  delivery("south-to-pink-house", { x: 31, z: -330 }, { x: 111, z: -219, label: "the Pink House" }),
  delivery("north-to-sky-blue-house", { x: 0, z: 299 }, { x: -93, z: 210, label: "the Sky Blue House" }),
  delivery("far-northwest-to-sky-blue-house", { x: -330, z: 299 }, { x: -221, z: 221, label: "the Sky Blue House" }),
  delivery("far-southeast-to-peach-house", { x: 330, z: -299 }, { x: 200, z: -226, label: "the Peach House" }),
  delivery("cross-town-to-pink-house", { x: 110, z: 79 }, { x: -202, z: -2, label: "the Pink House" }),
  delivery("far-southwest-to-yellow-tower", { x: -299, z: -330 }, { x: 4, z: -233, label: "the Yellow Tower" }),
  // Smash targets (T-018).
  { id: "smash-northwest", type: "smash", payout: 100, start: { x: -110, z: 79 }, targets: SMASH_TARGET_LAYOUT },
  { id: "smash-southeast", type: "smash", payout: 100, start: { x: 110, z: -141 }, targets: SMASH_TARGET_LAYOUT },
  { id: "smash-west", type: "smash", payout: 100, start: { x: -220, z: -31 }, targets: SMASH_TARGET_LAYOUT },
  { id: "smash-northeast", type: "smash", payout: 100, start: { x: 220, z: 141 }, targets: SMASH_TARGET_LAYOUT },
  // Stunt jumps (T-018). Each pad sits on the run-up to its ramp.
  { id: "stunt-west", type: "stunt", payout: 110, start: { x: -78, z: -142 }, rampId: "west-stunt" },
  { id: "stunt-east", type: "stunt", payout: 120, start: { x: 78, z: -46 }, rampId: "east-stunt" },
  { id: "stunt-north", type: "stunt", payout: 110, start: { x: -74, z: 110 }, rampId: "north-stunt" },
];

// ---------------------------------------------------------------------------
// Marker meshes (built once). Culling is off, so winding only matters for lighting normals.
// ---------------------------------------------------------------------------
function buildOctahedron(b, r, color) {
  const top = [0, r * 1.25, 0],
    bottom = [0, -r * 1.25, 0];
  const ring = [
    [r, 0, 0],
    [0, 0, r],
    [-r, 0, 0],
    [0, 0, -r],
  ];
  for (let i = 0; i < 4; i++) {
    const a = ring[i],
      c = ring[(i + 1) % 4];
    for (const apex of [top, bottom]) {
      const cx = (a[0] + c[0] + apex[0]) / 3,
        cy = (a[1] + c[1] + apex[1]) / 3,
        cz = (a[2] + c[2] + apex[2]) / 3;
      const n = normalize([cx, cy, cz]);
      b.tri(a, c, apex, color, n, n, n);
    }
  }
}
// A small toy ramp: a wedge rising toward +Z.
function buildWedge(b, color) {
  const w = 0.7,
    l = 0.8,
    h = 0.75;
  const A = [-w, -0.4, -l],
    B = [w, -0.4, -l],
    C = [w, -0.4, l],
    D = [-w, -0.4, l],
    E = [w, -0.4 + h, l],
    F = [-w, -0.4 + h, l];
  b.quad(A, B, E, F, color);
  b.quad(D, C, E, F, color);
  b.tri(A, D, F, color);
  b.tri(B, C, E, color);
  b.quad(A, B, C, D, color);
}
function buildMarkerMeshes(kind) {
  const color = ACTIVITY_COLORS[kind];
  const dark = [color[0] * 0.45, color[1] * 0.45, color[2] * 0.45];
  const pad = new MeshBuilder();
  pad.useMaterial(0.2, 0, 0);
  pad.cylinderY(0, 0, 0, ACTIVITY_ZONE_RADIUS, 0.1, color, 28);
  pad.cylinderY(0, 0, 0, ACTIVITY_ZONE_RADIUS - 0.9, 0.12, dark, 28);
  const column = new MeshBuilder();
  column.useMaterial(0.2, 0, 0);
  column.cylinderY(0, 0, 0, 0.26, 26, color, 10);
  const icon = new MeshBuilder();
  icon.useMaterial(0.25, 0, 0);
  if (kind === "pickup") {
    // A toy parcel: cardboard box with a red ribbon.
    icon.box(-0.55, -0.55, -0.55, 0.55, 0.55, 0.55, [0.93, 0.72, 0.35]);
    icon.box(-0.12, -0.56, -0.56, 0.12, 0.56, 0.56, [0.9, 0.2, 0.25]);
    icon.box(-0.56, -0.56, -0.12, 0.56, 0.56, 0.12, [0.9, 0.2, 0.25]);
  } else if (kind === "smash") {
    // A tumbling stack of toy blocks.
    icon.box(-0.7, -0.6, -0.4, 0.05, 0.15, 0.35, [0.96, 0.34, 0.27]);
    icon.box(0.05, -0.6, -0.35, 0.7, 0.05, 0.3, [1.0, 0.82, 0.25]);
    icon.box(-0.3, 0.15, -0.3, 0.3, 0.75, 0.3, [0.93, 0.72, 0.35]);
  } else if (kind === "stunt") {
    buildWedge(icon, color);
  } else {
    buildOctahedron(icon, 0.75, color);
  }
  return { pad: pad.finish(), column: column.finish(), icon: icon.finish() };
}
const activityMeshes = {};
for (const kind of ["pickup", "dropoff", "smash", "stunt", "stuntGoal"])
  activityMeshes[kind] = buildMarkerMeshes(kind);
// Smash targets get a small floating arrow instead of a full pad and column.
const smashTargetArrow = (() => {
  const b = new MeshBuilder();
  b.useMaterial(0.25, 0, 0);
  b.cone(0, 0, 0, 0.42, -0.75, ACTIVITY_COLORS.smashTarget, 4);
  b.cylinderY(0, 0, 0, 0.42, 0.12, ACTIVITY_COLORS.smashTarget, 4);
  return b.finish();
})();
const confettiModels = [
  [1.0, 0.35, 0.4],
  [1.0, 0.82, 0.25],
  [0.3, 0.8, 1.0],
  [0.45, 0.95, 0.5],
].map((color) => {
  const b = new MeshBuilder();
  b.useMaterial(0.25, 0, 0);
  b.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, color);
  return b.finish();
});
const carriedPackageHeight = { compact: 2.1, pickup: 2.6, semi: 4.6 };

// ---------------------------------------------------------------------------
// Activity types. Each type supplies:
//   startKind, icon, label     how its start pad looks on the board
//   start(def)                 the start pad position
//   begin(act)                 set up when the player drives onto the pad
//   markers(act)               objective markers while running ({kind,x,z,pin})
//   hud(act)                   { icon, text } for the objective panel
//   update(act)                returns "complete" when the reward is due
//   finish(act)                { x, z, text } for the celebration
//   cleanup(act)               undo setup when skipped (optional)
// ---------------------------------------------------------------------------
const activityTypes = {
  delivery: {
    startKind: "pickup",
    icon: "📦",
    label: "Delivery",
    start: (def) => def.pickup,
    begin(act) {
      act.phase = "carrying";
      spawnConfetti(act.def.pickup.x, act.def.pickup.z, 14);
      say("PACKAGE LOADED!  Deliver to " + act.def.dropoff.label, 2200);
    },
    markers: (act) => [{ kind: "dropoff", x: act.def.dropoff.x, z: act.def.dropoff.z, pin: true }],
    hud: (act) => ({ icon: "🏠", text: "Deliver to " + act.def.dropoff.label }),
    update(act) {
      if (onFoot || !controlled) return null;
      const z = act.def.dropoff;
      return Math.hypot(controlled.x - z.x, controlled.z - z.z) <= ACTIVITY_ZONE_RADIUS
        ? "complete"
        : null;
    },
    finish: (act) => ({ x: act.def.dropoff.x, z: act.def.dropoff.z, text: "DELIVERED!" }),
  },

  smash: {
    startKind: "smash",
    icon: "💥",
    label: "Smash",
    start: (def) => def.start,
    begin(act) {
      act.phase = "smashing";
      act.targets = [];
      for (const t of act.def.targets) {
        const p = addProp(t.type, act.def.start.x + t.dx, act.def.start.z + t.dz);
        if (p) act.targets.push(p);
      }
      act.lastBroken = { x: act.def.start.x, z: act.def.start.z };
      spawnConfetti(act.def.start.x, act.def.start.z, 14);
      say("SMASH THE MARKED BOXES!", 2000);
    },
    markers: (act) => {
      const out = [];
      for (const p of act.targets)
        if (!p.broken) out.push({ kind: "smashTarget", x: p.x, z: p.z, pin: out.length === 0 });
      return out;
    },
    hud: (act) => {
      const done = act.targets.filter((p) => p.broken).length;
      return { icon: "💥", text: "Smash " + done + " / " + act.targets.length };
    },
    update(act) {
      const left = act.targets.filter((p) => !p.broken).length;
      for (const p of act.targets)
        if (p.broken && !p._activityCounted) {
          // Remember where the last one broke so the celebration happens there.
          p._activityCounted = true;
          act.lastBroken = { x: p.x, z: p.z };
          if (left > 0) say("SMASH!", 600);
        }
      return left === 0 ? "complete" : null;
    },
    finish: (act) => ({ x: act.lastBroken.x, z: act.lastBroken.z, text: "ALL SMASHED!" }),
    cleanup(act) {
      // Remove the targets that were not broken, so a skipped activity leaves the world tidy.
      for (const p of act.targets) {
        const i = props.indexOf(p);
        if (!p.broken && i >= 0) props.splice(i, 1);
      }
    },
  },

  stunt: {
    startKind: "stunt",
    icon: "🚀",
    label: "Stunt jump",
    start: (def) => def.start,
    begin(act) {
      act.phase = "jumping";
      act.air = 0;
      act.airborne = false;
      act.ramp = allRamps.find((r) => r.id === act.def.rampId);
      spawnConfetti(act.def.start.x, act.def.start.z, 14);
      say("JUMP THE RAMP!", 2000);
    },
    markers: (act) => [
      {
        kind: "stuntGoal",
        x: act.ramp.x,
        z: (act.ramp.crestZ + act.ramp.flatEndZ) / 2,
        pin: true,
      },
    ],
    hud: (act) => ({ icon: "🚀", text: "Jump the ramp" }),
    update(act) {
      if (onFoot || !controlled) {
        act.airborne = false;
        return null;
      }
      const v = controlled;
      if (v.grounded === false && v.lastRampId === act.def.rampId) {
        act.airborne = true;
        act.air = Math.max(act.air, v.airTime || 0);
        return null;
      }
      if (!act.airborne) return null;
      // Just landed after a jump from the marked ramp.
      act.airborne = false;
      if (act.air >= STUNT_MIN_AIR_SECONDS) return "complete";
      act.air = 0;
      say("So close! Go a little faster!", 1600);
      return null;
    },
    finish: (act) =>
      controlled
        ? { x: controlled.x, z: controlled.z, text: "AWESOME JUMP!" }
        : { x: act.ramp.x, z: act.ramp.endZ, text: "AWESOME JUMP!" },
  },
};

// ---------------------------------------------------------------------------
// Activity state and flow
// ---------------------------------------------------------------------------
let currentActivity = null; // { def, phase, t, ... } while an activity runs, otherwise null
let activityClock = 0;
let activityReadyAt = 0; // pads are inactive until this time (short pause after finish/skip)
let activityPadsInside = null; // ids of pads the vehicle is on; a pad starts only on entry
let completedActivities = 0;

// ---------------------------------------------------------------------------
// The board (T-038): only three pads are active at a time, one of each type, picked at random
// and spread apart. Finishing or skipping an activity draws a new three, leaving out the one
// just played. Every def stays in activityDefs; the board only chooses which ones are live.
// ---------------------------------------------------------------------------
const ACTIVITY_BOARD_SPACING = 150; // preferred minimum distance between the three pads
let activityBoard = []; // ids of the active defs
function activityBoardDefs() {
  return activityDefs.filter((d) => activityBoard.includes(d.id));
}
function drawActivityBoard(excludeId) {
  const byType = {};
  for (const def of activityDefs)
    if (def.id !== excludeId) (byType[def.type] = byType[def.type] || []).push(def);
  // Types in random order; each pad is random among those far enough from the pads already
  // picked (or the farthest one if none is). This keeps every pad in play, central ones too.
  const types = Object.keys(byType).sort(() => Math.random() - 0.5);
  const picked = [];
  const gap = (def) =>
    Math.min(
      Infinity,
      ...picked.map((q) => {
        const a = activityStart(def),
          b = activityStart(q);
        return Math.hypot(a.x - b.x, a.z - b.z);
      }),
    );
  for (const t of types) {
    const options = byType[t];
    const spread = options.filter((d) => gap(d) >= ACTIVITY_BOARD_SPACING);
    picked.push(
      spread.length
        ? spread[Math.floor(Math.random() * spread.length)]
        : options.reduce((a, b) => (gap(b) > gap(a) ? b : a)),
    );
  }
  activityBoard = picked.map((d) => d.id);
  lastActivityHud = ""; // the idle hint may now point at a different pad
}

function activityStart(def) {
  return activityTypes[def.type].start(def);
}
function startActivity(def) {
  if (currentActivity) return false;
  currentActivity = { def, phase: "start", t: 0 };
  activityTypes[def.type].begin(currentActivity);
  return true;
}
function completeActivity() {
  const act = currentActivity;
  if (!act) return;
  currentActivity = null; // cleared first, so a payout can never happen twice
  awardCash(act.def.payout);
  completedActivities++;
  const f = activityTypes[act.def.type].finish(act);
  spawnConfetti(f.x, f.z, 44);
  say(f.text + "  +$" + act.def.payout, 2600);
  activityReadyAt = activityClock + ACTIVITY_RESTART_DELAY;
  drawActivityBoard(act.def.id);
}
function skipActivity() {
  const act = currentActivity;
  if (!act) return;
  currentActivity = null;
  const type = activityTypes[act.def.type];
  if (type.cleanup) type.cleanup(act);
  say("No problem! Pick another marker.", 1500);
  activityReadyAt = activityClock + 0.4;
  drawActivityBoard(act.def.id);
}
function updateActivities(dt) {
  activityClock += dt;
  // Track which pads the vehicle is on. A pad only starts when the vehicle drives onto it,
  // so finishing on top of another pad (or spawning on one) never starts it by accident.
  const inside = new Set();
  if (!onFoot && controlled)
    for (const def of activityBoardDefs()) {
      const s = activityStart(def);
      if (Math.hypot(controlled.x - s.x, controlled.z - s.z) <= ACTIVITY_ZONE_RADIUS)
        inside.add(def.id);
    }
  const entered = activityPadsInside
    ? activityDefs.find((d) => inside.has(d.id) && !activityPadsInside.has(d.id))
    : null;
  activityPadsInside = inside;

  if (currentActivity) {
    currentActivity.t += dt;
    const type = activityTypes[currentActivity.def.type];
    if (type.update(currentActivity) === "complete") completeActivity();
    return;
  }
  if (entered && activityClock >= activityReadyAt) startActivity(entered);
}

function spawnConfetti(x, z, count) {
  const y0 = driveSurfaceH(x, z) + 1.2;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2,
      s = 2 + Math.random() * 5;
    debris.push({
      model: confettiModels[i % confettiModels.length],
      x: x + Math.cos(a) * 0.6,
      y: y0,
      z: z + Math.sin(a) * 0.6,
      vx: Math.cos(a) * s,
      vy: 5 + Math.random() * 5,
      vz: Math.sin(a) * s,
      yaw: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 12,
      scale: 0.14 + Math.random() * 0.14,
      life: 1.8 + Math.random() * 1.2,
    });
  }
}

// ---------------------------------------------------------------------------
// Markers for the world and the minimap
// ---------------------------------------------------------------------------
// While an activity runs: its objective markers. Otherwise: every start pad, with the nearest
// pad of each type pinned to the minimap edge so there is always a direction to head in.
function activeMarkers() {
  if (currentActivity) return activityTypes[currentActivity.def.type].markers(currentActivity);
  const p = onFoot ? player : controlled;
  const out = [];
  const nearest = {};
  for (const def of activityBoardDefs()) {
    const type = activityTypes[def.type],
      s = type.start(def);
    const m = { kind: type.startKind, x: s.x, z: s.z, pin: false, start: true };
    out.push(m);
    if (p) {
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (!nearest[def.type] || d < nearest[def.type].d) nearest[def.type] = { d, m };
    }
  }
  for (const k in nearest) nearest[k].m.pin = true;
  return out;
}
function drawActivityMarkers(vp) {
  const cam = [camera.x, camera.y, camera.z];
  const t = performance.now() / 1000;
  for (const m of activeMarkers()) {
    if (m.kind === "smashTarget") {
      const ground = driveSurfaceH(m.x, m.z);
      draw(
        smashTargetArrow,
        modelMatrix(m.x, ground + 2.6 + Math.sin(t * 3) * 0.25, m.z, t * 2, 1.4),
        vp,
        cam,
      );
      continue;
    }
    if (m.start && Math.hypot(m.x - camera.x, m.z - camera.z) > ACTIVITY_DRAW_DISTANCE) continue;
    const meshes = activityMeshes[m.kind];
    const bob = Math.sin(t * 2.2) * 0.45;
    if (m.kind === "stuntGoal") {
      // The stunt goal is a big spinning gem hanging over the ramp deck.
      const deck = driveSurfaceH(m.x, m.z);
      draw(meshes.icon, modelMatrix(m.x, deck + 4.6 + bob, m.z, t * 1.4, 2.4), vp, cam);
      continue;
    }
    const base = driveSurfaceH(m.x, m.z) + 0.08;
    const pulse = 1 + Math.sin(t * 3) * 0.04;
    draw(meshes.pad, modelMatrix(m.x, base, m.z, 0, pulse), vp, cam);
    draw(meshes.column, modelMatrix(m.x, base, m.z, 0), vp, cam);
    draw(meshes.icon, modelMatrix(m.x, base + 5.2 + bob, m.z, t * 1.4, 1.7), vp, cam);
  }
  // The parcel rides on top of the vehicle while a delivery is in progress.
  if (currentActivity && currentActivity.phase === "carrying" && !onFoot && controlled) {
    const y = Number.isFinite(controlled.y)
      ? controlled.y
      : driveSurfaceH(controlled.x, controlled.z) + 0.04;
    const lift = carriedPackageHeight[controlled.type] || 2.4;
    draw(
      activityMeshes.pickup.icon,
      modelMatrix(controlled.x, y + lift, controlled.z, controlled.yaw, 0.75),
      vp,
      cam,
    );
  }
}

const activityEl = $("activity"),
  activityIconEl = $("activityIcon"),
  activityTextEl = $("activityText"),
  activitySkipEl = $("activitySkip");
let lastActivityHud = "";
function updateActivityHud() {
  const p = onFoot ? player : controlled;
  let icon, text, target;
  if (currentActivity) {
    const type = activityTypes[currentActivity.def.type];
    ({ icon, text } = type.hud(currentActivity));
    target = type.markers(currentActivity)[0];
  } else {
    // No activity running: point at the nearest start pad.
    let best = null,
      bestD = Infinity;
    for (const def of activityBoardDefs()) {
      const s = activityStart(def),
        d = p ? Math.hypot(p.x - s.x, p.z - s.z) : 0;
      if (d < bestD) {
        bestD = d;
        best = def;
      }
    }
    if (best) {
      const type = activityTypes[best.type];
      icon = type.icon;
      text = type.label;
      target = activityStart(best);
    }
  }
  let shown = "";
  if (icon) {
    const dist = target && p ? Math.round(Math.hypot(p.x - target.x, p.z - target.z) / 5) * 5 : 0;
    shown =
      (currentActivity ? "1" : "0") +
      "|" +
      icon +
      "|" +
      text +
      (dist > 0 ? "  ·  " + dist + " m" : "");
  }
  if (shown === lastActivityHud) return;
  lastActivityHud = shown;
  if (!shown) {
    activityEl.classList.remove("show");
    return;
  }
  const [running, i, t] = shown.split("|");
  activityIconEl.textContent = i;
  activityTextEl.textContent = t;
  // SKIP only means something while an activity runs. Keep its space so the panel does not jump.
  activitySkipEl.style.visibility = running === "1" ? "visible" : "hidden";
  activityEl.classList.add("show");
}
activitySkipEl.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  skipActivity();
});

// ---------------------------------------------------------------------------
// Data check used by tools/smoke_test.js. Returns a list of problems (empty means OK).
// ---------------------------------------------------------------------------
function activityZoneProblems(name, z) {
  const problems = [];
  if (Math.abs(z.x) > WORLD_HALF - 20 || Math.abs(z.z) > WORLD_HALF - 20)
    problems.push(name + ": too close to the world edge");
  for (const b of buildingColliders) {
    const dx = Math.max(Math.abs(z.x - b.x) - b.hw, 0),
      dz = Math.max(Math.abs(z.z - b.z) - b.hl, 0);
    if (Math.hypot(dx, dz) < ACTIVITY_ZONE_RADIUS)
      problems.push(name + ": overlaps a " + (b.kind || "building") + " at " + b.x + "," + b.z);
  }
  for (const r of allRamps) {
    const dx = Math.max(Math.abs(z.x - r.x) - r.halfWidth, 0),
      dz = Math.max(r.startZ - z.z, z.z - r.endZ, 0);
    if (Math.hypot(dx, dz) < ACTIVITY_ZONE_RADIUS) problems.push(name + ": overlaps ramp " + r.id);
  }
  return problems;
}
function validateActivityDefs() {
  const problems = [];
  const ids = new Set();
  const starts = [];
  for (const def of activityDefs) {
    if (ids.has(def.id)) problems.push("duplicate activity id " + def.id);
    ids.add(def.id);
    const type = activityTypes[def.type];
    if (!type) {
      problems.push(def.id + ": unknown type " + def.type);
      continue;
    }
    if (!(def.payout >= ACTIVITY_PAYOUT_MIN && def.payout <= ACTIVITY_PAYOUT_MAX))
      problems.push(def.id + ": payout " + def.payout + " outside the DESIGN.md range");
    const s = type.start(def);
    problems.push(...activityZoneProblems(def.id + " start", s));
    starts.push([def.id, s]);
    if (def.type === "delivery")
      problems.push(...activityZoneProblems(def.id + " dropoff", def.dropoff));
    if (def.type === "smash") {
      if (!def.targets || def.targets.length < 1) problems.push(def.id + ": no targets");
      for (const t of def.targets || []) {
        const x = s.x + t.dx,
          z = s.z + t.dz;
        if (t.type !== "barrel" && t.type !== "crate")
          problems.push(def.id + ": unknown target type " + t.type);
        if (!propSpotAllowed(x, z)) problems.push(def.id + ": target at " + x + "," + z + " is on a street or ramp");
        for (const b of buildingColliders)
          if (Math.abs(x - b.x) < b.hw + 1.2 && Math.abs(z - b.z) < b.hl + 1.2)
            problems.push(def.id + ": target at " + x + "," + z + " touches a " + (b.kind || "building"));
        if (Math.hypot(t.dx, t.dz) < ACTIVITY_ZONE_RADIUS + 1)
          problems.push(def.id + ": target too close to its own start pad");
      }
    }
    if (def.type === "stunt") {
      const r = stuntRamps.find((q) => q.id === def.rampId);
      if (!r) problems.push(def.id + ": unknown stunt ramp " + def.rampId);
      else if (Math.abs(s.x - r.x) > r.halfWidth || Math.min(Math.abs(s.z - r.startZ), Math.abs(s.z - r.endZ)) > 22)
        problems.push(def.id + ": start pad is not on the run-up to " + r.id);
    }
  }
  // A drop-off must not sit on another activity's start pad, or finishing one would leave the
  // car parked on the next and the two markers would overlap.
  for (const def of activityDefs)
    if (def.type === "delivery")
      for (const [id, s] of starts)
        if (id !== def.id && Math.hypot(s.x - def.dropoff.x, s.z - def.dropoff.z) < ACTIVITY_ZONE_RADIUS * 2 + 2)
          problems.push(def.id + " dropoff overlaps the start pad of " + id);
  // Start pads must not touch each other, so driving onto one never lands on two.
  for (let i = 0; i < starts.length; i++)
    for (let j = i + 1; j < starts.length; j++) {
      const a = starts[i][1],
        b = starts[j][1];
      if (Math.hypot(a.x - b.x, a.z - b.z) < ACTIVITY_ZONE_RADIUS * 2 + 2)
        problems.push(starts[i][0] + " and " + starts[j][0] + ": start pads overlap");
    }
  return problems;
}

// First board of the session.
drawActivityBoard(null);
