"use strict";
// =============================================================================
// src/shadows.js
// Projected-shadow pass for static scenery and moving vehicles.
// Cheap WebGL1-friendly shadows (not a depth map).
// =============================================================================

// Stylized projected shadows: a compact WebGL1-friendly shadow pass. Each caster's
// bottom footprint and sun-shifted top footprint form a soft-edged-looking dark polygon
// on the ground. This is not a full depth shadow map, but it gives trees, buildings and
// moving vehicles readable directional shadows without requiring WebGL2.
function convexHull2D(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.z - b.z);
  if (pts.length <= 3) return pts;
  const cross2 = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
// Shadows must sit just above whatever surface they fall on. Flat ground and roads use a tiny lift.
// Ramp decks get a larger lift (the deck mesh is a few hundredths above driveSurfaceH), and the
// upgrade pad area clears the gold pad and its stripes.
const SHADOW_LIFT = 0.015,
  SHADOW_RAMP_LIFT = 0.055,
  SHADOW_MAX_EDGE = 0.9, // near ramps, split shadow triangles until no edge is longer than this
  SHADOW_MAX_DEPTH = 4;
function shadowSurfaceH(x, z) {
  const ramp = rampProfile(x, z);
  // The raised area extends one triangle-size past the pad so the step down happens off the pad.
  if (
    Math.abs(x - upgradeRamp.x) <= upgradePad.halfWidth + SHADOW_MAX_EDGE &&
    z >= upgradePad.z0 - SHADOW_MAX_EDGE &&
    z <= upgradePad.z1 + SHADOW_MAX_EDGE
  )
    return (
      terrainH(x, z) + ramp + upgradePad.stripeLift + upgradePad.stripeHeight + SHADOW_RAMP_LIFT
    );
  return driveSurfaceH(x, z) + (ramp > 0 ? SHADOW_RAMP_LIFT : SHADOW_LIFT);
}
// A flat triangle stretched across a slope change (a ramp crest, say) cuts through the surface, so
// near ramps each triangle is split into small pieces and every corner samples the true height.
function pushShadowTriangle(out, a, b, c, alpha, depth) {
  const longest = Math.max(
    Math.hypot(a.x - b.x, a.z - b.z),
    Math.hypot(b.x - c.x, b.z - c.z),
    Math.hypot(c.x - a.x, c.z - a.z),
  );
  if (depth > 0 && longest > SHADOW_MAX_EDGE) {
    const mid = (p, q) => ({ x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 });
    const ab = mid(a, b),
      bc = mid(b, c),
      ca = mid(c, a);
    pushShadowTriangle(out, a, ab, ca, alpha, depth - 1);
    pushShadowTriangle(out, ab, b, bc, alpha, depth - 1);
    pushShadowTriangle(out, ca, bc, c, alpha, depth - 1);
    pushShadowTriangle(out, ab, bc, ca, alpha, depth - 1);
    return;
  }
  for (const p of [a, b, c]) out.push(p.x, shadowSurfaceH(p.x, p.z), p.z, alpha);
}
const staticShadowVertices = [];
const shadowSun = normalize([-0.45, 0.82, 0.36]);
function appendShadowCaster(out, caster) {
  const c = Math.cos(caster.yaw || 0),
    si = Math.sin(caster.yaw || 0);
  const corners = [];
  for (const [lx, lz] of [
    [-caster.hw, -caster.hl],
    [caster.hw, -caster.hl],
    [caster.hw, caster.hl],
    [-caster.hw, caster.hl],
  ]) {
    const ox = lx * c + lz * si,
      oz = -lx * si + lz * c;
    corners.push({ x: caster.x + ox, z: caster.z + oz });
    const sx = (-shadowSun[0] / Math.max(0.25, shadowSun[1])) * caster.height;
    const sz = (-shadowSun[2] / Math.max(0.25, shadowSun[1])) * caster.height;
    corners.push({ x: caster.x + ox + sx, z: caster.z + oz + sz });
  }
  const hull = convexHull2D(corners);
  if (hull.length < 3) return;
  const first = hull[0];
  const alpha = caster.alpha ?? 0.28;
  // Only casters near a ramp pay for the extra triangles.
  const reach = Math.hypot(caster.hw, caster.hl) + caster.height * 0.7 + 1;
  const depth = isNearAnyRamp(caster.x, caster.z, reach) ? SHADOW_MAX_DEPTH : 0;
  for (let i = 1; i < hull.length - 1; i++)
    pushShadowTriangle(out, first, hull[i], hull[i + 1], alpha, depth);
}
for (const caster of staticShadowCasters) appendShadowCaster(staticShadowVertices, caster);
const staticShadowBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, staticShadowBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(staticShadowVertices), gl.STATIC_DRAW);
const dynamicShadowBuffer = gl.createBuffer();
function appendVehicleShadow(out, v) {
  const semi = v.type === "semi";
  appendShadowCaster(out, {
    x: v.x,
    z: v.z,
    hw: v.width * 0.56,
    hl: v.length * 0.56,
    yaw: v.yaw,
    height: semi ? 3.2 : 2.25,
    alpha: 0.32,
    useDriveSurface: true,
  });
}
function drawShadows(vp) {
  if (!shadowProgram) return;
  const dynamic = [];
  for (const v of vehicles) {
    appendVehicleShadow(dynamic, v);
    if (v.trailer)
      appendShadowCaster(dynamic, {
        x: v.trailer.x,
        z: v.trailer.z,
        hw: v.trailer.width * 0.56,
        hl: v.trailer.length * 0.55,
        yaw: v.trailer.yaw,
        height: 2.9,
        alpha: 0.3,
        useDriveSurface: true,
      });
  }
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    appendShadowCaster(dynamic, {
      x: p.x,
      z: p.z,
      hw: p.radius * 0.88,
      hl: p.radius * 0.88,
      yaw: p.yaw,
      height: p.type === "barrel" ? 1.1 : 1.0,
      alpha: 0.23,
      useDriveSurface: true,
    });
  }
  if (onFoot)
    appendShadowCaster(dynamic, {
      x: player.x,
      z: player.z,
      hw: 0.3,
      hl: 0.3,
      yaw: player.yaw,
      height: 1.5,
      alpha: 0.24,
    });
  gl.useProgram(shadowProgram);
  const pos = gl.getAttribLocation(shadowProgram, "aShadowPosition"),
    alpha = gl.getAttribLocation(shadowProgram, "aShadowAlpha"),
    shadowVP = gl.getUniformLocation(shadowProgram, "uShadowViewProj");
  gl.uniformMatrix4fv(shadowVP, false, vp);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  function drawShadowBuffer(buffer, count) {
    if (!count) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(pos);
    gl.enableVertexAttribArray(alpha);
    gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(alpha, 1, gl.FLOAT, false, 16, 12);
    gl.drawArrays(gl.TRIANGLES, 0, count);
  }
  drawShadowBuffer(staticShadowBuffer, staticShadowVertices.length / 4);
  if (dynamic.length) {
    gl.bindBuffer(gl.ARRAY_BUFFER, dynamicShadowBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dynamic), gl.DYNAMIC_DRAW);
    drawShadowBuffer(dynamicShadowBuffer, dynamic.length / 4);
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.useProgram(activeProgram);
}
