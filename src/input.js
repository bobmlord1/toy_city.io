"use strict";
// =============================================================================
// src/input.js — keyboard plus floating mobile swipe steering and action buttons.
// STEERING SIGNS ARE INTENTIONAL: A/left = +1, D/right = -1.
// =============================================================================
const swipeTouch = { left: false, right: false, gas: false, brake: false, steer: 0 };

function pressed(name) {
  return !!keys[name] || !!touch[name] || !!swipeTouch[name];
}
// Steering from -1 (right) to 1 (left). Keys and buttons are full on/off; the touch swipe
// stick is proportional (T-041), so a wobbling thumb can still drive straight.
function steeringInput() {
  const left = pressed("a") || pressed("arrowleft") || pressed("left");
  const right = pressed("d") || pressed("arrowright") || pressed("right");
  const digital = (left ? 1 : 0) - (right ? 1 : 0);
  return Math.max(-1, Math.min(1, digital + (swipeTouch.steer || 0)));
}
function activateBoost() {
  if (onFoot || !controlled || controlled.parked) return;
  if (controlled.boostCooldown > 0) {
    say("Boost recharging", 700);
    return;
  }
  controlled.boostTime = 1.15;
  controlled.boostCooldown = 4.0;
  say("TURBO!", 700);
}

function setHudProfile(mode) {
  const media = window.matchMedia ? window.matchMedia("(pointer: coarse)") : null;
  const isCoarsePointer = !!(media && media.matches);
  const selected = mode === "auto"
    ? (isCoarsePointer || window.innerWidth <= 760 ? "mobile" : "desktop")
    : mode;
  document.body.classList.toggle("hud-mobile", selected === "mobile");
  document.body.classList.toggle("hud-desktop", selected === "desktop");
  const button = $("profileToggle");
  button.textContent = mode.toUpperCase();
  button.setAttribute("aria-label", "HUD layout: " + mode + ". Change layout");
  try { localStorage.setItem("toyCityHudMode", mode); } catch (_) {}
  window.toyCityHudMode = mode;
}
let hudMode = "auto";
try {
  const saved = localStorage.getItem("toyCityHudMode");
  if (["auto", "desktop", "mobile"].includes(saved)) hudMode = saved;
} catch (_) {}
setHudProfile(hudMode);

$("profileToggle").addEventListener("click", () => {
  hudMode = ({ auto: "desktop", desktop: "mobile", mobile: "auto" })[hudMode];
  setHudProfile(hudMode);
});
window.addEventListener("resize", () => {
  if (hudMode === "auto") setHudProfile("auto");
});

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d", "e", "c", "shift"].includes(key))
    e.preventDefault();
  keys[key] = true;
  if (key === "e" && !e.repeat) interact();
  if (key === "g" && !e.repeat) skipActivity();
  if (key === "shift" && !e.repeat) activateBoost();
  if (key === "c" && !e.repeat) {
    cameraMode = (cameraMode + 1) % 3;
    say(["Chase camera", "Closer camera", "Wide camera"][cameraMode], 800);
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

let swipePointer = null;
let swipeOriginX = 0;
let swipeOriginY = 0;
let swipeCueDismissed = false;

// T-041: before this the stick was on/off and about 10 px of sideways drift gave full lock.
const SWIPE_STEER_RANGE = 64; // px of sideways slide for full steering
const SWIPE_STEER_DEAD_ZONE = 0.22; // share of the range ignored (about 14 px)
const SWIPE_STEER_CURVE = 1.5; // above 1: gentle near the center, full lock only at the edge
function swipeSteer(dx) {
  const n = Math.min(1, Math.abs(dx) / SWIPE_STEER_RANGE);
  if (n <= SWIPE_STEER_DEAD_ZONE) return 0;
  const amount = Math.pow((n - SWIPE_STEER_DEAD_ZONE) / (1 - SWIPE_STEER_DEAD_ZONE), SWIPE_STEER_CURVE);
  return dx < 0 ? amount : -amount; // sliding left steers left (positive)
}
function releaseSwipe() {
  swipePointer = null;
  swipeTouch.steer = 0;
  swipeTouch.left = false;
  swipeTouch.right = false;
  swipeTouch.gas = false;
  swipeTouch.brake = false;
}
function updateSwipe(e) {
  const dx = e.clientX - swipeOriginX;
  const dy = e.clientY - swipeOriginY;
  const ny = Math.max(-1, Math.min(1, dy / 58));
  swipeTouch.steer = swipeSteer(dx);
  swipeTouch.gas = ny < -0.18;
  swipeTouch.brake = ny > 0.72;

  if (!swipeCueDismissed && Math.hypot(dx, dy) > 12) {
    swipeCueDismissed = true;
    $("swipeCue").style.display = "none";
  }
}

document.addEventListener("pointerdown", (e) => {
  if (!document.body.classList.contains("hud-mobile") || e.pointerType === "mouse") return;
  // Keep the invisible stick in the left/lower-left play area; do not steal touches
  // from the dashboard, activity controls or tuning panel.
  if (e.clientX > window.innerWidth * 0.68 || e.clientY < Math.max(108, window.innerHeight * 0.24)) return;
  if (e.target.closest("button, #dashboard, #upgradePanel, #startcover, #activity")) return;
  if (swipePointer !== null) return;
  swipePointer = e.pointerId;
  swipeOriginX = e.clientX;
  swipeOriginY = e.clientY;
  updateSwipe(e);
}, { passive: true });

document.addEventListener("pointermove", (e) => {
  if (e.pointerId === swipePointer) updateSwipe(e);
}, { passive: true });
document.addEventListener("pointerup", (e) => {
  if (e.pointerId === swipePointer) releaseSwipe();
}, { passive: true });
document.addEventListener("pointercancel", (e) => {
  if (e.pointerId === swipePointer) releaseSwipe();
}, { passive: true });

window.addEventListener("blur", () => {
  for (const key in keys) keys[key] = false;
  for (const key in touch) touch[key] = false;
  releaseSwipe();
});

function bindAction(id, down, up) {
  const element = $(id);
  if (!element) return;
  element.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    element.classList.add("active");
    try { element.setPointerCapture(e.pointerId); } catch (_) {}
    down();
  });
  const release = (e) => {
    e.preventDefault();
    element.classList.remove("active");
    if (up) up();
  };
  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);
  element.addEventListener("lostpointercapture", release);
}
bindAction("brakeButton", () => { touch.brake = true; }, () => { touch.brake = false; });
bindAction("boostButton", () => activateBoost());
bindAction("interact", () => interact());
