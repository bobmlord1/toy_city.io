"use strict";
// =============================================================================
// src/physics.js
// On-foot movement, prop and debris updates, updatePhysics() main step.
// updatePhysics(dt) is the single physics entry point called every frame.
// =============================================================================

function updateFoot(dt) {
  const turn = steeringInput();
  player.yaw += turn * 2.35 * dt;
  const f = [Math.sin(player.yaw), Math.cos(player.yaw)];
  let move =
    (pressed("w") || pressed("arrowup") ? 1 : 0) - (pressed("s") || pressed("arrowdown") ? 1 : 0);
  player.x += f[0] * move * 6.2 * dt;
  player.z += f[1] * move * 6.2 * dt;
  player.x = clamp(player.x, -106, 106);
  player.z = clamp(player.z, -106, 106);
  // Keep the on-foot character out of buildings.
  for (const box of buildingColliders) {
    const dx = player.x - box.x,
      dz = player.z - box.z,
      cx = clamp(dx, -box.hw, box.hw),
      cz = clamp(dz, -box.hl, box.hl);
    let nx = dx - cx,
      nz = dz - cz,
      d = Math.hypot(nx, nz);
    if (d < 0.65) {
      if (d < 0.001) {
        nx = 1;
        nz = 0;
        d = 1;
      }
      player.x += (nx / d) * (0.65 - d);
      player.z += (nz / d) * (0.65 - d);
    }
  }
  for (const p of props) {
    const dx = player.x - p.x,
      dz = player.z - p.z,
      d = Math.hypot(dx, dz);
    if (d < p.radius + 0.45) {
      const n = d || 1;
      player.x += (dx / n || 1) * 0.04;
      player.z += (dz / n || 0) * 0.04;
    }
  }
  player.y = driveSurfaceH(player.x, player.z);
}
function updateProps(dt) {
  for (const p of props) {
    if (p.broken) continue;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.vx *= Math.exp(-2.35 * dt);
    p.vz *= Math.exp(-2.35 * dt);
    p.y = driveSurfaceH(p.x, p.z);
    p.yaw += p.roll * dt;
    p.roll *= Math.exp(-2.0 * dt);
    for (const box of buildingColliders) {
      const dx = p.x - box.x,
        dz = p.z - box.z,
        cx = clamp(dx, -box.hw, box.hw),
        cz = clamp(dz, -box.hl, box.hl),
        nx = dx - cx,
        nz = dz - cz,
        d = Math.hypot(nx, nz);
      if (d < p.radius) {
        const n = d || 1;
        p.x += (nx / n || 1) * (p.radius - d);
        p.z += (nz / n || 0) * (p.radius - d);
        p.vx *= 0.35;
        p.vz *= 0.35;
      }
    }
  }
  for (let i = props.length - 1; i >= 0; i--) if (props[i].broken) props.splice(i, 1);
}
function updateDebris(dt) {
  for (const d of debris) {
    d.life -= dt;
    d.vy -= 10.5 * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.z += d.vz * dt;
    d.yaw += d.spin * dt;
    const floor = driveSurfaceH(d.x, d.z) + 0.06;
    if (d.y < floor) {
      d.y = floor;
      d.vy = Math.abs(d.vy) * 0.28;
      d.vx *= 0.72;
      d.vz *= 0.72;
      d.spin *= 0.65;
    }
  }
  for (let i = debris.length - 1; i >= 0; i--) if (debris[i].life <= 0) debris.splice(i, 1);
  if (debris.length > 180) debris.splice(0, debris.length - 180);
}
function updatePhysics(dt) {
  currentCrashContacts = new Set();
  if (onFoot) updateFoot(dt);
  for (const v of vehicles) updateVehicle(v, dt);
  // Semi-trailers update as separate heavy bodies, then collide with buildings, traffic and props.
  for (const semi of vehicles)
    if (semi.trailer) {
      updateSemiTrailer(semi, dt);
      for (const box of buildingColliders) resolveTrailerBuilding(semi, box);
      for (const other of vehicles) if (other !== semi) resolveTrailerVehicle(semi, other);
      for (let i = 0; i < props.length; i++) resolveTrailerProp(semi, props[i], i);
    }
  // Tractor and traffic collisions use mass-weighted impulses. AI vehicles recover gradually.
  for (let i = 0; i < vehicles.length; i++)
    for (let j = i + 1; j < vehicles.length; j++) resolveVehiclePair(vehicles[i], vehicles[j]);
  updateProps(dt);
  updateDebris(dt);
  previousCrashContacts = currentCrashContacts;
  currentCrashContacts = null;
}
