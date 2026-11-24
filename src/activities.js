"use strict";
// =============================================================================
// src/activities.js
// Optional activities: one offer at a time, a beacon + minimap marker, and a one-time cash payout.
// v1 ships one activity TYPE ("delivery"). Smash targets and stunt jump plug in later by adding an
// entry to activityTypes and some entries to activityDefs (see ARCHITECTURE.md, "Activities").
// Design rules (DESIGN.md): never forced, no timers, no fail states, no penalties, pays once.
// =============================================================================

const ACTIVITY_ZONE_RADIUS = 4.5; // how close the vehicle must get to a pickup or drop-off
const ACTIVITY_OFFER_DELAY = 2.6; // seconds before the next offer appears after a completion
const ACTIVITY_PAYOUT_MIN = 75; // tuning range from DESIGN.md (approximately $75-$150)
const ACTIVITY_PAYOUT_MAX = 150;
const ACTIVITY_COLORS = {
  pickup: [1.0, 0.62, 0.12],
  dropoff: [0.16, 0.86, 0.46],
};

// Hand-authored, fixed locations. Every zone must be open ground; validateActivityDefs() checks it.
// Delivery: { pickup: {x, z}, dropoff: {x, z, label}, payout }.
const activityDefs = [
  {
    id: "yard-to-yellow-house",
    type: "delivery",
    payout: 75,
    pickup: { x: -34, z: 14 },
    dropoff: { x: -20, z: 27, label: "the Yellow House" },
  },
  {
    id: "south-to-blue-house",
    type: "delivery",
    payout: 85,
    pickup: { x: 5, z: -20 },
    dropoff: { x: 26, z: -3, label: "the Blue House" },
  },
  {
    id: "park-to-purple-house",
    type: "delivery",
    payout: 90,
    pickup: { x: 39, z: -12 },
    dropoff: { x: 78, z: 0, label: "the Purple House" },
  },
  {
    id: "west-to-yellow-house",
    type: "delivery",
    payout: 95,
    pickup: { x: -75, z: -12 },
    dropoff: { x: -20, z: 27, label: "the Yellow House" },
  },
  {
    id: "east-to-orange-house",
    type: "delivery",
    payout: 120,
    pickup: { x: 28, z: -27 },
    dropoff: { x: -75, z: -17, label: "the Orange House" },
  },
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
  } else {
    buildOctahedron(icon, 0.75, color);
  }
  return { pad: pad.finish(), column: column.finish(), icon: icon.finish() };
}
const activityMeshes = {
  pickup: buildMarkerMeshes("pickup"),
  dropoff: buildMarkerMeshes("dropoff"),
};
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
// Activity types. Each type supplies: markers(act), update(act), hud(act).
// update() returns "complete" when the reward should be paid. It mutates act.phase for stages.
// ---------------------------------------------------------------------------
const activityTypes = {
  delivery: {
    markers(act) {
      return act.phase === "offer"
        ? [{ kind: "pickup", x: act.def.pickup.x, z: act.def.pickup.z }]
        : [{ kind: "dropoff", x: act.def.dropoff.x, z: act.def.dropoff.z }];
    },
    hud(act) {
      return act.phase === "offer"
        ? { icon: "📦", text: "Drive to the package" }
        : { icon: "🏠", text: "Deliver to " + act.def.dropoff.label };
    },
    update(act) {
      if (onFoot || !controlled) return null;
      const zone = act.phase === "offer" ? act.def.pickup : act.def.dropoff;
      if (Math.hypot(controlled.x - zone.x, controlled.z - zone.z) > ACTIVITY_ZONE_RADIUS)
        return null;
      if (act.phase === "offer") {
        act.phase = "carrying";
        spawnConfetti(zone.x, zone.z, 14);
        say("PACKAGE LOADED!  Deliver to " + act.def.dropoff.label, 2200);
        return null;
      }
      return "complete";
    },
  },
};

// ---------------------------------------------------------------------------
// Activity state and flow
// ---------------------------------------------------------------------------
let currentActivity = null; // { def, phase, t } or null while waiting for the next offer
let activityCursor = -1;
let activityClock = 0;
let activityNextOfferAt = 0;
let completedActivities = 0;

