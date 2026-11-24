"use strict";
// =============================================================================
// src/core.js
// Canvas, WebGL context, start button, fatal-error screen, tiny math helpers.
// Must load FIRST. Sets TOY_CITY_FATAL and stops the loader if WebGL is unavailable.
// =============================================================================

const canvas = document.getElementById("game");
const gl =
  canvas.getContext("webgl", {
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  }) || canvas.getContext("experimental-webgl", { antialias: true, alpha: false });
if (!gl) {
  document.getElementById("startcard").innerHTML =
    "<h1>3D graphics unavailable</h1><p>This browser could not start WebGL. Try opening this file in a current version of Safari, Chrome, Firefox or Edge with hardware acceleration enabled.</p>";
  window.TOY_CITY_FATAL = true;
  throw new Error("WebGL unavailable");
}
const $ = (id) => document.getElementById(id);
let started = false;
let engineReady = false;
function showFatalError(title, detail) {
  started = false;
  const cover = $("startcover");
  const card = $("startcard");
  cover.style.display = "flex";
  card.replaceChildren();
  const heading = document.createElement("h1");
  heading.textContent = title;
  const message = document.createElement("p");
  message.textContent = detail || "The browser could not initialize the 3D game.";
  const advice = document.createElement("p");
  advice.className = "small";
  advice.textContent =
    "Try a current desktop browser with hardware acceleration and WebGL enabled. Reload this file after changing browser settings.";
  card.append(heading, message, advice);
}
window.addEventListener("error", (event) => {
  showFatalError(
    "The game could not start",
    event.message || "A graphics or JavaScript initialization error occurred.",
  );
});
window.addEventListener("unhandledrejection", (event) => {
  showFatalError(
    "The game could not start",
    String(event.reason || "An unexpected startup error occurred."),
  );
});
$("startbtn").addEventListener("click", () => {
  if (!engineReady) {
    say("The 3D world is still initializing. Please wait a moment.");
    return;
  }
  $("startcover").style.display = "none";
  started = true;
  canvas.focus();
  say("Your car is ready. Explore wherever you like!", 2600);
});
const vehicleNameEl = $("vehicleName"),
  speedEl = $("speed"),
  hintEl = $("hint"),
  messageEl = $("message");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hypot = Math.hypot;
const V3 = (x = 0, y = 0, z = 0) => [x, y, z];
const normalize = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
