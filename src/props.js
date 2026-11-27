"use strict";
// =============================================================================
// src/props.js
// Smashable props (crates, barrels, etc.) scattered around the city.
// addProp(type,x,z) skips streets and ramps automatically.
// =============================================================================

const props = [];
// True when a prop may be placed here: off the street corridors and clear of ramps.
function propSpotAllowed(x, z) {
  return !(
    isNearAnyRamp(x, z, 0.8) ||
    streetLines.some(
      (s) => Math.abs(x - s) < SIDEWALK_OUTER + 1.0 || Math.abs(z - s) < SIDEWALK_OUTER + 1.0,
    )
  );
}
// Returns the new prop, or null when the spot is not allowed (activities keep the reference).
function addProp(type, x, z) {
  if (!propSpotAllowed(x, z)) return null;
  const prop = {
    type,
    x,
    z,
    y: driveSurfaceH(x, z),
    vx: 0,
    vz: 0,
    yaw: (x * z) % 1,
    roll: 0,
    mass: type === "barrel" ? 16 : 34,
    radius: type === "barrel" ? 0.48 : 0.72,
    // A normal-speed clean ram should break a barrel in roughly two hits and a crate in three.
    hp: type === "barrel" ? 5.0 : 9.5,
    broken: false,
  };
  props.push(prop);
  return prop;
}
for (let i = 0; i < 9; i++)
  addProp(i % 2 ? "crate" : "barrel", -27 + (i % 3) * 2.0, 9 + Math.floor(i / 3) * 3.0);
for (let i = 0; i < 8; i++)
  addProp(i % 3 ? "barrel" : "crate", -4 + (i % 4) * 1.8, 32 + Math.floor(i / 4) * 2.1);
for (let i = 0; i < 8; i++)
  addProp(i % 2 ? "crate" : "barrel", 22 + (i % 4) * 1.8, 34 + Math.floor(i / 4) * 2.2);
// Some loose road cones are just chunky movable props.
for (let i = 0; i < 5; i++) addProp("barrel", -5 + i * 2.4, -13.5);
// T-048: a small group of crates and barrels in every block outside the center.
// [x, z, count]: props stand in rows of three, 2.0 apart, rows 2.2 apart. Generated once and
// checked against streets, ramps, buildings, rocks, activity pads, smash and drop-off spots, and
// the City Under Attack spawn spots; tools/smoke_test.js re-checks them.
const PROP_GROUPS = [
  [-298, -298, 5],
  [-362, -188, 4],
  [-298, -142, 3],
  [-330, -32, 2],
  [-330, 142, 5],
  [-298, 220, 4],
  [-298, 330, 3],
  [-246, -348, 2],
  [-194, -202, 5],
  [-252, -142, 4],
  [-188, 32, 3],
  [-252, 142, 2],
  [-188, 188, 5],
  [-220, 362, 4],
  [-110, -298, 3],
  [-142, -220, 2],
  [-136, -128, 5],
  [-78, 32, 4],
  [-84, 128, 3],
  [-78, 252, 2],
  [-78, 362, 5],
  [32, -362, 4],
  [32, -252, 3],
  [0, -142, 2],
  [0, 142, 5],
  [-32, 220, 4],
  [32, 330, 3],
  [78, -362, 2],
  [136, -202, 5],
  [78, -142, 4],
  [142, 32, 3],
  [78, 142, 2],
  [142, 188, 5],
  [110, 298, 4],
  [220, -298, 3],
  [194, -238, 2],
  [194, -128, 5],
  [246, 18, 4],
  [246, 128, 3],
  [188, 188, 2],
  [252, 362, 5],
  [298, -298, 4],
  [362, -252, 3],
  [330, -142, 2],
  [330, 32, 5],
  [298, 110, 4],
  [362, 220, 3],
  [356, 348, 2],
];
for (const [x, z, n] of PROP_GROUPS)
  for (let i = 0; i < n; i++)
    addProp(i % 2 ? "crate" : "barrel", x + (i % 3) * 2.0, z + Math.floor(i / 3) * 2.2);
