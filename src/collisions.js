"use strict";
// =============================================================================
// src/collisions.js
// Collision resolution (OBB/SAT), semi trailer physics, suspension, airtime, wheel animation.
// Vehicle vs building / prop / vehicle contact lives here.
// =============================================================================

function obbInfo(v) {
  const c = footprint(v),
    axes = vehicleAxes(v);
  return {
    x: c.x,
    z: c.z,
    hw: v.width / 2,
    hl: v.length / 2,
    rx: axes.right[0],
    rz: axes.right[1],
    fx: axes.forward[0],
    fz: axes.forward[1],
  };
}
function satOBB(a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  let min = 1e9,
    nx = 0,
    nz = 0;
  const axes = [
    [a.rx, a.rz],
    [a.fx, a.fz],
    [b.rx, b.rz],
    [b.fx, b.fz],
  ];
  for (const ax of axes) {
    const dist = Math.abs(dx * ax[0] + dz * ax[1]);
    const ra =
      a.hw * Math.abs(a.rx * ax[0] + a.rz * ax[1]) + a.hl * Math.abs(a.fx * ax[0] + a.fz * ax[1]);
    const rb =
      b.hw * Math.abs(b.rx * ax[0] + b.rz * ax[1]) + b.hl * Math.abs(b.fx * ax[0] + b.fz * ax[1]);
    const overlap = ra + rb - dist;
    if (overlap <= 0) return null;
    if (overlap < min) {
      min = overlap;
      const sign = dx * ax[0] + dz * ax[1] >= 0 ? 1 : -1;
      nx = ax[0] * sign;
      nz = ax[1] * sign;
    }
  }
  return { overlap: min, nx, nz };
}
// Cheap broad phase. Two oriented boxes can only touch if their centers are closer than the sum of
// their half-diagonals, and (half width + half length) is never smaller than a half-diagonal. This
// only skips pairs that cannot overlap, so results are identical to testing every pair.
function farApart(ax, az, aReach, bx, bz, bReach) {
  const reach = aReach + bReach + 0.5;
  return Math.abs(ax - bx) > reach || Math.abs(az - bz) > reach;
}
function resolveVehicleBuilding(v, box) {
  if (box.topY !== undefined && Number.isFinite(v.y) && v.y > box.topY + 0.2) return;
  if (farApart(v.x, v.z, v.width / 2 + v.length / 2, box.x, box.z, box.hw + box.hl)) return;
  const a = obbInfo(v),
    b = { x: box.x, z: box.z, hw: box.hw, hl: box.hl, rx: 1, rz: 0, fx: 0, fz: 1 };
  const hit = satOBB(a, b);
  if (!hit) return;
  const vn = v.vx * hit.nx + v.vz * hit.nz;
  if (v === controlled && vn > 0) registerCrashReward("building:" + v.id + ":" + box.id, vn);
  v.x -= hit.nx * (hit.overlap + 0.025);
  v.z -= hit.nz * (hit.overlap + 0.025);
  if (vn > 0) {
    v.vx -= hit.nx * vn * 1.28;
    v.vz -= hit.nz * vn * 1.28;
    v.suspensionVelocity -= Math.min(vn * 0.035, 0.24);
    v.pitchVelocity += Math.sign(vn) * 0.12;
  }
}
function spawnPropDebris(p, kind, impact) {
  const count = clamp(Math.round(7 + impact * 0.45), 7, 13);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2,
      side = 0.8 + Math.random() * 3.8;
    debris.push({
      model: debrisModels[kind] || debrisModels.crate,
      x: p.x + (Math.random() - 0.5) * 0.5,
      y: p.y + 0.45 + Math.random() * 0.65,
      z: p.z + (Math.random() - 0.5) * 0.5,
      vx: p.vx + Math.cos(a) * side,
      vz: p.vz + Math.sin(a) * side,
      vy: 2.0 + Math.random() * 3.6,
      yaw: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 9,
      scale: 0.1 + Math.random() * 0.16,
      life: 1.5 + Math.random() * 1.1,
    });
  }
}
function damageProp(p, impact, rammer) {
  if (!p || p.broken || impact < 3.0) return false;
  const multiplier = rammer && rammer === controlled ? rammer.impactMultiplier || 1 : 1;
  // A clean, meaningful hit should make visible progress without requiring an impact upgrade.
  // Contact latching below prevents sustained pushing from applying this repeatedly.
  p.hp -= Math.max(0, impact - 2.35) * 0.68 * multiplier;
  if (p.hp <= 0) {
    p.broken = true;
    spawnPropDebris(p, p.type, impact);
    if (rammer === controlled) {
      cash += 18;
      updateCashUI();
      say(`SMASHED ${p.type.toUpperCase()}  +$18`, 1150);
    }
    return true;
  }
  return false;
}
function registerPropImpact(p, rammer, impact, isTrailer = false) {
  if (!p || p.broken || !rammer) return false;
  // Record every overlapping frame, including soft contact. Otherwise a slow frame
  // could reset the latch while the vehicle is still pushing the prop.
  const key = (isTrailer ? "trailer:" : "vehicle:") + rammer.id;
  const cooldowns = p._damageContactCooldowns || new Map();
  const current = p._damageContactsNow || (p._damageContactsNow = new Set());
  current.add(key);
  // A short separation grace period prevents tiny physics gaps from turning one long
  // shove into a series of artificial impacts. The player must disengage before re-ramming.
  if ((cooldowns.get(key) || 0) > 0 || impact < 3.0) return false;
  return damageProp(p, impact, rammer);
}
function beginPropCollisionFrame() {
  for (const p of props) p._damageContactsNow = new Set();
}
function finishPropCollisionFrame(dt) {
  for (const p of props) {
    const cooldowns = p._damageContactCooldowns || new Map();
    const current = p._damageContactsNow || new Set();
    for (const [key, remaining] of cooldowns) {
      if (current.has(key)) cooldowns.set(key, 0.4);
      else if (remaining <= dt) cooldowns.delete(key);
      else cooldowns.set(key, remaining - dt);
    }
    for (const key of current) if (!cooldowns.has(key)) cooldowns.set(key, 0.4);
    p._damageContactCooldowns = cooldowns;
    delete p._damageContactsNow;
  }
}
function resolveVehicleProp(v, p, propIndex) {
  if (!p || p.broken) return;
  if (v.grounded === false && Number.isFinite(v.y) && v.y > p.y + 1.35) return;
  if (farApart(v.x, v.z, v.width / 2 + v.length / 2, p.x, p.z, p.radius)) return;
  const a = obbInfo(v),
    dx = p.x - a.x,
    dz = p.z - a.z;
  const lx = dx * a.rx + dz * a.rz,
    lz = dx * a.fx + dz * a.fz;
  const cx = clamp(lx, -a.hw, a.hw),
    cz = clamp(lz, -a.hl, a.hl);
  const wx = a.x + a.rx * cx + a.fx * cz,
    wz = a.z + a.rz * cx + a.fz * cz;
  let nx = p.x - wx,
    nz = p.z - wz,
    d = Math.hypot(nx, nz);
  const min = p.radius;
  if (d < min) {
    if (d < 0.001) {
      nx = 1;
      nz = 0;
      d = 1;
    } else {
      nx /= d;
      nz /= d;
    }
    const overlap = min - d;
    p.x += nx * overlap;
    p.z += nz * overlap;
    const rel = (p.vx - v.vx) * nx + (p.vz - v.vz) * nz;
    const impact = Math.max(0, -rel);
    registerPropImpact(p, v, impact);
    const ramPower = v === controlled ? v.impactMultiplier || 1 : 1;
    const kick = clamp((impact * 1.25 + 1.5) * ramPower, 1.5, 24);
    p.vx += nx * kick;
    p.vz += nz * kick;
    v.vx -= nx * Math.min(impact * 0.12, 2);
    v.vz -= nz * Math.min(impact * 0.12, 2);
    p.roll += kick * 0.07;
  }
}
function addCollisionBodyReaction(v, impact, nx, nz) {
  v.suspensionVelocity -= Math.min(impact * 0.026, 0.3);
  const side = nx * Math.cos(v.yaw) - nz * Math.sin(v.yaw);
  const fore = nx * Math.sin(v.yaw) + nz * Math.cos(v.yaw);
  v.rollVelocity += clamp(-side * impact * 0.006, -0.16, 0.16);
  v.pitchVelocity += clamp(fore * impact * 0.004, -0.12, 0.12);
}
function resolveVehiclePair(a, b) {
  if (farApart(a.x, a.z, a.width / 2 + a.length / 2, b.x, b.z, b.width / 2 + b.length / 2)) return;
  const hit = satOBB(obbInfo(a), obbInfo(b));
  if (!hit) return;
  const { nx, nz, overlap } = hit;
  const ia = 1 / a.mass,
    ib = 1 / b.mass,
    total = ia + ib;
  a.x -= nx * (overlap + 0.02) * (ia / total);
  a.z -= nz * (overlap + 0.02) * (ia / total);
  b.x += nx * (overlap + 0.02) * (ib / total);
  b.z += nz * (overlap + 0.02) * (ib / total);
  const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (rel < 0) {
    const impact = -rel;
    if (a === controlled || b === controlled)
      registerCrashReward("vehicle-pair:" + [a.id, b.id].sort().join(":"), impact);
    const ramPower =
      a === controlled ? a.impactMultiplier || 1 : b === controlled ? b.impactMultiplier || 1 : 1;
    const j = (-(1.35 * rel) * ramPower) / total;
    a.vx -= j * ia * nx;
    a.vz -= j * ia * nz;
    b.vx += j * ib * nx;
    b.vz += j * ib * nz;
    addCollisionBodyReaction(a, impact, nx, nz);
    addCollisionBodyReaction(b, impact, -nx, -nz);
    if (a.ai) a.aiKnockTime = Math.max(a.aiKnockTime, 2.0);
    if (b.ai) b.aiKnockTime = Math.max(b.aiKnockTime, 2.0);
    if (Math.abs(rel) > 3) {
      if (a.parked) a.parked = false;
      if (b.parked) b.parked = false;
    }
  }
}
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function trailerObb(t) {
  const c = Math.cos(t.yaw),
    s = Math.sin(t.yaw);
  return { x: t.x, z: t.z, hw: t.width / 2, hl: t.length / 2, rx: c, rz: -s, fx: s, fz: c };
}
function updateSemiTrailer(semi, dt) {
  const t = semi.trailer;
  if (!t) return;
  const f = vehicleForward(semi),
    right = [Math.cos(semi.yaw), -Math.sin(semi.yaw)];
  const hitchOffset = 1.62; // matched to the imported semi model's kingpin pivot
  // The fifth-wheel anchor is on the tractor's rear. Its velocity includes the
  // small rotational component from the tractor turning around its center.
  const hitchX = semi.x - f[0] * hitchOffset,
    hitchZ = semi.z - f[1] * hitchOffset;
  const hitchVx = semi.vx - right[0] * hitchOffset * semi.yawRate;
  const hitchVz = semi.vz - right[1] * hitchOffset * semi.yawRate;
  const articulation = wrapAngle(semi.yaw - t.yaw);
  const tractorForwardSpeed = semi.vx * f[0] + semi.vz * f[1];
  // Bicycle-style trailer kinematics: the tractor's heading difference pulls the
  // trailer into line while moving forward; reversing naturally makes jack-knifing
  // more likely, which is why the mechanical articulation stop matters.
  const kinematicYawRate = (tractorForwardSpeed / t.length) * Math.sin(articulation);
  t.yawRate = lerp(t.yawRate, kinematicYawRate, clamp(dt * 5.5, 0, 1));
  t.yaw = wrapAngle(t.yaw + t.yawRate * dt);
  // Fifth-wheel stops prevent jack-knifing beyond the mechanical articulation limit.
  const maxAngle = t.maxArticulation || Math.PI * 0.34;
  const newArticulation = wrapAngle(t.yaw - semi.yaw);
  if (Math.abs(newArticulation) > maxAngle) {
    const limited = Math.sign(newArticulation) * maxAngle;
    t.yaw = wrapAngle(semi.yaw + limited);
    const relativeYawRate = t.yawRate - semi.yawRate;
    if (Math.sign(limited) * relativeYawRate > 0) t.yawRate = semi.yawRate;
  }
  // The trailer coupler is constrained exactly to the fifth-wheel. Unlike the old
  // spring link, this cannot stretch, drift away or float off behind the tractor.
  const tf = vehicleForward({ yaw: t.yaw }),
    tr = [Math.cos(t.yaw), -Math.sin(t.yaw)],
    half = t.length * 0.5;
  t.x = hitchX - tf[0] * half;
  t.z = hitchZ - tf[1] * half;
  // Rigid hitch kinematics give the trailer center velocity from the coupler velocity.
  t.vx = hitchVx - tr[0] * half * t.yawRate;
  t.vz = hitchVz - tr[1] * half * t.yawRate;
  const trailerForwardSpeed = t.vx * tf[0] + t.vz * tf[1],
    trailerWheelRadius = Math.max(0.16, t.model?.wheels?.[0]?.radius || 0.374);
  t.wheelSpin = (t.wheelSpin || 0) - (trailerForwardSpeed * dt) / trailerWheelRadius;
  t.y = driveSurfaceH(t.x, t.z) + 0.04;
}

