"use strict";
// =============================================================================
// src/hud.js — T-012 molded dashboard and player-relative objective map.
// =============================================================================
const boostEl = $("boostStatus");
let lastVehicleName = "", lastSpeedHtml = "", lastBoostText = "", lastBoostColor = "";
function setHudText(el, value, previous) { if (value !== previous) el.textContent = value; return value; }
function setBoostHud(value, color) {
  if (value !== lastBoostText) { boostEl.textContent = value; lastBoostText = value; }
  if (color !== lastBoostColor) { boostEl.style.color = color; lastBoostColor = color; }
}
function updateUI() {
  let name, speedHtml;
  if (onFoot) {
    setBoostHud("ON FOOT", "#AFC2C8"); name = "WALK"; speedHtml = "0 <small>MPH</small>";
  } else {
    name = controlled.name; speedHtml = Math.round(currentSpeed()) + " <small>MPH</small>";
    if (controlled.boostTime > 0) setBoostHud("BOOST!", "#F4CF59");
    else if (controlled.boostCooldown > 0) setBoostHud("RECHARGING", "#AFC2C8");
    else setBoostHud("BOOST READY", "#72D2DC");
  }
  lastVehicleName = setHudText(vehicleNameEl, name, lastVehicleName);
  if (speedHtml !== lastSpeedHtml) { speedEl.innerHTML = speedHtml; lastSpeedHtml = speedHtml; }
  const cashText = "$" + Math.floor(cash).toLocaleString("en-US");
  if (cashEl.textContent !== cashText) cashEl.textContent = cashText;
  const nearby = onFoot ? nearestVehicle(player.x, player.z) : controlled && Math.hypot(controlled.vx, controlled.vz) < 2.4 && controlled.grounded !== false;
  const interactButton = $("interact");
  interactButton.hidden = !nearby;
  updateActivityHud();
  refreshUpgradePanel();
  if (performance.now() > messageUntil) messageEl.classList.remove("show");
}
function drawMap() {
  const canvas = $("map"), ctx = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
  const p = onFoot ? player : controlled;
  if (!p) return;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#203D48"; ctx.fillRect(0, 0, W, H);
  // Player-relative coordinates: forward is always toward the top. Vertical compression
  // gives the simple road grid a toy-diorama / tilted-map feel without blurring markers.
  const yaw = p.yaw || 0, cs = Math.cos(yaw), sn = Math.sin(yaw);
  const scale = Math.min(W / 390, H / 230) * 0.94;
  const project = (x,z) => {
    const dx=x-p.x, dz=z-p.z;
    const right=dx*cs-dz*sn, forward=dx*sn+dz*cs;
    return [W/2+right*scale, H/2-forward*scale*0.58];
  };
  ctx.save();
  ctx.beginPath(); ctx.roundRect(0,0,W,H,12); ctx.clip();
  // Quiet, simplified street context only; no building, rock or traffic symbols.
  ctx.strokeStyle="rgba(175,194,200,.28)"; ctx.lineWidth=8*scale; ctx.lineCap="round";
  ctx.beginPath();
  for (const s of streetLines) {
    let a=project(s,-WORLD_HALF), b=project(s,WORLD_HALF);
    ctx.moveTo(...a); ctx.lineTo(...b);
    a=project(-WORLD_HALF,s); b=project(WORLD_HALF,s);
    ctx.moveTo(...a); ctx.lineTo(...b);
  }
  ctx.stroke();
  ctx.strokeStyle="rgba(244,241,232,.16)"; ctx.lineWidth=1.2; ctx.setLineDash([5,7]);
  ctx.beginPath();
  for (const s of streetLines) {
    let a=project(s,-WORLD_HALF), b=project(s,WORLD_HALF);
    ctx.moveTo(...a); ctx.lineTo(...b);
    a=project(-WORLD_HALF,s); b=project(WORLD_HALF,s);
    ctx.moveTo(...a); ctx.lineTo(...b);
  }
  ctx.stroke(); ctx.setLineDash([]);
  // Only current objective(s) are shown. Markers remain crisp and high contrast.
  for (const m of activeMarkers()) {
    const [x,y]=project(m.x,m.z), color=m.kind==="pickup"?"#F4CF59":"#8BC99B";
    ctx.beginPath(); ctx.arc(x,y,9,0,Math.PI*2); ctx.fillStyle=color; ctx.fill();
    ctx.lineWidth=2.5; ctx.strokeStyle="#F4F1E8"; ctx.stroke();
    ctx.beginPath(); ctx.arc(x,y,2.5,0,Math.PI*2); ctx.fillStyle="#152A34"; ctx.fill();
  }
  // Player marker points up regardless of world heading because the map itself rotates.
  ctx.save(); ctx.translate(W/2,H/2); ctx.shadowColor="rgba(0,0,0,.35)"; ctx.shadowBlur=5;
  ctx.fillStyle="#72D2DC"; ctx.strokeStyle="#F4F1E8"; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(0,-13); ctx.lineTo(9,9); ctx.lineTo(0,5); ctx.lineTo(-9,9); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.restore();
}
const activityEl=$("activity"), activityIconEl=$("activityIcon"), activityTextEl=$("activityText");
let lastActivityHud="";
function updateActivityHud() {
  let shown="";
  if(currentActivity) {
    const info=activityTypes[currentActivity.def.type].hud(currentActivity);
    const target=activeMarkers()[0], p=onFoot?player:controlled;
    const dist=target&&p?Math.round(Math.hypot(p.x-target.x,p.z-target.z)/10)*10:0;
    shown=info.icon+"|"+(currentActivity.phase==="offer"?"GET PACKAGE": "DELIVER PACKAGE")+(dist>0?" · "+dist+"m":"");
  }
  if(shown===lastActivityHud)return;
  lastActivityHud=shown;
  if(!shown){activityEl.classList.remove("show");return;}
  const [icon,label]=shown.split("|"); activityIconEl.textContent=icon; activityTextEl.textContent=label; activityEl.classList.add("show");
}
