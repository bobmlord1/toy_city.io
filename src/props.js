"use strict";
// =============================================================================
// src/props.js
// Smashable props (crates, barrels, etc.) scattered around the city.
// addProp(type,x,z) skips streets and ramps automatically.
// =============================================================================

const props = [];
function addProp(type, x, z) {
  if (
    isNearAnyRamp(x, z, 0.8) ||
    streetLines.some(
      (s) => Math.abs(x - s) < SIDEWALK_OUTER + 1.0 || Math.abs(z - s) < SIDEWALK_OUTER + 1.0,
    )
  )
    return;
  props.push({
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
  });
}
for (let i = 0; i < 9; i++)
  addProp(i % 2 ? "crate" : "barrel", -27 + (i % 3) * 2.0, 9 + Math.floor(i / 3) * 3.0);
for (let i = 0; i < 8; i++)
  addProp(i % 3 ? "barrel" : "crate", -4 + (i % 4) * 1.8, 32 + Math.floor(i / 4) * 2.1);
for (let i = 0; i < 8; i++)
  addProp(i % 2 ? "crate" : "barrel", 22 + (i % 4) * 1.8, 34 + Math.floor(i / 4) * 2.2);
// Some loose road cones are just chunky movable props.
for (let i = 0; i < 5; i++) addProp("barrel", -5 + i * 2.4, -13.5);
