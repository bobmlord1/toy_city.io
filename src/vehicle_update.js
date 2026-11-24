"use strict";
// =============================================================================
// src/vehicle_update.js
// updateVehicle(): per-vehicle driving, AI traffic, grip, boost, ramps.
// The big per-frame vehicle simulation function.
// =============================================================================

function updateVehicle(v, dt) {
  if (v.boostCooldown > 0) v.boostCooldown = Math.max(0, v.boostCooldown - dt);
  const boostActive = v === controlled && !onFoot && v.boostTime > 0;
  if (v.boostTime > 0) v.boostTime = Math.max(0, v.boostTime - dt);
  if (v.ai) {
    // Traffic follows a route through a soft spring, not a hard position reset. Impacts can
    // shove it well off its lane; it drifts back over time instead of snapping into place.
    const recovery = v.aiKnockTime > 0 ? 0.22 : 1.0;
    v.aiKnockTime = Math.max(0, v.aiKnockTime - dt);
    const targetSpeed = v.maxSpeed * (v.routeDir || 1);
    if (v.route === "district") {
      const route = trafficRoutes[v.routeIndex];
      if (!route) throw new Error("Traffic vehicle has an invalid district route index: " + v.routeIndex);
      v.routeS = (v.routeS + v.maxSpeed * dt) % route.length;
      const lookAhead = Math.max(7, v.maxSpeed * 0.92);
      const target = trafficLanePoint(route, v.routeS + lookAhead, v.routeDir, v.routeLane);
      const desiredYaw = Math.atan2(target.x - v.x, target.z - v.z);
      let yawError = ((desiredYaw - v.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const steeringLimit = clamp(yawError, -1.55 * dt, 1.55 * dt);
      v.yaw += steeringLimit;
      v.yawRate = dt > 0 ? steeringLimit / dt : 0;
      v.aiWheelSteer = clamp(yawError * 0.42, -0.48, 0.48);
      const f = vehicleForward(v),
        right = [Math.cos(v.yaw), -Math.sin(v.yaw)];
      const currentForward = v.vx * f[0] + v.vz * f[1],
        currentSide = v.vx * right[0] + v.vz * right[1];
      const laneErrorX = target.x - v.x,
        laneErrorZ = target.z - v.z;
      const sideCorrection =
        clamp((laneErrorX * right[0] + laneErrorZ * right[1]) * 0.8, -4.5, 4.5) * recovery;
      const nextForward = lerp(currentForward, v.maxSpeed, 1 - Math.exp(-dt * 1.8));
      const nextSide = lerp(currentSide, sideCorrection, 1 - Math.exp(-dt * 2.0));
      v.vx = f[0] * nextForward + right[0] * nextSide;
      v.vz = f[1] * nextForward + right[1] * nextSide;
      v.x += v.vx * dt;
      v.z += v.vz * dt;
      v.yaw = Math.atan2(v.vx, v.vz);
    } else if (v.route === "z") {
      const laneError = v.routeLaneX - v.x;
      const lateralAccel = clamp(laneError * 2.3 - v.vx * 1.65, -6, 6) * recovery;
      v.vx += lateralAccel * dt;
      v.vz += clamp(targetSpeed - v.vz, -3.2 * dt, 3.2 * dt);
      v.x += v.vx * dt;
      v.z += v.vz * dt;
      v.yaw = Math.atan2(v.vx, v.vz);
      if (v.z > 112) {
        v.z = -112;
        v.vz = Math.max(1, v.maxSpeed * 0.65);
      }
      if (v.z < -112) {
        v.z = 112;
        v.vz = -Math.max(1, v.maxSpeed * 0.65);
      }
    } else {
      const laneError = v.routeLaneZ - v.z;
      const lateralAccel = clamp(laneError * 2.3 - v.vz * 1.65, -6, 6) * recovery;
      v.vz += lateralAccel * dt;
      v.vx += clamp(targetSpeed - v.vx, -3.2 * dt, 3.2 * dt);
      v.x += v.vx * dt;
      v.z += v.vz * dt;
      v.yaw = Math.atan2(v.vx, v.vz);
      if (v.x > 112) {
        v.x = -112;
        v.vx = Math.max(1, v.maxSpeed * 0.65);
      }
      if (v.x < -112) {
        v.x = 112;
        v.vx = -Math.max(1, v.maxSpeed * 0.65);
      }
    }
    v.y = driveSurfaceH(v.x, v.z) + 0.04;
    v.grounded = true;
    v.vy = 0;
    v.longAccel = 0;
    v.lateralAccel = 0;
    updateVehicleSuspension(v, dt);
    updateVehicleWheelAnimation(v, dt, v.aiWheelSteer || 0);
    return;
  }
  const oldX = v.x,
    oldZ = v.z,
    oldYaw = v.yaw;
  let wheelSteeringInput = 0;
  if (v === controlled && !onFoot) {
    const f = vehicleForward(v),
      previousForwardSpeed = v.vx * f[0] + v.vz * f[1];
    const forwardInput = pressed("w") || pressed("arrowup") || pressed("gas") ? 1 : 0;
    const brakeInput = pressed("s") || pressed("arrowdown") || pressed("brake") ? 1 : 0;
    const steerInput = steeringInput(),
      hand = pressed(" "),
      throttle = forwardInput;
    wheelSteeringInput = steerInput;
    if (throttle) {
      const airTraction = v.grounded === false ? 0.2 : 1;
      const boostMultiplier = boostActive ? 2.25 : 1;
      v.vx += f[0] * v.accel * boostMultiplier * throttle * dt * airTraction;
      v.vz += f[1] * v.accel * boostMultiplier * throttle * dt * airTraction;
    }
    if (brakeInput) {
      const speed = v.vx * f[0] + v.vz * f[1];
      if (speed > 1.0) {
        const amount = Math.min(speed, v.brakeDecel * dt);
        v.vx -= f[0] * amount;
        v.vz -= f[1] * amount;
      } else {
        v.vx -= f[0] * v.accel * 0.48 * dt;
        v.vz -= f[1] * v.accel * 0.48 * dt;
      }
    }
    const speed = v.vx * f[0] + v.vz * f[1],
      steerFactor = clamp(Math.abs(speed) / 4.0, 0.14, 1.25);
    const desiredYawRate = steerInput * v.steerRate * steerFactor * (speed >= -0.2 ? 1 : -1);
    const steeringResponse = v.type === "semi" ? 2.4 : v.mass > 1450 ? 4.2 : 7.5;
    v.yawRate = lerp(v.yawRate, desiredYawRate, 1 - Math.exp(-steeringResponse * dt));
    v.yaw += v.yawRate * dt;
    const nf = vehicleForward(v),
      nr = [Math.cos(v.yaw), -Math.sin(v.yaw)];
    let forwardSpeed = v.vx * nf[0] + v.vz * nf[1],
      sideSpeed = v.vx * nr[0] + v.vz * nr[1];
    sideSpeed *= Math.exp(-(hand ? 8.0 : v.lateralGrip) * dt);
    forwardSpeed *= Math.exp(-(hand ? 3.4 : throttle || brakeInput ? 0.24 : 0.68) * dt);
    const boostTopSpeed = boostActive ? v.maxSpeed * 1.16 : v.maxSpeed;
    forwardSpeed = clamp(forwardSpeed, -v.maxSpeed * 0.36, boostTopSpeed);
    v.vx = nf[0] * forwardSpeed + nr[0] * sideSpeed;
    v.vz = nf[1] * forwardSpeed + nr[1] * sideSpeed;
    v.longAccel = (forwardSpeed - previousForwardSpeed) / Math.max(dt, 0.001);
    v.lateralAccel = (sideSpeed - (v.previousSideSpeed || 0)) / Math.max(dt, 0.001);
    v.previousSideSpeed = sideSpeed;
  } else if (v.parked) {
    v.vx *= Math.exp(-3 * dt);
    v.vz *= Math.exp(-3 * dt);
    v.yawRate *= Math.exp(-5 * dt);
    v.longAccel = 0;
    v.lateralAccel = 0;
  } else {
    v.vx *= Math.exp(-0.8 * dt);
    v.vz *= Math.exp(-0.8 * dt);
    v.yawRate *= Math.exp(-3 * dt);
    v.longAccel = 0;
    v.lateralAccel = 0;
  }
  v.x += v.vx * dt;
  v.z += v.vz * dt;
  if (v.x < -436 || v.x > 436) {
    v.x = clamp(v.x, -436, 436);
    v.vx *= -0.35;
  }
  if (v.z < -436 || v.z > 436) {
    v.z = clamp(v.z, -436, 436);
    v.vz *= -0.35;
  }
  for (const box of buildingColliders) resolveVehicleBuilding(v, box);
  for (let i = 0; i < props.length; i++) resolveVehicleProp(v, props[i], i);

  let landed = false,
    landingImpact = 0;
  // Only the currently driven vehicle gets the full jump arc. Other vehicles stay grounded.
  if (v === controlled && !onFoot) {
    const dx = v.x - oldX,
      dz = v.z - oldZ,
      travel = Math.hypot(dx, dz),
      surface = driveSurfaceH(v.x, v.z) + 0.04;
    if (v.grounded !== false) {
      v.y = surface;
      v.vy = 0;
      const horizontalSpeed = Math.hypot(v.vx, v.vz);
      for (const r of allRamps) {
        const inside = Math.abs(v.x - r.x) <= r.halfWidth;
        const crossedNear = dz > 0 && oldZ < r.crestZ && v.z >= r.crestZ;
        const crossedFar = dz < 0 && oldZ > r.flatEndZ && v.z <= r.flatEndZ;
        if (inside && travel > 0.002 && horizontalSpeed > 2.5 && (crossedNear || crossedFar)) {
          const slope = r.rise / (crossedNear ? r.crestZ - r.startZ : r.endZ - r.flatEndZ);
          v.vy = clamp(Math.max(3.5, slope * horizontalSpeed * 1.65), 3.5, 8.8);
          v.grounded = false;
          v.airTime = 0;
          v.lastRampLaunch = performance.now();
          say("RAMP JUMP! Stay in the air to earn a bonus.", 1100);
          break;
        }
      }
    } else {
      v.y += v.vy * dt;
      v.vy -= 15.5 * dt;
      if (v.y <= surface) {
        landingImpact = Math.max(0, -v.vy);
        v.y = surface;
        v.vy = 0;
        v.grounded = true;
        landed = true;
        v.suspensionVelocity -= Math.min(landingImpact * 0.17, 0.8);
        v.pitchVelocity += clamp(-landingImpact * 0.025, -0.22, 0.22);
        say("Nice landing!", 650);
      } else v.airTime = (v.airTime || 0) + dt;
    }
    if (landed) {
      awardAirTime(v, v.airTime || 0);
      v.airTime = 0;
    }
    v.surfaceSlope = 0;
  } else {
    v.y = driveSurfaceH(v.x, v.z) + 0.04;
    v.vy = 0;
    v.grounded = true;
    v.surfaceSlope = 0;
  }
  updateVehicleSuspension(v, dt);
  updateVehicleWheelAnimation(v, dt, wheelSteeringInput);
}