function offerNextActivity() {
  activityCursor = (activityCursor + 1) % activityDefs.length;
  currentActivity = { def: activityDefs[activityCursor], phase: "offer", t: 0 };
}
function completeActivity() {
  const act = currentActivity;
  if (!act) return;
  currentActivity = null; // cleared first, so a payout can never happen twice
  awardCash(act.def.payout);
  completedActivities++;
  const z = act.def.dropoff;
  spawnConfetti(z.x, z.z, 44);
  say("DELIVERED!  +$" + act.def.payout, 2600);
  activityNextOfferAt = activityClock + ACTIVITY_OFFER_DELAY;
}
function skipActivity() {
  if (!currentActivity) return;
  currentActivity = null;
  say("No problem! Here is another one.", 1500);
  activityNextOfferAt = activityClock + 0.4;
}
function updateActivities(dt) {
  activityClock += dt;
  if (!currentActivity) {
    if (activityClock >= activityNextOfferAt) offerNextActivity();
    return;
  }
  currentActivity.t += dt;
  const type = activityTypes[currentActivity.def.type];
  if (type && type.update(currentActivity) === "complete") completeActivity();
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
// Rendering hooks (called from drawWorld, drawMap and updateUI)
// ---------------------------------------------------------------------------
function activeMarkers() {
  if (!currentActivity) return [];
  const type = activityTypes[currentActivity.def.type];
  return type ? type.markers(currentActivity) : [];
}
function drawActivityMarkers(vp) {
  const cam = [camera.x, camera.y, camera.z];
  const t = performance.now() / 1000;
  for (const m of activeMarkers()) {
    const meshes = activityMeshes[m.kind];
    const base = driveSurfaceH(m.x, m.z) + 0.08;
    const pulse = 1 + Math.sin(t * 3) * 0.04;
    draw(meshes.pad, modelMatrix(m.x, base, m.z, 0, pulse), vp, cam);
    draw(meshes.column, modelMatrix(m.x, base, m.z, 0), vp, cam);
    draw(
      meshes.icon,
      modelMatrix(m.x, base + 5.2 + Math.sin(t * 2.2) * 0.45, m.z, t * 1.4, 1.7),
      vp,
      cam,
    );
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
function drawActivityMapMarkers(ctx, px, py) {
  const t = performance.now() / 1000;
  for (const m of activeMarkers()) {
    const c = ACTIVITY_COLORS[m.kind];
    const css = `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
    const r = 8 + Math.sin(t * 4) * 1.8;
    ctx.beginPath();
    ctx.arc(px(m.x), py(m.z), r, 0, Math.PI * 2);
    ctx.fillStyle = css;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px(m.x), py(m.z), 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }
}

const activityEl = $("activity"),
  activityIconEl = $("activityIcon"),
  activityTextEl = $("activityText");
let lastActivityHud = "";
function updateActivityHud() {
  let shown = "";
  if (currentActivity) {
    const type = activityTypes[currentActivity.def.type];
    const info = type.hud(currentActivity);
    const target = type.markers(currentActivity)[0];
    const p = onFoot ? player : controlled;
    const dist = target && p ? Math.round(Math.hypot(p.x - target.x, p.z - target.z) / 5) * 5 : 0;
    shown = info.icon + "|" + info.text + (dist > 0 ? "  \u00b7  " + dist + " m" : "");
  }
  if (shown === lastActivityHud) return;
  lastActivityHud = shown;
  if (!shown) {
    activityEl.classList.remove("show");
    return;
  }
  const [icon, text] = shown.split("|");
  activityIconEl.textContent = icon;
  activityTextEl.textContent = text;
  activityEl.classList.add("show");
}
$("activitySkip").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  skipActivity();
});

// ---------------------------------------------------------------------------
// Data check used by tools/smoke_test.js. Returns a list of problems (empty means OK).
// ---------------------------------------------------------------------------
function validateActivityDefs() {
  const problems = [];
  const ids = new Set();
  const zones = [];
  for (const def of activityDefs) {
    if (ids.has(def.id)) problems.push("duplicate activity id " + def.id);
    ids.add(def.id);
    if (!activityTypes[def.type]) problems.push(def.id + ": unknown type " + def.type);
    if (def.payout < ACTIVITY_PAYOUT_MIN || def.payout > ACTIVITY_PAYOUT_MAX)
      problems.push(def.id + ": payout " + def.payout + " outside the DESIGN.md range");
    if (def.type === "delivery") {
      zones.push([def.id + " pickup", def.pickup], [def.id + " dropoff", def.dropoff]);
    }
  }
  for (const [name, z] of zones) {
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
      if (Math.hypot(dx, dz) < ACTIVITY_ZONE_RADIUS)
        problems.push(name + ": overlaps ramp " + r.id);
    }
  }
  return problems;
}