function resolveTrailerBuilding(semi, box) {
  const t = semi.trailer;
  if (!t || t.y > box.topY + 0.2) return;
  if (farApart(t.x, t.z, t.width / 2 + t.length / 2, box.x, box.z, box.hw + box.hl)) return;
  const hit = satOBB(trailerObb(t), {
    x: box.x,
    z: box.z,
    hw: box.hw,
    hl: box.hl,
    rx: 1,
    rz: 0,
    fx: 0,
    fz: 1,
  });
  if (!hit) return;
  const vn = t.vx * hit.nx + t.vz * hit.nz;
  t.x -= hit.nx * (hit.overlap + 0.025);
  t.z -= hit.nz * (hit.overlap + 0.025);
  if (vn > 0) {
    if (semi === controlled) registerCrashReward("trailer-building:" + box.id, vn);
    t.vx -= hit.nx * vn * 1.18;
    t.vz -= hit.nz * vn * 1.18;
    semi.vx -= hit.nx * vn * 0.085;
    semi.vz -= hit.nz * vn * 0.085;
    semi.yawRate += clamp((hit.nx * semi.vz - hit.nz * semi.vx) * 0.000025, -0.08, 0.08);
  }
}
function resolveTrailerVehicle(semi, other) {
  const t = semi.trailer;
  if (!t) return;
  const hit = satOBB(trailerObb(t), obbInfo(other));
  if (!hit) return;
  const { nx, nz, overlap } = hit,
    ia = 1 / t.mass,
    ib = 1 / other.mass,
    total = ia + ib;
  t.x -= nx * (overlap + 0.025) * (ia / total);
  t.z -= nz * (overlap + 0.025) * (ia / total);
  other.x += nx * (overlap + 0.025) * (ib / total);
  other.z += nz * (overlap + 0.025) * (ib / total);
  const rel = (other.vx - t.vx) * nx + (other.vz - t.vz) * nz;
  if (rel < 0) {
    const impact = -rel;
    if (semi === controlled || other === controlled)
      registerCrashReward("trailer-vehicle:" + [semi.id, other.id].sort().join(":"), impact);
    const ramPower =
      semi === controlled
        ? semi.impactMultiplier || 1
        : other === controlled
          ? other.impactMultiplier || 1
          : 1;
    const impulse = (-(1.28 * rel) * ramPower) / total;
    t.vx -= impulse * ia * nx;
    t.vz -= impulse * ia * nz;
    other.vx += impulse * ib * nx;
    other.vz += impulse * ib * nz;
    semi.vx -= impulse * ia * nx * 0.48;
    semi.vz -= impulse * ia * nz * 0.48;
    addCollisionBodyReaction(other, impact, -nx, -nz);
    if (other.ai) other.aiKnockTime = Math.max(other.aiKnockTime, 2.3);
    if (other.parked) other.parked = false;
  }
}
function resolveTrailerProp(semi, p, index) {
  const t = semi.trailer;
  if (!t || !p || p.broken) return;
  const a = trailerObb(t),
    dx = p.x - a.x,
    dz = p.z - a.z;
  const lx = dx * a.rx + dz * a.rz,
    lz = dx * a.fx + dz * a.fz;
  const cx = clamp(lx, -a.hw, a.hw),
    cz = clamp(lz, -a.hl, a.hl);
  const wx = a.x + a.rx * cx + a.fx * cz,
    wz = a.z + a.rz * cx + a.fz * cz;
  let nx = p.x - wx,
    nz = p.z - wz,
    d = Math.hypot(nx, nz);
  if (d >= p.radius) return;
  if (d < 0.001) {
    nx = 1;
    nz = 0;
    d = 1;
  } else {
    nx /= d;
    nz /= d;
  }
  const overlap = p.radius - d;
  p.x += nx * overlap;
  p.z += nz * overlap;
  const rel = (p.vx - t.vx) * nx + (p.vz - t.vz) * nz,
    impact = Math.max(0, -rel);
  registerPropImpact(p, semi, impact, true);
  const ramPower = semi === controlled ? semi.impactMultiplier || 1 : 1;
  const kick = clamp((impact * 1.15 + 1.0) * ramPower, 1.0, 20);
  p.vx += nx * kick;
  p.vz += nz * kick;
  semi.vx -= nx * Math.min(impact * 0.07, 2.8);
  semi.vz -= nz * Math.min(impact * 0.07, 2.8);
}

