"use strict";
// =============================================================================
// src/hud.js
// HUD text updates and the minimap.
// updateUI() and drawMap() run every frame.
// =============================================================================

function updateUI() {
  const boostEl = $("boostStatus");
  if (onFoot) {
    boostEl.textContent = "BOOST · IN VEHICLE";
    boostEl.style.color = "#a8efff";
    vehicleNameEl.textContent = "On Foot";
    speedEl.innerHTML = "WALK <small>MODE</small>";
  } else {
    vehicleNameEl.textContent = controlled.name;
    speedEl.innerHTML = Math.round(currentSpeed()) + " <small>MPH</small>";
    if (controlled.boostTime > 0) {
      boostEl.textContent = "BOOST ACTIVE · " + controlled.boostTime.toFixed(1) + "s";
      boostEl.style.color = "#ffe17c";
    } else if (controlled.boostCooldown > 0) {
      boostEl.textContent = "BOOST RECHARGE · " + controlled.boostCooldown.toFixed(1) + "s";
      boostEl.style.color = "#c4d0d5";
    } else {
      boostEl.textContent = "BOOST READY · SHIFT";
      boostEl.style.color = "#a8efff";
    }
  }
  let hint =
    "Explore a glossy, brick-built toy town on a flat city baseplate with an industrial yard.";
  if (onFoot) {
    const v = nearestVehicle(player.x, player.z);
    hint = v
      ? "Press E to get into the " + v.name + "."
      : "Walk up to a vehicle and press E to drive it.";
  } else if (atUpgradePad()) {
    hint = "Tuning pad: stop to buy top-speed, acceleration or impact upgrades.";
  } else {
    hint =
      "Shift: turbo boost  ·  E: exit vehicle  ·  C: camera  ·  Crashes, broken props and airtime earn cash.";
  }
  if (hint !== lastHint) {
    hintEl.textContent = hint;
    lastHint = hint;
  }
  updateActivityHud();
  refreshUpgradePanel();
  if (performance.now() > messageUntil) messageEl.classList.remove("show");
}
function drawMap() {
  const c = $("map"),
    ctx = c.getContext("2d"),
    W = c.width,
    H = c.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#263d37";
  ctx.fillRect(0, 0, W, H);
  // minimap covers the full 4x4 city footprint.
  const px = (x) => ((x + 440) / 880) * W,
    py = (z) => ((440 - z) / 880) * H;
  ctx.strokeStyle = "#899494";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const s of streetLines) {
    ctx.moveTo(px(s), py(-440));
    ctx.lineTo(px(s), py(440));
    ctx.moveTo(px(-440), py(s));
    ctx.lineTo(px(440), py(s));
  }
  ctx.stroke();
  ctx.strokeStyle = "#e5dca9";
  ctx.lineWidth = 0.7;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  for (const s of streetLines) {
    ctx.moveTo(px(s), py(-440));
    ctx.lineTo(px(s), py(440));
    ctx.moveTo(px(-440), py(s));
    ctx.lineTo(px(440), py(s));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#b9a98b";
  for (const b of buildingColliders)
    if (!b.kind || b.kind === "building")
      ctx.fillRect(
        px(b.x - b.hw),
        py(b.z + b.hl),
        ((b.hw * 2) / 880) * W,
        ((b.hl * 2) / 880) * H,
      );
  ctx.fillStyle = "#f4cf59";
  ctx.fillRect(px(upgradeRamp.x) - 7, py(34.2) - 7, 14, 14);
  ctx.strokeStyle = "#fff2b5";
  ctx.lineWidth = 2;
  ctx.strokeRect(px(upgradeRamp.x) - 7, py(34.2) - 7, 14, 14);
  const rampMapColors = ["#ff8b54", "#54d4da", "#cf8cff"];
  for (let i = 0; i < stuntRamps.length; i++) {
    const r = stuntRamps[i];
    ctx.fillStyle = rampMapColors[i % rampMapColors.length];
    ctx.fillRect(px(r.x) - 5, py((r.startZ + r.endZ) / 2) - 5, 10, 10);
  }
  drawActivityMapMarkers(ctx, px, py);
  for (const v of vehicles) {
    ctx.beginPath();
    ctx.arc(px(v.x), py(v.z), v.ai ? 4.5 : 6.2, 0, Math.PI * 2);
    ctx.fillStyle =
      v === controlled
        ? "#fff37b"
        : v.type === "semi"
          ? "#f2bd3f"
          : v.type === "pickup"
            ? "#6fbaff"
            : v.ai
              ? "#e5eceb"
              : "#e96c60";
    ctx.fill();
  }
  const p = onFoot ? player : controlled;
  ctx.save();
  ctx.translate(px(p.x), py(p.z));
  ctx.rotate(-p.yaw);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(6, 7);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,.32)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
}
