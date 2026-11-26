"use strict";
// =============================================================================
// src/vehicle_update.js
// updateVehicle(): per-vehicle driving, AI traffic, grip, boost, ramps.
// The big per-frame vehicle simulation function.
// =============================================================================

// T-028: traffic slows for turns. It steers at most TRAFFIC_YAW_RATE, so a turn taken faster
// than (yaw rate x radius) swings wide into the oncoming lane. Measured before this change:
// every mid-block head-on contact involved a car that had swung wide out of a turn.
const TRAFFIC_YAW_RATE = 1.55; // radians per second
const TRAFFIC_TURN_SPEED_MARGIN = 0.75; // the Bezier turn is tighter than its average radius
const TRAFFIC_TURN_BRAKE = 5.5; // gentle braking toward the turn speed (TRAFFIC_BRAKE is 9)
function trafficTurnLimit(v) {
  const leg = v.trafficLeg;
  if (!leg || !leg.turn) return Infinity;
  if (leg.turnSpeed === undefined) {
    const radius = (leg.length - leg.lineLength) / (Math.PI / 2); // average radius of the curve
    leg.turnSpeed = TRAFFIC_YAW_RATE * radius * TRAFFIC_TURN_SPEED_MARGIN;
  }
  const toCurve = leg.lineLength - v.trafficProgress;
  if (toCurve <= 0) return leg.turnSpeed;
  // Highest speed from which the car can still slow to the turn speed by the curve.
  return Math.sqrt(leg.turnSpeed * leg.turnSpeed + 2 * TRAFFIC_TURN_BRAKE * toCurve);
}
// True when a traffic car has left the street corridors far enough to touch a building or rock.
function trafficOffStreet(v) {
  const reach = SIDEWALK_OUTER - Math.hypot(v.width, v.length) * 0.5;
  for (const line of streetLines)
    if (Math.abs(v.x - line) < reach || Math.abs(v.z - line) < reach) return false;
  return true;
}
function updateVehicle(v, dt) {
  if (v.boostCooldown > 0) v.boostCooldown = Math.max(0, v.boostCooldown - dt);
  const boostActive = v === controlled && !onFoot && v.boostTime > 0;
  if (v.boostTime > 0) v.boostTime = Math.max(0, v.boostTime - dt);
  if (v.ai) {
    // Traffic follows a route through a soft spring, not a hard position reset. Impacts can
    // shove it well off its lane; it drifts back over time instead of snapping into place.
    const recovery = v.aiKnockTime > 0 ? 0.22 : 1.0;
    v.aiKnockTime = Math.max(0, v.aiKnockTime - dt);
    if (v.route === "grid") {
      if (!v.trafficLeg) throw new Error("Traffic vehicle has no active grid leg: " + v.id);
      // Cruise speed is the speed the car is trying to hold. It brakes hard for a slower car ahead
      // and recovers gently once the road is clear. The route progresses at this speed.
      if (v.trafficCruise === undefined) v.trafficCruise = v.maxSpeed;
      const wanted = Math.min(v.maxSpeed, trafficFollowLimit(v), trafficTurnLimit(v));
      if (wanted < v.trafficCruise)
        v.trafficCruise = Math.max(wanted, v.trafficCruise - TRAFFIC_BRAKE * dt);
      else v.trafficCruise = Math.min(wanted, v.trafficCruise + TRAFFIC_ACCEL * dt);
      v.trafficProgress += v.trafficCruise * dt;
      while (v.trafficProgress >= v.trafficLeg.length) {
        v.trafficProgress -= v.trafficLeg.length;
        const completed = v.trafficLeg;
        if (completed.turn) v.trafficTurnCount++;
        v.trafficNodeXIndex = completed.nextXIndex;
        v.trafficNodeZIndex = completed.nextZIndex;
        v.trafficHeading = completed.nextHeading;
        v.trafficExitOffset = completed.exitOffset;
        v.trafficVisitedNodeCount++;
        v.trafficMinNodeX = Math.min(v.trafficMinNodeX, v.trafficNodeXIndex);
        v.trafficMaxNodeX = Math.max(v.trafficMaxNodeX, v.trafficNodeXIndex);
        v.trafficMinNodeZ = Math.min(v.trafficMinNodeZ, v.trafficNodeZIndex);
        v.trafficMaxNodeZ = Math.max(v.trafficMaxNodeZ, v.trafficNodeZIndex);
        v.trafficRegionMask |= trafficRegionBit(v.trafficNodeXIndex, v.trafficNodeZIndex);
        v.trafficLeg = trafficBuildLeg(v);
      }
      const lookAhead = Math.max(5.5, v.maxSpeed * 0.62);
      const target = trafficLegPoint(
        v.trafficLeg,
        Math.min(v.trafficProgress + lookAhead, v.trafficLeg.length),
      );
      const desiredYaw = Math.atan2(target.x - v.x, target.z - v.z);
      let yawError = ((desiredYaw - v.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const steeringLimit = clamp(yawError, -TRAFFIC_YAW_RATE * dt, TRAFFIC_YAW_RATE * dt);
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
        clamp((laneErrorX * right[0] + laneErrorZ * right[1]) * 0.55, -3.0, 3.0) * recovery;
      const speedRate = v.trafficCruise < currentForward ? 4.0 : 1.8; // brake faster than accelerating
      const nextForward = lerp(currentForward, v.trafficCruise, 1 - Math.exp(-dt * speedRate));
      const nextSide = lerp(currentSide, sideCorrection, 1 - Math.exp(-dt * 3.5));
      v.vx = f[0] * nextForward + right[0] * nextSide;
      v.vz = f[1] * nextForward + right[1] * nextSide;
      v.x += v.vx * dt;
      v.z += v.vz * dt;
      v.yaw = Math.atan2(v.vx, v.vz);
      // T-020: a knocked car steering back to its lane must not drive through buildings or rocks.
      // They only stand outside the street corridors, so on-road traffic skips this check.
      if (trafficOffStreet(v)) for (const box of buildingColliders) resolveVehicleBuilding(v, box);
    } else {
      throw new Error("Unknown traffic route \"" + v.route + "\" for " + v.id);
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
      // rayMul(): temporary Tuning Ray handling effects (src/events.js). 1 when no effect.
      const accel = rayAccel(v);
      v.vx += f[0] * accel * boostMultiplier * throttle * dt * airTraction;
      v.vz += f[1] * accel * boostMultiplier * throttle * dt * airTraction;
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
    const desiredYawRate =
      steerInput * v.steerRate * rayMul(v, "steer") * steerFactor * (speed >= -0.2 ? 1 : -1);
    const steeringResponse = v.type === "semi" ? 2.4 : v.mass > 1450 ? 4.2 : 7.5;
    v.yawRate = lerp(v.yawRate, desiredYawRate, 1 - Math.exp(-steeringResponse * dt));
    v.yaw += v.yawRate * dt;
    const nf = vehicleForward(v),
      nr = [Math.cos(v.yaw), -Math.sin(v.yaw)];
    let forwardSpeed = v.vx * nf[0] + v.vz * nf[1],
      sideSpeed = v.vx * nr[0] + v.vz * nr[1];
    sideSpeed *= Math.exp(-(hand ? 8.0 : v.lateralGrip * rayMul(v, "grip")) * dt);
    forwardSpeed *= Math.exp(-(hand ? 3.4 : throttle || brakeInput ? 0.24 : 0.68) * dt);
    const topSpeed = rayTopSpeed(v);
    const boostTopSpeed = boostActive ? topSpeed * 1.16 : topSpeed;
    forwardSpeed = clamp(forwardSpeed, -topSpeed * 0.36, boostTopSpeed);
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
    v.x = clamp(v.x, -PLAY_LIMIT, PLAY_LIMIT);
    v.vx *= -0.35;
  }
  if (v.z < -436 || v.z > 436) {
    v.z = clamp(v.z, -PLAY_LIMIT, PLAY_LIMIT);
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
          v.lastRampId = r.id; // read by the stunt-jump activity (src/activities.js)
          v.rayHopActive = false; // a real ramp jump pays the airtime bonus as usual
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
        if (!v.rayEffect) say("Nice landing!", 650); // Super Springs hops would spam it
      } else v.airTime = (v.airTime || 0) + dt;
    }
    if (landed) {
      if (!v.rayHopActive) awardAirTime(v, v.airTime || 0); // Tuning Ray hops never pay
      v.rayHopActive = false;
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
