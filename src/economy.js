"use strict";
// =============================================================================
// src/economy.js
// Cash, crash rewards, tuning pad, upgrade costs and purchases.
// Candidate to be reshaped when real goals/rewards are designed (see DESIGN.md).
// =============================================================================

let cash = 0;
const upgradeCosts = [100, 160, 240, 340, 470, 620, 800, 1000];
const accelerationUpgradeCosts = [120, 190, 280, 400, 550, 720, 920, 1150];
const impactUpgradeCosts = [160, 250, 370, 520, 710, 940, 1220, 1550];
let previousCrashContacts = new Set(),
  currentCrashContacts = null;
function nextUpgradeCost(v, tier = "speed") {
  const level =
    tier === "acceleration"
      ? v.accelerationLevel
      : tier === "impact"
        ? v.impactLevel
        : v.topSpeedLevel;
  const table =
    tier === "acceleration"
      ? accelerationUpgradeCosts
      : tier === "impact"
        ? impactUpgradeCosts
        : upgradeCosts;
  return (
    table[level] ??
    table[table.length - 1] +
      (level - table.length + 1) * (tier === "acceleration" ? 300 : tier === "impact" ? 420 : 260)
  );
}
function updateCashUI() {
  $("cash").textContent = "$" + Math.floor(cash).toLocaleString("en-US");
}
// Single entry point for cash that does not come from crashes (activities use this).
function awardCash(amount) {
  cash += amount;
  updateCashUI();
}
function registerCrashReward(key, impact) {
  if (!currentCrashContacts) return;
  // Smashable props pay only when destroyed. Do not reward low-speed pushing or
  // repeated prop contact here; damageProp owns the single break payout.
  if (typeof key === "string" && (key.startsWith("prop:") || key.startsWith("trailer-prop:"))) return;
  currentCrashContacts.add(key);
  if (previousCrashContacts.has(key) || onFoot || !controlled || impact < 2.25) return;
  const payout = clamp(Math.round(impact * 7.5), 12, 70);
  cash += payout;
  updateCashUI();
  say("CRASH BONUS  +$" + payout, 1150);
}
// One upgrade level for a vehicle. Used by the tuning pad and by the Reward Ring event.
function applyUpgrade(v, tier) {
  if (tier === "speed") {
    v.topSpeedLevel++;
    v.maxSpeed += 5 * MPH_TO_MS;
  } else if (tier === "acceleration") {
    v.accelerationLevel++;
    v.accel = v.baseAccel * Math.pow(1.15, v.accelerationLevel);
  } else if (tier === "impact") {
    v.impactLevel++;
    v.impactMultiplier = Math.pow(1.2, v.impactLevel);
  }
}
function atUpgradePad() {
  if (onFoot || !controlled) return false;
  const r = upgradeRamp;
  return Math.abs(controlled.x - r.x) < 3.55 && controlled.z > 32.0 && controlled.z < 37.8;
}
// ---------------------------------------------------------------------------
// T-043: gentle help to stop on the gold pad, and a close button for the panel.
// The assist only works while the player is coasting slowly near the pad: any gas, reverse,
// boost, or arriving fast (jumping the ramp) switches it off, so it never traps the car.
// ---------------------------------------------------------------------------
const PAD_ASSIST_MAX_SPEED = 12; // m/s (27 mph); faster coasting cars pass through untouched
const PAD_ASSIST_PULL = 1.4; // m/s^2 per unit of distance from the pad center
const PAD_ASSIST_MAX_PULL = 2.2; // m/s^2
const PAD_ASSIST_REST_RADIUS = 2.2; // most of the pad: the car stops where it is (pad is about 2.9 each way)
const PAD_ASSIST_SIDE_RATE = 0.7; // units/s sideways drift toward the center line
const PAD_ASSIST_DAMPING = 1.6; // 1/s slowing everywhere in range...
const PAD_ASSIST_DAMPING_CENTER = 2.6; // ...plus up to this much more near the center
const padCenter = { x: upgradeRamp.x, z: 34.9 }; // middle of the area atUpgradePad() accepts
let upgradePanelDismissed = false;
function nearUpgradePad(v) {
  return (
    !!v &&
    Math.abs(v.x - upgradeRamp.x) < 6.3 &&
    v.z > 28.5 &&
    v.z < 41.5
  );
}
// The assist area starts at the top of the ramp (a little before the panel appears), so a car
// that rolls slowly over the crest is helped onto the pad sooner.
function inPadAssistArea(v) {
  return Math.abs(v.x - upgradeRamp.x) < 6.3 && v.z > upgradeRamp.crestZ && v.z < 41.5;
}
function upgradePadAssist(v, dt, driving) {
  if (driving || onFoot || v !== controlled || v.grounded === false || upgradePanelDismissed) return;
  if (!inPadAssistArea(v) || Math.hypot(v.vx, v.vz) > PAD_ASSIST_MAX_SPEED) return;
  const dx = padCenter.x - v.x,
    dz = padCenter.z - v.z,
    d = Math.hypot(dx, dz);
  // No pull once close to the center, so the car comes to rest instead of creeping.
  const pull = Math.min(PAD_ASSIST_MAX_PULL, PAD_ASSIST_PULL * Math.max(0, d - PAD_ASSIST_REST_RADIUS));
  if (d > 1e-3) {
    v.vx += (dx / d) * pull * dt;
    v.vz += (dz / d) * pull * dt;
  }
  // Cars barely slide sideways, so the sideways part is a slow direct drift.
  const side = clamp(dx, -PAD_ASSIST_SIDE_RATE * dt, PAD_ASSIST_SIDE_RATE * dt);
  v.x += side;
  const damping = PAD_ASSIST_DAMPING + PAD_ASSIST_DAMPING_CENTER * (1 - Math.min(d / 4, 1));
  const keep = Math.exp(-damping * dt);
  v.vx *= keep;
  v.vz *= keep;
}
function dismissUpgradePanel() {
  upgradePanelDismissed = true;
  $("upgradePanel").classList.remove("show");
}
function refreshUpgradePanel() {
  const panel = $("upgradePanel"),
    speedButton = $("upgradeButton"),
    accelButton = $("accelerationButton"),
    impactButton = $("impactButton");
  const near = !onFoot && nearUpgradePad(controlled);
  if (!near) {
    upgradePanelDismissed = false; // closing lasts until the car leaves the pad area
    panel.classList.remove("show");
    return;
  }
  if (upgradePanelDismissed) {
    panel.classList.remove("show");
    return;
  }
  panel.classList.add("show");
  const onPad = atUpgradePad(),
    speed = Math.hypot(controlled.vx, controlled.vz);
  const currentMph = Math.round(controlled.maxSpeed * MPH_PER_MS),
    nextMph = currentMph + 5;
  const speedCost = nextUpgradeCost(controlled, "speed"),
    accelCost = nextUpgradeCost(controlled, "acceleration"),
    impactCost = nextUpgradeCost(controlled, "impact");
  const nextAccel = controlled.accel * 1.15;
  $("upgradeTitle").textContent = controlled.name + " · Top Speed";
  $("upgradeDetails").textContent = onPad
    ? `Current: ${currentMph} MPH  →  Next: ${nextMph} MPH. Upgrades belong to this vehicle.`
    : `Drive onto the gold pad in the flat middle of the blue ramp. Current top speed: ${currentMph} MPH.`;
  if (!onPad) {
    speedButton.disabled = true;
    speedButton.textContent = "DRIVE ONTO THE GOLD PAD";
  } else if (speed > 1.2) {
    speedButton.disabled = true;
    speedButton.textContent = "STOP TO UPGRADE";
  } else if (cash < speedCost) {
    speedButton.disabled = true;
    speedButton.textContent = `TOP SPEED +5 MPH · $${speedCost} (NEED $${speedCost - cash})`;
  } else {
    speedButton.disabled = false;
    speedButton.textContent = `UPGRADE TOP SPEED +5 MPH · $${speedCost}`;
  }
  $("accelerationDetails").textContent = onPad
    ? `Current acceleration: ${controlled.accel.toFixed(1)} m/s²  →  ${nextAccel.toFixed(1)} m/s² (+15%).`
    : `Second tier: improve throttle response and acceleration by 15% per level.`;
  if (!onPad) {
    accelButton.disabled = true;
    accelButton.textContent = "DRIVE ONTO THE GOLD PAD";
  } else if (speed > 1.2) {
    accelButton.disabled = true;
    accelButton.textContent = "STOP TO UPGRADE";
  } else if (cash < accelCost) {
    accelButton.disabled = true;
    accelButton.textContent = `ACCELERATION +15% · $${accelCost} (NEED $${accelCost - cash})`;
  } else {
    accelButton.disabled = false;
    accelButton.textContent = `UPGRADE ACCELERATION +15% · $${accelCost}`;
  }
  $("impactDetails").textContent = onPad
    ? `Current impact power: ×${controlled.impactMultiplier.toFixed(2)}. Each level improves collision force and prop damage by 20%.`
    : `Third tier: stronger ramming impacts and more effective destruction of toy props.`;
  if (!onPad) {
    impactButton.disabled = true;
    impactButton.textContent = "DRIVE ONTO THE GOLD PAD";
  } else if (speed > 1.2) {
    impactButton.disabled = true;
    impactButton.textContent = "STOP TO UPGRADE";
  } else if (cash < impactCost) {
    impactButton.disabled = true;
    impactButton.textContent = `IMPACT POWER +20% · $${impactCost} (NEED $${impactCost - cash})`;
  } else {
    impactButton.disabled = false;
    impactButton.textContent = `UPGRADE IMPACT POWER +20% · $${impactCost}`;
  }
}
function purchaseTopSpeedUpgrade() {
  if (!atUpgradePad()) {
    say("Drive onto the gold tuning pad in the flat middle of the ramp.");
    return;
  }
  if (Math.hypot(controlled.vx, controlled.vz) > 1.2) {
    say("Come to a complete stop before tuning.");
    return;
  }
  const cost = nextUpgradeCost(controlled, "speed");
  if (cash < cost) {
    say(
      "Not enough cash yet. Use the ramps and crash into props, traffic or buildings to earn more.",
    );
    return;
  }
  cash -= cost;
  applyUpgrade(controlled, "speed");
  updateCashUI();
  say(
    `${controlled.name} upgraded to ${Math.round(controlled.maxSpeed * MPH_PER_MS)} MPH!`,
    1900,
  );
  refreshUpgradePanel();
}
function purchaseAccelerationUpgrade() {
  if (!atUpgradePad()) {
    say("Drive onto the gold tuning pad in the flat middle of the ramp.");
    return;
  }
  if (Math.hypot(controlled.vx, controlled.vz) > 1.2) {
    say("Come to a complete stop before tuning.");
    return;
  }
  const cost = nextUpgradeCost(controlled, "acceleration");
  if (cash < cost) {
    say("Not enough cash yet. Try the stunt ramps for airtime bonuses.");
    return;
  }
  cash -= cost;
  applyUpgrade(controlled, "acceleration");
  updateCashUI();
  say(`${controlled.name} acceleration upgraded by 15%!`, 1900);
  refreshUpgradePanel();
}
$("upgradeButton").addEventListener("click", purchaseTopSpeedUpgrade);
$("accelerationButton").addEventListener("click", purchaseAccelerationUpgrade);
function purchaseImpactUpgrade() {
  if (!atUpgradePad()) {
    say("Drive onto the gold tuning pad in the flat middle of the ramp.");
    return;
  }
  if (Math.hypot(controlled.vx, controlled.vz) > 1.2) {
    say("Come to a complete stop before tuning.");
    return;
  }
  const cost = nextUpgradeCost(controlled, "impact");
  if (cash < cost) {
    say("Not enough cash yet. Smash crates and barrels or earn airtime bonuses.");
    return;
  }
  cash -= cost;
  applyUpgrade(controlled, "impact");
  updateCashUI();
  say(
    `${controlled.name} impact power upgraded to ×${controlled.impactMultiplier.toFixed(2)}!`,
    1900,
  );
  refreshUpgradePanel();
}
$("impactButton").addEventListener("click", purchaseImpactUpgrade);
updateCashUI();

// Close button (X) on the tuning panel, and Escape on a keyboard.
$("upgradeClose").addEventListener("click", (e) => {
  e.preventDefault();
  dismissUpgradePanel();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("upgradePanel").classList.contains("show")) dismissUpgradePanel();
});
