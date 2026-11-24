"use strict";
// =============================================================================
// src/input.js
// Keyboard and touch input, steering convention, boost.
// STEERING SIGNS ARE INTENTIONAL. Read the comment before changing them.
// =============================================================================

function pressed(name) {
  return !!keys[name] || !!touch[name];
}
// STEERING CONVENTION: DO NOT REVERSE THESE SIGNS:
// A / Left-arrow / left touch button must steer LEFT on screen; D / Right-arrow / right touch button must steer RIGHT.
// This camera looks along +Z with a right-handed view basis, so positive yaw is LEFT on screen.
// Keep A = +1 and D = -1 here; updateVehicle() and updateFoot() both use this shared mapping.
function steeringInput() {
  const steerLeft = pressed("a") || pressed("arrowleft") || pressed("left");
  const steerRight = pressed("d") || pressed("arrowright") || pressed("right");
  return (steerLeft ? 1 : 0) - (steerRight ? 1 : 0);
}
// SHIFT BOOST: edge-triggered so holding Shift cannot retrigger it.
// Boost is intentionally brief, with a cooldown, and does not permanently alter upgrades.
function activateBoost() {
  if (onFoot || !controlled || controlled.parked) return;
  if (controlled.boostCooldown > 0) {
    say(`Boost recharging: ${controlled.boostCooldown.toFixed(1)}s`, 700);
    return;
  }
  controlled.boostTime = 1.15;
  controlled.boostCooldown = 4.0;
  say("TURBO BOOST!", 850);
}
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (
    [
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
      " ",
      "w",
      "a",
      "s",
      "d",
      "e",
      "c",
      "shift",
    ].includes(k)
  )
    e.preventDefault();
  keys[k] = true;
  if (k === "e" && !e.repeat) interact();
  if (k === "g" && !e.repeat) skipActivity();
  if (k === "shift" && !e.repeat) activateBoost();
  if (k === "c" && !e.repeat) {
    cameraMode = (cameraMode + 1) % 3;
    say(["Chase camera", "Closer camera", "Wide camera"][cameraMode], 1000);
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});
window.addEventListener("blur", () => {
  for (const k in keys) keys[k] = false;
  for (const k in touch) touch[k] = false;
});
document.querySelectorAll("[data-control]").forEach((btn) => {
  const k = btn.dataset.control;
  const down = (e) => {
    e.preventDefault();
    touch[k] = true;
    btn.classList.add("active");
    try {
      btn.setPointerCapture(e.pointerId);
    } catch (_) {}
  };
  const up = (e) => {
    e.preventDefault();
    touch[k] = false;
    btn.classList.remove("active");
  };
  btn.addEventListener("pointerdown", down);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("lostpointercapture", up);
});
$("interact").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  interact();
});
