"use strict";
// =============================================================================
// src/hud.js — Molded driving dashboard and fixed-orientation objective map.
// =============================================================================
const boostEl = $("boostStatus");
const cashEl = $("cash");
const mapCanvas = $("map");
const speedGaugeEl = $("speedGauge");
let lastVehicleName = "", lastSpeedText = "", lastBoostText = "", lastBoostColor = "";

function setHudText(element, value, previous) {
  if (value !== previous) element.textContent = value;
  return value;
}
function setBoostHud(value, color) {
  if (value !== lastBoostText) {
    boostEl.textContent = value;
    lastBoostText = value;
  }
  if (color !== lastBoostColor) {
    boostEl.style.color = color;
    lastBoostColor = color;
  }
}

function updateUI() {
  let name, speedValue;
  if (onFoot) {
    setBoostHud("ON FOOT", "#AFC2C8");
    name = "WALK";
    speedValue = 0;
  } else {
    name = controlled.name;
    speedValue = Math.round(currentSpeed());
    if (controlled.boostTime > 0) setBoostHud("BOOST!", "#F4CF59");
    else if (controlled.boostCooldown > 0) setBoostHud("RECHARGING", "#F28F73");
    else setBoostHud("BOOST READY", "#72D2DC");
  }

  lastVehicleName = setHudText(vehicleNameEl, name, lastVehicleName);
  lastSpeedText = setHudText(speedEl, String(speedValue), lastSpeedText);

  const maxSpeed = !onFoot && controlled ? Math.max(controlled.maxSpeed * MPH_PER_MS, 1) : 1;
  const speedRatio = Math.max(0, Math.min(1, speedValue / maxSpeed));
  speedGaugeEl.style.setProperty("--speed-sweep", (speedRatio * 270).toFixed(1) + "deg");

  const cashText = "$" + Math.floor(cash).toLocaleString("en-US");
  if (cashEl.textContent !== cashText) cashEl.textContent = cashText;

  const nearby = onFoot
    ? nearestVehicle(player.x, player.z)
    : controlled && Math.hypot(controlled.vx, controlled.vz) < 2.4 && controlled.grounded !== false;
  $("interact").hidden = !nearby;
  updateActivityHud();
  refreshUpgradePanel();
  if (performance.now() > messageUntil) messageEl.classList.remove("show");
}

// World-up map: the road grid stays in the same screen orientation. The vehicle arrow
// rotates with the car, so left/right turns match what the player sees in the world.
function mapProjectPoint(x, z, origin, scale, width, height) {
  return [
    width * 0.5 - (x - origin.x) * scale,
    height * 0.5 - (z - origin.z) * scale * 0.58,
  ];
}

function mapHeadingScreenAngle(yaw) {
  // The legacy city map has +X to the right and +Z upward; positive vehicle yaw
  // turns toward screen-left, so the map arrow rotates by the negative yaw.
  return -yaw;
}

function drawMap() {
  // Match the backing store to the displayed dimensions for crisp markers without distortion.
  const bounds = mapCanvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const targetWidth = Math.max(1, Math.round((bounds.width || mapCanvas.width) * pixelRatio));
  const targetHeight = Math.max(1, Math.round((bounds.height || mapCanvas.height) * pixelRatio));
  if (mapCanvas.width !== targetWidth || mapCanvas.height !== targetHeight) {
    mapCanvas.width = targetWidth;
    mapCanvas.height = targetHeight;
  }

  const ctx = mapCanvas.getContext("2d");
  const W = mapCanvas.width, H = mapCanvas.height;
  const p = onFoot ? player : controlled;
  if (!p) return;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#173E49";
  ctx.fillRect(0, 0, W, H);

  const scale = Math.min(W / 390, H / 230) * 0.94;
  const project = (x, z) => mapProjectPoint(x, z, p, scale, W, H);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();

  // Bright, toy-like road bands with restrained lane markings.
  ctx.strokeStyle = "rgba(114,210,220,.52)";
  ctx.lineWidth = Math.max(3, 8 * scale);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const line of streetLines) {
    let a = project(line, -WORLD_HALF), b = project(line, WORLD_HALF);
    ctx.moveTo(...a); ctx.lineTo(...b);
    a = project(-WORLD_HALF, line); b = project(WORLD_HALF, line);
    ctx.moveTo(...a); ctx.lineTo(...b);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(244,207,89,.30)";
  ctx.lineWidth = Math.max(1, 1.25 * scale);
  ctx.setLineDash([7 * scale, 7 * scale]);
  ctx.beginPath();
  for (const line of streetLines) {
    let a = project(line, -WORLD_HALF), b = project(line, WORLD_HALF);
    ctx.moveTo(...a); ctx.lineTo(...b);
    a = project(-WORLD_HALF, line); b = project(WORLD_HALF, line);
    ctx.moveTo(...a); ctx.lineTo(...b);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Only current objective(s) are shown. Color is meaningful: yellow pickup, green drop-off.
  for (const marker of activeMarkers()) {
    const [x, y] = project(marker.x, marker.z);
    const color = marker.kind === "pickup" ? "#F4CF59" : "#8BC99B";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(6, 9 * scale), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, 2.5 * scale);
    ctx.strokeStyle = "#F4F1E8";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.8, 2.5 * scale), 0, Math.PI * 2);
    ctx.fillStyle = "#152A34";
    ctx.fill();
  }

  // Screen-up is fixed to the city's world grid; the icon itself follows vehicle yaw.
  ctx.save();
  ctx.translate(W * 0.5, H * 0.5);
  ctx.rotate(mapHeadingScreenAngle(p.yaw || 0));
  ctx.shadowColor = "rgba(0,0,0,.42)";
  ctx.shadowBlur = 6 * pixelRatio;
  ctx.fillStyle = "#72D2DC";
  ctx.strokeStyle = "#F4F1E8";
  ctx.lineWidth = Math.max(1.8, 2.5 * scale);
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(7, 11 * scale), 0, Math.PI * 2);
  ctx.fillStyle = "#152A34";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -Math.max(11, 15 * scale));
  ctx.lineTo(Math.max(6, 8 * scale), Math.max(5, 7 * scale));
  ctx.lineTo(0, Math.max(2, 3 * scale));
  ctx.lineTo(-Math.max(6, 8 * scale), Math.max(5, 7 * scale));
  ctx.closePath();
  ctx.fillStyle = "#72D2DC";
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}
