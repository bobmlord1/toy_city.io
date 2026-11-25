"use strict";
// =============================================================================
// src/camera_render.js
// Chase camera and drawWorld() frame rendering.
// drawWorld(dt) is the single render entry point called every frame.
// =============================================================================

let camera = { x: 0, y: 8, z: -12 };
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
  const view = lookAt([camera.x, camera.y, camera.z], target, [0, 1, 0]);
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
