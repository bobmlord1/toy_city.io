"use strict";
// =============================================================================
// src/world_config.js
// World size, street dimensions, ramp definitions, ground/road height queries.
// Change world constants here. driveSurfaceH(x,z) is the single source of truth for ground height.
// =============================================================================

// The city uses a flat baseplate beneath its buildings, ramps and modular street kit.
const MPH_PER_MS = 2.2369362920544;
const MPH_TO_MS = 1 / MPH_PER_MS;
// The tuning feature is a molded tabletop ramp on a deliberately flat terrain pad.
// Its surface is separate from terrainH(), so the surrounding landscape stays level.
const upgradeRamp = {
  id: "upgrade",
  x: 32,
  halfWidth: 5.2,
  startZ: 20,
  crestZ: 26,
  flatEndZ: 40,
  endZ: 46,
  rise: 1.25,
  flatY: 0,
};
// Extra stunt ramps are toy props with matching drive-surface profiles. Keep their
// footprints clear of buildings and trees when adding new scenery.
const stuntRamps = [
  {
    id: "west-stunt",
    x: -78,
    halfWidth: 4.6,
    startZ: -126,
    crestZ: -120,
    flatEndZ: -114,
    endZ: -108,
    rise: 1.85,
    color: [0.98, 0.36, 0.12],
  },
  {
    id: "east-stunt",
    x: 78,
    halfWidth: 4.8,
    startZ: -32,
    crestZ: -26,
    flatEndZ: -20,
    endZ: -14,
    rise: 2.15,
    color: [0.13, 0.72, 0.77],
  },
  {
    id: "north-stunt",
    x: -74,
    halfWidth: 4.5,
    startZ: 76,
    crestZ: 82,
    flatEndZ: 88,
    endZ: 94,
    rise: 1.75,
    color: [0.75, 0.36, 0.92],
  },
];
const allRamps = [upgradeRamp, ...stuntRamps];
// City-wide coordinate grid and shared street-kit dimensions.
const WORLD_HALF = 440,
  WORLD_SIZE = 880;
const streetLines = [];
for (let n = -3.5; n <= 3.5001; n += 1) streetLines.push(n * 110);
const ROAD_WIDTH = 14,
  ROAD_HALF_WIDTH = ROAD_WIDTH / 2;
const SIDEWALK_WIDTH = 5.5,
  SIDEWALK_OUTER = ROAD_HALF_WIDTH + SIDEWALK_WIDTH;
const ROAD_CHUNK_LENGTH = 22,
  ROAD_TOP_Y = 0.25;
const ROAD_COLLISION_CELL = 22,
  ROAD_COLLISION_CELLS = Math.ceil(WORLD_SIZE / ROAD_COLLISION_CELL);
const roadCollisionBuckets = new Map();
function registerStreetCollider(x, z, widthX, widthZ, topY) {
  const c = {
    minX: x - widthX / 2,
    maxX: x + widthX / 2,
    minZ: z - widthZ / 2,
    maxZ: z + widthZ / 2,
    topY,
  };
  const loX = clamp(
    Math.floor((c.minX + WORLD_HALF) / ROAD_COLLISION_CELL),
    0,
    ROAD_COLLISION_CELLS - 1,
  );
  const hiX = clamp(
    Math.floor((c.maxX + WORLD_HALF) / ROAD_COLLISION_CELL),
    0,
    ROAD_COLLISION_CELLS - 1,
  );
  const loZ = clamp(
    Math.floor((c.minZ + WORLD_HALF) / ROAD_COLLISION_CELL),
    0,
    ROAD_COLLISION_CELLS - 1,
  );
  const hiZ = clamp(
    Math.floor((c.maxZ + WORLD_HALF) / ROAD_COLLISION_CELL),
    0,
    ROAD_COLLISION_CELLS - 1,
  );
  for (let ix = loX; ix <= hiX; ix++)
    for (let iz = loZ; iz <= hiZ; iz++) {
      const key = ix * ROAD_COLLISION_CELLS + iz;
      let bucket = roadCollisionBuckets.get(key);
      if (!bucket) {
        bucket = [];
        roadCollisionBuckets.set(key, bucket);
      }
      bucket.push(c);
    }
}
// Current city build: one perfectly level baseplate. Hills are deferred until
// the street kit is stable and can be reintroduced as a separate world layer.
function baseTerrainH() {
  return 0;
}
upgradeRamp.flatY = 0;
function terrainH() {
  return 0;
}
function profileForRamp(r, x, z) {
  if (Math.abs(x - r.x) > r.halfWidth || z <= r.startZ || z >= r.endZ) return 0;
  if (z < r.crestZ) return (r.rise * (z - r.startZ)) / (r.crestZ - r.startZ);
  if (z < r.flatEndZ) return r.rise;
  return (r.rise * (r.endZ - z)) / (r.endZ - r.flatEndZ);
}
function rampProfile(x, z) {
  let h = 0;
  for (const r of allRamps) h = Math.max(h, profileForRamp(r, x, z));
  return h;
}
// Street support collision is generated from the exact same boxes as the render mesh.
function roadSurfaceAt(x, z) {
  if (x < -WORLD_HALF || x > WORLD_HALF || z < -WORLD_HALF || z > WORLD_HALF) return null;
  const ix = clamp(
    Math.floor((x + WORLD_HALF) / ROAD_COLLISION_CELL),
    0,
    ROAD_COLLISION_CELLS - 1,
  );
  const iz = clamp(
    Math.floor((z + WORLD_HALF) / ROAD_COLLISION_CELL),
    0,
    ROAD_COLLISION_CELLS - 1,
  );
  const bucket = roadCollisionBuckets.get(ix * ROAD_COLLISION_CELLS + iz);
  if (!bucket) return null;
  let top = -Infinity;
  for (const c of bucket)
    if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.topY > top) top = c.topY;
  return Number.isFinite(top) ? top : null;
}
function driveSurfaceH(x, z) {
  const ramp = rampProfile(x, z),
    rampTop = terrainH(x, z) + (ramp > 0 ? ramp + 0.08 : 0);
  const streetTop = roadSurfaceAt(x, z);
  return streetTop === null ? rampTop : Math.max(rampTop, streetTop);
}
function isOnUpgradeRamp(x, z) {
  return (
    Math.abs(x - upgradeRamp.x) <= upgradeRamp.halfWidth &&
    z >= upgradeRamp.startZ &&
    z <= upgradeRamp.endZ
  );
}
function isNearAnyRamp(x, z, margin = 1.5) {
  return allRamps.some(
    (r) =>
      Math.abs(x - r.x) < r.halfWidth + margin && z > r.startZ - margin && z < r.endZ + margin,
  );
}
function terrainNormal() {
  return [0, 1, 0];
}