function updateVehicleSuspension(v, dt) {
  const surface = driveSurfaceH(v.x, v.z) + 0.04;
  const surfaceRate = clamp(
    (surface - (v.previousSurfaceY ?? surface)) / Math.max(dt, 0.001),
    -8,
    8,
  );
  v.previousSurfaceY = surface;
  // A damped vertical spring reacts to terrain height changes and hard landings.
  v.suspensionVelocity +=
    (-surfaceRate * 0.1 - v.suspensionOffset * 54 - v.suspensionVelocity * 10.5) * dt;
  v.suspensionOffset = clamp(v.suspensionOffset + v.suspensionVelocity * dt, -0.3, 0.17);
  const f = vehicleForward(v),
    halfWheelbase = v.type === "semi" ? 1.9 : 1.25;
  const front = driveSurfaceH(v.x + f[0] * halfWheelbase, v.z + f[1] * halfWheelbase);
  const rear = driveSurfaceH(v.x - f[0] * halfWheelbase, v.z - f[1] * halfWheelbase);
  let targetPitch =
    -Math.atan2(front - rear, halfWheelbase * 2) - clamp(v.longAccel || 0, -12, 12) * 0.009;
  if (v.grounded === false) targetPitch += clamp(-(v.vy || 0) * 0.035, -0.16, 0.16);
  const right = [Math.cos(v.yaw), -Math.sin(v.yaw)],
    halfTrack = v.type === "semi" ? 1.05 : 0.78;
  const leftH = driveSurfaceH(v.x - right[0] * halfTrack, v.z - right[1] * halfTrack),
    rightH = driveSurfaceH(v.x + right[0] * halfTrack, v.z + right[1] * halfTrack);
  const targetRoll = clamp(
    -Math.atan2(rightH - leftH, halfTrack * 2) - clamp(v.lateralAccel || 0, -12, 12) * 0.008,
    -0.2,
    0.2,
  );
  v.pitchVelocity += ((targetPitch - v.pitch) * 25 - v.pitchVelocity * 8.5) * dt;
  v.rollVelocity += ((targetRoll - v.roll) * 22 - v.rollVelocity * 8.0) * dt;
  v.pitch = clamp(v.pitch + v.pitchVelocity * dt, -0.32, 0.32);
  v.roll = clamp(v.roll + v.rollVelocity * dt, -0.27, 0.27);
}
function awardAirTime(v, seconds) {
  if (v !== controlled || seconds < 0.48) return;
  const payout = clamp(Math.round(seconds * 24), 12, 110);
  cash += payout;
  updateCashUI();
  say(`AIR TIME BONUS  +$${payout} · ${seconds.toFixed(1)}s`, 1700);
}
function updateVehicleWheelAnimation(v, dt, steerInput = 0) {
  const f = vehicleForward(v),
    longitudinalSpeed = v.vx * f[0] + v.vz * f[1];
  const radius = Math.max(0.16, v.model?.wheels?.[0]?.radius || 0.34);
  // Forward travel along local +Z rotates the imported tires around local +X negatively.
  v.wheelSpin = (v.wheelSpin || 0) - (longitudinalSpeed * dt) / radius;
  const maxSteer = v.type === "semi" ? 0.29 : 0.48;
  const target = clamp(steerInput, -1, 1) * maxSteer;
  v.wheelSteerAngle = lerp(v.wheelSteerAngle || 0, target, 1 - Math.exp(-dt * 13));
}
