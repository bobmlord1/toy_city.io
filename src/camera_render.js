"use strict";
// =============================================================================
// src/camera_render.js
// Chase camera and drawWorld() frame rendering.
// drawWorld(dt) is the single render entry point called every frame.
// =============================================================================

let camera = { x: 0, y: 8, z: -12 };
const CAMERA_MAX_LAG = 4.5;
// T-033: if a building stands between the target and the camera, move the camera in to just
// in front of the nearest wall, so the view never ends up inside or behind a building.
const PROP_DRAW_DISTANCE = 170; // Manhattan distance from the camera, cheap to test
function keepCameraOutOfBuildings(target) {
  const dx = camera.x - target[0],
    dy = camera.y - target[1],
    dz = camera.z - target[2];
  const len = Math.hypot(dx, dz);
  if (len < 0.5) return;
  let nearest = 1;
  for (const b of buildingColliders) {
    if (b.kind !== "building") continue;
    if (farApart(target[0], target[2], len, b.x, b.z, b.hw + b.hl)) continue;
    // Ray (target -> camera) against the box footprint, below the roof (slab method).
    let t0 = 0,
      t1 = 1;
    for (const [o, d, lo, hi] of [
      [target[0], dx, b.x - b.hw, b.x + b.hw],
      [target[2], dz, b.z - b.hl, b.z + b.hl],
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) {
          t0 = 2;
          break;
        }
        continue;
      }
      let a = (lo - o) / d,
        c = (hi - o) / d;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, c);
      if (t0 > t1) break;
    }
    if (t0 > t1 || t0 >= nearest) continue;
    // Above the roof at that point: the view passes over the building.
    if (b.topY !== undefined && target[1] + dy * t0 > b.topY) continue;
    nearest = t0;
  }
  if (nearest >= 1) return;
  const k = Math.max(0, nearest - 0.6 / len); // stop just short of the wall
  camera.x = target[0] + dx * k;
  camera.y = target[1] + dy * k;
  camera.z = target[2] + dz * k;
}
// T-032: short screen shake (a creature arriving). Only the drawn view moves; the camera's
// own position, and so its smoothing, is untouched. Fades out over the shake time.
const screenShake = { amp: 0, time: 0, left: 0 };
function startScreenShake(amp, seconds) {
  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  screenShake.amp = reduced ? amp * 0.3 : amp;
  screenShake.time = screenShake.left = seconds;
}
function screenShakeOffset(dt) {
  if (screenShake.left <= 0) return [0, 0, 0];
  screenShake.left = Math.max(0, screenShake.left - dt);
  const k = screenShake.amp * (screenShake.left / screenShake.time);
  const t = screenShake.time - screenShake.left;
  return [k * Math.sin(t * 47), k * 0.7 * Math.sin(t * 61 + 1.3), k * Math.sin(t * 53 + 2.1)];
}
function updateCamera(dt) {
  let target, desired;
  if (onFoot) {
    const f = [Math.sin(player.yaw), Math.cos(player.yaw)];
    target = [player.x, player.y + 1.25, player.z];
    desired = [player.x - f[0] * 7, player.y + 3.5, player.z - f[1] * 7];
  } else {
    const f = vehicleForward(controlled);
    const h = Number.isFinite(controlled.y)
      ? controlled.y
      : driveSurfaceH(controlled.x, controlled.z) + 0.04;
    target = [controlled.x, h + (controlled.type === "semi" ? 2.2 : 1.2), controlled.z];
    const back = cameraMode === 1 ? 6.5 : cameraMode === 2 ? 14 : 10.5;
    const lift = cameraMode === 1 ? 3.0 : cameraMode === 2 ? 7.4 : 5.2;
    desired = [controlled.x - f[0] * back, h + lift, controlled.z - f[1] * back];
  }
  const smooth = 1 - Math.exp(-Math.max(dt, 0.001) * 3.5);
  camera.x = lerp(camera.x, desired[0], smooth);
  camera.y = lerp(camera.y, desired[1], smooth);
  camera.z = lerp(camera.z, desired[2], smooth);
  // T-033: at very high speed (Turbo Overload) the smoothing alone left the camera up to 13
  // units behind its spot. Normal driving lags about 2.5, so this cap only affects fast travel.
  const lagX = camera.x - desired[0],
    lagY = camera.y - desired[1],
    lagZ = camera.z - desired[2];
  const lag = Math.hypot(lagX, lagY, lagZ);
  if (lag > CAMERA_MAX_LAG) {
    const k = CAMERA_MAX_LAG / lag;
    camera.x = desired[0] + lagX * k;
    camera.y = desired[1] + lagY * k;
    camera.z = desired[2] + lagZ * k;
  }
  keepCameraOutOfBuildings(target);
  return { target, desired };
}
function drawWorld(dt) {
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.65);
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const c = updateCamera(dt),
    target = c.target;
  const shake = screenShakeOffset(dt);
  const view = lookAt(
    [camera.x + shake[0], camera.y + shake[1], camera.z + shake[2]],
    [target[0] + shake[0] * 0.5, target[1] + shake[1] * 0.5, target[2] + shake[2] * 0.5],
    [0, 1, 0],
  );
  const proj = perspective((58 * Math.PI) / 180, canvas.width / canvas.height, 0.1, 1400);
  const vp = matMul(proj, view);
  gl.uniformMatrix4fv(loc.vp, false, vp);
  gl.uniform3fv(loc.camera, [camera.x, camera.y, camera.z]);
  draw(worldMesh, modelMatrix(0, 0, 0, 0), vp, [camera.x, camera.y, camera.z]);
  // A single aggregated box mesh contains roads, junctions, sidewalks and corner modules.
  draw(streetMesh, modelMatrix(0, 0, 0, 0), vp, [camera.x, camera.y, camera.z]);
  drawShadows(vp);
  // Props are individually movable and have simple momentum.
  for (const p of props) {
    if (p.broken) continue;
    // T-048: ordinary crates and barrels beyond PROP_DRAW_DISTANCE are a pixel or two; skip them.
    // Event props (they have p.model: the creature, the chest) are always drawn.
    if (!p.model && Math.abs(p.x - camera.x) + Math.abs(p.z - camera.z) > PROP_DRAW_DISTANCE) continue;
    const mesh = p.model || (p.type === "barrel" ? barrelModel : crateModel); // p.model: event props
    draw(mesh, modelMatrix(p.x, p.y, p.z, p.yaw), vp, [camera.x, camera.y, camera.z]);
  }
  for (const d of debris) {
    const shrink = clamp(d.life / 0.35, 0.35, 1);
    draw(d.model, modelMatrix(d.x, d.y, d.z, d.yaw, d.scale * shrink), vp, [
      camera.x,
      camera.y,
      camera.z,
    ]);
  }
  // Vehicles: chassis pitch/roll are visualized by the suspension model.
  for (const v of vehicles) {
    const y =
      (Number.isFinite(v.y) ? v.y : driveSurfaceH(v.x, v.z) + 0.04) + (v.suspensionOffset || 0);
    const vehicleRoot = modelMatrix(v.x, y, v.z, v.yaw, 1, v.pitch || 0, v.roll || 0);
    drawVehicleVisual(v.model, vehicleRoot, v.wheelSpin || 0, v.wheelSteerAngle || 0, vp, [
      camera.x,
      camera.y,
      camera.z,
    ]);
    if (v.trailer) {
      const t = v.trailer,
        trailerRoot = modelMatrix(t.x, t.y, t.z, t.yaw);
      drawVehicleVisual(t.model, trailerRoot, t.wheelSpin || 0, 0, vp, [
        camera.x,
        camera.y,
        camera.z,
      ]);
    }
  }
  // Activity beacons, pads and the carried parcel (src/activities.js).
  drawActivityMarkers(vp);
  // Toybox Event gates, rings, beacons and health pips (src/events.js).
  drawEvents(vp);
  // Small on-foot character, built from primitive boxes.
  if (onFoot) {
    draw(personModel, modelMatrix(player.x, player.y, player.z, player.yaw), vp, [
      camera.x,
      camera.y,
      camera.z,
    ]);
  }
}
