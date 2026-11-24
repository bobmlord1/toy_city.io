"use strict";
// =============================================================================
// src/world_city.js
// Yard, ramp meshes, buildings, trees/rocks, lamps; finishes worldMesh.
// Static scenery. Everything here is built once at startup into worldB.
// =============================================================================

// A compact yard apron, with painted parking lines.
worldB.useMaterial(0.91, 0, 3); // worn concrete
worldB.box(
  -29,
  terrainH(-29, 15) + 0.12,
  5,
  -5,
  terrainH(-29, 15) + 0.22,
  27,
  [0.34, 0.36, 0.34],
);
for (let x = -24; x < -7; x += 5) {
  const y = terrainH(x, 15) + 0.25;
  worldB.box(x - 0.08, y, 7, x + 0.08, y + 0.01, 24, [0.82, 0.82, 0.72]);
}
// A toy-blue tabletop ramp: shallow up-slope, flat upgrade deck, shallow down-slope.
// The terrain underneath remains flat; driveSurfaceH() supplies the matching contact profile.
worldB.useMaterial(0.22, 0.025, 0);
{
  const r = upgradeRamp,
    left = r.x - r.halfWidth,
    right = r.x + r.halfWidth;
  const sections = [
    [r.startZ, r.crestZ],
    [r.crestZ, r.flatEndZ],
    [r.flatEndZ, r.endZ],
  ];
  for (const [z0, z1] of sections) {
    const p0 = rampProfile(r.x, z0 + 0.001),
      p1 = rampProfile(r.x, z1 - 0.001);
    const slope = (p1 - p0) / (z1 - z0),
      normal = normalize([0, 1, -slope]);
    const y0 = terrainH(r.x, z0) + rampProfile(r.x, z0) + 0.08;
    const y1 = terrainH(r.x, z1) + rampProfile(r.x, z1) + 0.08;
    // Top surface and thick blue side cheeks make the ramp read as a separate toy prop.
    worldB.quad(
      [left, y0, z0],
      [left, y1, z1],
      [right, y1, z1],
      [right, y0, z0],
      [0.12, 0.43, 0.7],
      normal,
    );
    const bottom0 = terrainH(r.x, z0) + 0.015,
      bottom1 = terrainH(r.x, z1) + 0.015;
    worldB.quad(
      [left, bottom0, z0],
      [left, bottom1, z1],
      [left, y1, z1],
      [left, y0, z0],
      [0.075, 0.27, 0.48],
      [-1, 0, 0],
    );
    worldB.quad(
      [right, bottom0, z0],
      [right, y0, z0],
      [right, y1, z1],
      [right, bottom1, z1],
      [0.075, 0.27, 0.48],
      [1, 0, 0],
    );
  }
  // Bright yellow edge blocks remain a clear visual guide to the upgrade platform.
  worldB.useMaterial(0.18, 0, 0);
  for (const side of [-1, 1]) {
    for (let z = r.startZ + 1.2; z < r.endZ - 0.4; z += 2.8) {
      const x = r.x + side * (r.halfWidth - 0.18),
        y = terrainH(x, z) + rampProfile(x, z) + 0.09;
      worldB.box(x - 0.14, y, z - 0.34, x + 0.14, y + 0.16, z + 0.34, [0.99, 0.73, 0.12]);
    }
  }
  // The gold tuning pad is centered on the flat middle section, not on either slope.
  const px0 = r.x - upgradePad.halfWidth,
    px1 = r.x + upgradePad.halfWidth,
    pz0 = upgradePad.z0,
    pz1 = upgradePad.z1;
  const py = (x, z) => terrainH(x, z) + rampProfile(x, z) + upgradePad.deckLift;
  worldB.quad(
    [px0, py(px0, pz0), pz0],
    [px0, py(px0, pz1), pz1],
    [px1, py(px1, pz1), pz1],
    [px1, py(px1, pz0), pz0],
    [0.98, 0.75, 0.16],
    [0, 1, 0],
  );
  worldB.useMaterial(0.15, 0, 0);
  for (let z = 32.0; z < 36.8; z += 1.25) {
    const y = terrainH(r.x, z) + rampProfile(r.x, z) + upgradePad.stripeLift;
    worldB.box(r.x - 3.25, y, z - 0.1, r.x + 3.25, y + upgradePad.stripeHeight, z + 0.1, [1.0, 0.94, 0.58]);
  }
}
// Three smaller stunt ramps use contrasting glossy plastic colors. Their ramps sit
// directly on the terrain and their contact heights come from the same profile above.
for (const r of stuntRamps) {
  const left = r.x - r.halfWidth,
    right = r.x + r.halfWidth;
  const sections = [
    [r.startZ, r.crestZ],
    [r.crestZ, r.flatEndZ],
    [r.flatEndZ, r.endZ],
  ];
  worldB.useMaterial(0.2, 0.015, 0);
  for (const [z0, z1] of sections) {
    const y0 = terrainH(r.x, z0) + profileForRamp(r, r.x, z0 + 0.001) + 0.075;
    const y1 = terrainH(r.x, z1) + profileForRamp(r, r.x, z1 - 0.001) + 0.075;
    const slope = (y1 - y0) / (z1 - z0),
      normal = normalize([0, 1, -slope]);
    worldB.quad(
      [left, y0, z0],
      [left, y1, z1],
      [right, y1, z1],
      [right, y0, z0],
      r.color,
      normal,
    );
    const b0 = terrainH(r.x, z0) + 0.015,
      b1 = terrainH(r.x, z1) + 0.015;
    worldB.quad(
      [left, b0, z0],
      [left, b1, z1],
      [left, y1, z1],
      [left, y0, z0],
      [0.12, 0.19, 0.27],
      [-1, 0, 0],
    );
    worldB.quad(
      [right, b0, z0],
      [right, y0, z0],
      [right, y1, z1],
      [right, b1, z1],
      [0.12, 0.19, 0.27],
      [1, 0, 0],
    );
  }
  worldB.useMaterial(0.17, 0, 0);
  for (const side of [-1, 1])
    for (let z = r.startZ + 1; z < r.endZ - 0.3; z += 2.8) {
      const x = r.x + side * (r.halfWidth - 0.16),
        y = driveSurfaceH(x, z) + 0.085;
      worldB.box(x - 0.13, y, z - 0.3, x + 0.13, y + 0.15, z + 0.3, [0.99, 0.77, 0.16]);
    }
}

