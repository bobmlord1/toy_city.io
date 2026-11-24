"use strict";
// =============================================================================
// src/interaction.js
// say() messages, enter/exit vehicles, nearest-vehicle lookup, small vehicle helpers.
// say(text, ms) is the one way to show a message to the player.
// =============================================================================

function say(text, duration = 2200) {
  messageEl.textContent = text;
  messageEl.classList.add("show");
  messageUntil = performance.now() + duration;
}
function currentSpeed() {
  if (onFoot) return 0;
  return Math.hypot(controlled.vx, controlled.vz) * MPH_PER_MS;
}
function vehicleForward(v) {
  return [Math.sin(v.yaw), Math.cos(v.yaw)];
}
function vehicleAxes(v) {
  return {
    right: [Math.cos(v.yaw), -Math.sin(v.yaw)],
    forward: [Math.sin(v.yaw), Math.cos(v.yaw)],
  };
}
function footprint(v) {
  return { x: v.x, z: v.z, offset: 0 };
}
function nearestVehicle(px, pz) {
  let best = null,
    bestD = 1e9;
  for (const v of vehicles) {
    if (v.ai) continue;
    const f = footprint(v);
    const d = Math.hypot(px - f.x, pz - f.z);
    const allowance = v.type === "semi" ? 8 : 5.4;
    if (d < allowance && d < bestD) {
      best = v;
      bestD = d;
    }
  }
  return best;
}
function interact() {
  if (!onFoot) {
    const sp = Math.hypot(controlled.vx, controlled.vz);
    if (sp > 2.4 || controlled.grounded === false) {
      say("Wait until the vehicle lands before getting out.");
      return;
    }
    const f = vehicleForward(controlled),
      side = controlled.width / 2 + 1.15;
    player.x = controlled.x + Math.cos(controlled.yaw) * side;
    player.z = controlled.z - Math.sin(controlled.yaw) * side;
    player.yaw = controlled.yaw;
    player.y = driveSurfaceH(player.x, player.z);
    controlled.parked = true;
    controlled.vx *= 0.15;
    controlled.vz *= 0.15;
    onFoot = true;
    say("On foot. Walk up to another vehicle and press E.");
  } else {
    const v = nearestVehicle(player.x, player.z);
    if (!v) {
      say("Walk closer to a parked vehicle to get in.");
      return;
    }
    controlled = v;
    controlled.ai = false;
    controlled.parked = false;
    onFoot = false;
    if (Math.hypot(controlled.vx, controlled.vz) < 0.5) {
      controlled.vx = 0;
      controlled.vz = 0;
    }
    say("Driving: " + controlled.name + ".");
  }
}