const buildingColliders = [];
const staticShadowCasters = [];
function addBuilding(x, z, w, d, h, color, roof = [0.27, 0.3, 0.31], kind = "house") {
  if (
    streetLines.some(
      (line) =>
        Math.abs(x - line) < w / 2 + SIDEWALK_OUTER + 1.0 ||
        Math.abs(z - line) < d / 2 + SIDEWALK_OUTER + 1.0,
    )
  )
    return; // never place a building in a street or sidewalk corridor
  if (isNearAnyRamp(x, z, Math.max(w, d) * 0.5 + 1.5)) return; // keep landmark and procedural buildings clear of ramp runouts
  const newHW = w / 2 + 0.62,
    newHL = d / 2 + 0.62;
  if (
    buildingColliders.some(
      (b) =>
        b.kind === "building" &&
        Math.abs(x - b.x) < newHW + b.hw + 2.2 &&
        Math.abs(z - b.z) < newHL + b.hl + 2.2,
    )
  )
    return; // avoid overlapping building footprints
  const base = terrainH(x, z),
    buriedBase = base - 28,
    wallH = Math.max(8.5, h * 1.52),
    wallTop = base + wallH;
  // IMPORTANT: extend the building mass 28 world units below the local ground.
  // Terrain height varies across each footprint; a deep foundation prevents visible hovering.
  // Square walls and a separate, slightly raised roof cap keep the top perfectly flat.
  worldB.useMaterial(0.34, 0.015, 3);
  worldB.box(x - w / 2, buriedBase, z - d / 2, x + w / 2, wallTop, z + d / 2, color);
  worldB.useMaterial(0.23, 0.02, 4);
  worldB.box(
    x - w / 2 - 0.58,
    wallTop + 0.055,
    z - d / 2 - 0.58,
    x + w / 2 + 0.58,
    wallTop + 0.62,
    z + d / 2 + 0.58,
    roof,
  );
  // Four molded roof studs make the buildings read like oversized construction toys.
  worldB.useMaterial(0.19, 0, 6);
  const studColor = [
    Math.min(1, roof[0] * 1.18 + 0.08),
    Math.min(1, roof[1] * 1.18 + 0.08),
    Math.min(1, roof[2] * 1.18 + 0.08),
  ];
  for (const sx of [-w * 0.34, w * 0.34])
    for (const sz of [-d * 0.34, d * 0.34])
      worldB.cylinderY(x + sx, wallTop + 0.62, z + sz, 0.19, 0.13, studColor, 12);
  // Repeated glossy window blocks make the taller buildings feel deliberately designed.
  worldB.useMaterial(0.17, 0.015, 6);
  const front = z + d / 2 + 0.045;
  const rows = [];
  for (let level = 2.0; level < wallH - 1.35; level += 3.05) rows.push(level);
  const columns = w > 13 ? 4 : 2;
  for (const level of rows) {
    for (let c = 0; c < columns; c++) {
      const wx = x + (c - (columns - 1) / 2) * (w / (columns + 0.7));
      const ww = Math.min(1.25, w / (columns + 1.4));
      worldB.box(
        wx - ww / 2,
        base + level,
        front,
        wx + ww / 2,
        base + level + 1.05,
        front + 0.075,
        [0.13, 0.56, 0.76],
      );
    }
  }
  // A chunky contrasting entrance sits at ground level.
  worldB.useMaterial(0.24, 0.01, 6);
  worldB.box(
    x - 0.52,
    base,
    z + d / 2 + 0.045,
    x + 0.52,
    base + 2.1,
    z + d / 2 + 0.13,
    [0.96, 0.68, 0.24],
  );
  buildingColliders.push({
    id: "building-" + buildingColliders.length,
    x,
    z,
    hw: w / 2 + 0.62,
    hl: d / 2 + 0.62,
    yaw: 0,
    bottomY: buriedBase,
    topY: wallTop + 0.62,
    kind: "building",
  });
  staticShadowCasters.push({
    x,
    z,
    hw: w / 2,
    hl: d / 2,
    yaw: 0,
    height: wallH + 0.65,
    alpha: 0.32,
  });
}
addBuilding(-34, 31, 18, 19, 7, [0.96, 0.53, 0.22], [0.18, 0.33, 0.62], "warehouse");
addBuilding(-20, 37, 9, 9, 4.2, [0.98, 0.79, 0.27], [0.74, 0.25, 0.13]);
addBuilding(26, 7, 9, 8, 4.8, [0.18, 0.7, 0.86], [0.08, 0.3, 0.76]);
addBuilding(39, -2, 8, 9, 4.5, [0.94, 0.39, 0.54], [0.52, 0.12, 0.25]);
addBuilding(28, -37, 11, 10, 5, [0.43, 0.78, 0.38], [0.18, 0.43, 0.17]);
addBuilding(78, 13, 12, 11, 5.5, [0.72, 0.55, 0.94], [0.28, 0.18, 0.58]);
addBuilding(-75, -28, 12, 10, 4.7, [0.97, 0.61, 0.32], [0.68, 0.24, 0.12]);
// Expanded 4x4 city districts. The original central district remains intact; the
// surrounding 15 chunks receive deterministic clusters of buildings with varied
// footprints and heights. Buildings sit in street blocks, never on the road grid.
{
  const palette = [
    [
      [0.96, 0.53, 0.22],
      [0.18, 0.33, 0.62],
    ],
    [
      [0.18, 0.7, 0.86],
      [0.08, 0.3, 0.76],
    ],
    [
      [0.94, 0.39, 0.54],
      [0.52, 0.12, 0.25],
    ],
    [
      [0.43, 0.78, 0.38],
      [0.18, 0.43, 0.17],
    ],
    [
      [0.72, 0.55, 0.94],
      [0.28, 0.18, 0.58],
    ],
    [
      [0.97, 0.75, 0.32],
      [0.64, 0.25, 0.12],
    ],
    [
      [0.4, 0.68, 0.82],
      [0.16, 0.3, 0.48],
    ],
    [
      [0.92, 0.62, 0.36],
      [0.55, 0.24, 0.12],
    ],
  ];
  let seed = 73421;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let bx = -3; bx <= 3; bx++)
    for (let bz = -3; bz <= 3; bz++) {
      // Leave the original center chunk's hand-authored landmark cluster undisturbed.
      if (bx === 0 && bz === 0) continue;
      const cx = bx * 110,
        cz = bz * 110;
      const count = 1 + (rand() > 0.36 ? 1 : 0) + (rand() > 0.78 ? 1 : 0);
      for (let j = 0; j < count; j++) {
        const w = 9 + rand() * 15,
          d = 9 + rand() * 15;
        const x = cx + (rand() - 0.5) * 48,
          z = cz + (rand() - 0.5) * 48;
        const heightRoll = rand();
        const h =
          heightRoll < 0.22
            ? 20 + rand() * 17
            : heightRoll < 0.62
              ? 10 + rand() * 11
              : 4.5 + rand() * 5.5;
        const pair = palette[Math.floor(rand() * palette.length)];
        addBuilding(x, z, w, d, h, pair[0], pair[1], h > 19 ? "tower" : "city-block");
      }
    }
}
// Trees, rocks and roadside details. Scatter them through the expanded districts,
// while preserving clearance around streets, buildings and stunt ramps.
worldB.useMaterial(0.96, 0, 5);
{
  let seed = 918273;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 420; i++) {
    const x = -425 + rand() * 850,
      z = -425 + rand() * 850,
      r = 0.65 + rand() * 0.42;
    const onStreet = streetLines.some(
      (s) => Math.abs(x - s) < SIDEWALK_OUTER + 1.0 || Math.abs(z - s) < SIDEWALK_OUTER + 1.0,
    );
    const nearBuilding = buildingColliders.some(
      (b) => Math.abs(x - b.x) < b.hw + r + 2 && Math.abs(z - b.z) < b.hl + r + 2,
    );
    if (onStreet || nearBuilding || isNearAnyRamp(x, z, 2)) continue;
    const y = terrainH(x, z);
    worldB.useMaterial(0.28, 0, 5);
    worldB.box(x - 0.17, y, z - 0.17, x + 0.17, y + 1.5, z + 0.17, [0.48, 0.25, 0.09]);
    worldB.useMaterial(0.24, 0, 7);
    worldB.box(
      x - r * 0.82,
      y + 1.08,
      z - r * 0.82,
      x + r * 0.82,
      y + 2.25,
      z + r * 0.82,
      [0.1, 0.61, 0.17],
    );
    worldB.box(
      x - r * 0.62,
      y + 2.05,
      z - r * 0.62,
      x + r * 0.62,
      y + 3.18,
      z + r * 0.62,
      [0.14, 0.69, 0.2],
    );
    worldB.box(
      x - r * 0.4,
      y + 2.98,
      z - r * 0.4,
      x + r * 0.4,
      y + 3.92,
      z + r * 0.4,
      [0.21, 0.76, 0.24],
    );
    worldB.cylinderY(x, y + 3.92, z, r * 0.2, 0.11, [0.35, 0.84, 0.29], 10);
  }
}
worldB.useMaterial(0.94, 0, 3);
{
  let seed = 123987;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 220; i++) {
    const x = -428 + rand() * 856,
      z = -428 + rand() * 856;
    const nearBuilding = buildingColliders.some(
      (b) => Math.abs(x - b.x) < b.hw + 2 && Math.abs(z - b.z) < b.hl + 2,
    );
    const onStreet = streetLines.some(
      (s) => Math.abs(x - s) < SIDEWALK_OUTER + 1.0 || Math.abs(z - s) < SIDEWALK_OUTER + 1.0,
    );
    if (nearBuilding || onStreet || isNearAnyRamp(x, z, 2)) continue;
    const y = terrainH(x, z);
    worldB.box(x - 0.42, y, z - 0.34, x + 0.42, y + 0.45, z + 0.34, [0.48, 0.52, 0.49]);
    staticShadowCasters.push({ x, z, hw: 0.45, hl: 0.38, yaw: 0, height: 0.5, alpha: 0.16 });
    buildingColliders.push({ id: "rock-" + i, x, z, hw: 0.42, hl: 0.34, yaw: 0, kind: "rock" });
  }
}
// Street lamps along the crossroad.
worldB.useMaterial(0.34, 0.72, 6);
for (let z = -86; z <= 86; z += 22) {
  const y = terrainH(6, z);
  worldB.box(5.8, y, z - 0.08, 6.05, y + 4.4, z + 0.08, [0.22, 0.25, 0.26]);
  worldB.box(5.85, y + 4.2, z - 0.8, 7.2, y + 4.38, z + 0.08, [0.28, 0.3, 0.3]);
  worldB.box(6.7, y + 4.1, z - 0.76, 7.25, y + 4.45, z - 0.18, [0.92, 0.83, 0.52]);
}
const worldMesh = worldB.finish();
