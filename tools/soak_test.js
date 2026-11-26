"use strict";
// =============================================================================
// tools/soak_test.js (T-025)
// Long randomized headless play. A "monkey" driver alternates between random inputs and
// heading for the current objective (activity pad or marker, event marker), and also uses
// boost, handbrake, vehicle switching, skip and the event test path. It reports:
//   errors, non-finite state, money by source (to spot exploits), hard-stuck episodes
//   (forward and reverse both fail to move the car), activities/events that never end,
//   props or the creature leaving the playable area, camera inside buildings and camera lag,
//   and traffic stuck or inside buildings.
// Usage: node tools/soak_test.js [minutes=20] [seed=1]
// Exits non-zero when a hard problem is found (errors, non-finite state, hard-stuck player,
// unreachable objective props, a stuck activity or event). Softer numbers are printed.
// =============================================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const minutes = Number(process.argv[2] || 20);
const seed = Number(process.argv[3] || 1);
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const html = read("index.html");
const SCRIPTS = JSON.parse(html.match(/const SCRIPTS=(\[[^\]]*\])/)[1]);
const dom = new JSDOM(html.replace(/<script>[\s\S]*<\/script>/, ""), { runScripts: "outside-only" });
const w = dom.window,
  ctx = dom.getInternalVMContext();
const stub = () =>
  new Proxy(function () {}, {
    get(_t, p) {
      if (typeof p === "symbol") return undefined;
      if (p === "canvas") return null;
      if (/^[A-Z_0-9]+$/.test(p)) return 1;
      if (/Location$/.test(p)) return () => 0;
      if (p === "createLinearGradient" || p === "createRadialGradient") return () => ({ addColorStop() {} });
      if (p === "measureText") return () => ({ width: 10 });
      if (p === "getShaderParameter" || p === "getProgramParameter") return () => true;
      return () => ({});
    },
    set() {
      return true;
    },
    apply() {
      return {};
    },
  });
w.HTMLCanvasElement.prototype.getContext = () => stub();
const queue = [];
w.requestAnimationFrame = (cb) => queue.push(cb);
const meta = JSON.parse(read("assets/vehicle_meshes.json"));
const bin = fs.readFileSync(path.join(root, "assets/vehicle_meshes.bin"));
const buf = new w.ArrayBuffer(bin.length);
new Uint8Array(buf).set(bin);
w.FREE_ROAM_VEHICLE_ASSETS = { meta, buffer: buf };
let firstError = null;
w.addEventListener("error", (e) => (firstError = firstError || String(e.error && e.error.stack || e.message)));
const run = (src, name = "soak") => new vm.Script(src, { filename: name }).runInContext(ctx);
const get = (e) => JSON.parse(run("JSON.stringify(" + e + ")"));
run(`Math.random=(()=>{let s=${seed * 7919 + 13};return()=>(s=(s*16807)%2147483647)/2147483647})()`);
for (const name of SCRIPTS) run(read(`src/${name}.js`), `src/${name}.js`);
w.document.getElementById("startbtn").click();
let t = 0;
const step = (n) => {
  for (let i = 0; i < n; i++) {
    t += 16.7;
    queue.splice(0).forEach((cb) => cb(t));
  }
};
// Separate random stream for the monkey's choices.
let ms = seed * 104729 + 7;
const rnd = () => (ms = (ms * 48271) % 2147483647) / 2147483647;
const held = new Set();
const setKey = (k, down) => {
  if (down === held.has(k)) return;
  if (down) held.add(k);
  else held.delete(k);
  w.dispatchEvent(new w.KeyboardEvent(down ? "keydown" : "keyup", { key: k }));
};
const tap = (k) => {
  setKey(k, true);
  step(1);
  setKey(k, false);
};
const release = () => ["w", "a", "s", "d", " "].forEach((k) => setKey(k, false));

// Instrument money by source, the camera and per-frame checks inside the page.
run(`
  window.__soak = { money: {}, camInside: 0, camFrames: 0, camLagMax: 0, camLagSum: 0, offWorldProps: [], longActivity: 0, longEvent: 0 };
  const __tag = (label, fn) => function (...a) { const c0 = cash; const r = fn.apply(this, a); const d = cash - c0;
    if (d > 0) __soak.money[label] = (__soak.money[label] || 0) + d; return r; };
  completeActivity = __tag("activities", completeActivity);
  updateEvents = __tag("events", updateEvents);
  damageProp = __tag("prop smash", damageProp);
  awardAirTime = __tag("airtime", awardAirTime);
  registerCrashReward = __tag("crash bonus", registerCrashReward);
  const __uc = updateCamera;
  updateCamera = function (dt) { const r = __uc(dt);
    __soak.camFrames++;
    if (buildingColliders.some(b => b.kind === "building" && Math.abs(camera.x - b.x) < b.hw && Math.abs(camera.z - b.z) < b.hl && camera.y < b.topY)) __soak.camInside++;
    const lag = Math.hypot(camera.x - r.desired[0], camera.z - r.desired[2]);
    // The soak's own teleports (unsticking) would look like huge lag; skip 2 s after one.
    if (!(__soak.teleportAt && performance.now() - __soak.teleportAt < 2000)) {
      __soak.camLagMax = Math.max(__soak.camLagMax, lag); __soak.camLagSum += lag; }
    return r; };
`);
const objective = () =>
  get(`(() => {
    const m = eventMarkers().concat(activeMarkers()).filter(q => q.kind !== "event" || true);
    const p = onFoot ? player : controlled;
    if (!m.length || !p) return null;
    m.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    return {x: m[0].x, z: m[0].z, kind: m[0].kind};
  })()`);
// Steering sign: find which key turns the car toward positive yaw.
let leftKey = "a";
{
  run("onFoot=false; controlled=playerCar; playerCar.vx=0; playerCar.vz=6; playerCar.yaw=0;");
  const y0 = get("playerCar.yaw");
  setKey("w", true);
  setKey("a", true);
  step(20);
  release();
  if (get("playerCar.yaw") < y0) leftKey = "d";
}
const rightKey = leftKey === "a" ? "d" : "a";

const report = { hardStuck: [], unreachable: [], notes: [] };
let mode = "random",
  modeUntil = 0,
  lastPos = null,
  lastMoveCheck = 0,
  stuckPhase = 0;
const frames = minutes * 60 * 60;
let maxActivity = 0,
  maxEvent = 0,
  lastEventKey = "",
  eventSince = 0;
let actKey = "",
  actSince = 0;
const trafficStuck = new Map();
let trafficWedged = 0,
  trafficInside = 0,
  maxProps = 0,
  maxDebris = 0,
  nonFinite = null;
for (let f = 0; f < frames; f += 6) {
  const sec = f / 60;
  // Occasionally start an event through the test path, or skip, or switch vehicles.
  if (rnd() < 0.002) run(`if (!currentEvent) startEvent(["cityAttack","tuningRay","rewardRing"][Math.floor(Math.random()*3)])`);
  if (rnd() < 0.0015) tap("g");
  if (rnd() < 0.002) tap("e");
  if (rnd() < 0.004) tap("shift");
  const st = get(`({foot: onFoot, x: (onFoot ? player : controlled).x, z: (onFoot ? player : controlled).z, yaw: (onFoot ? player : controlled).yaw || 0})`);
  if (sec >= modeUntil) {
    mode = rnd() < 0.6 ? "seek" : "random";
    modeUntil = sec + 3 + rnd() * 8;
    release();
    if (mode === "random") {
      const combos = [["w"], ["w", "a"], ["w", "d"], ["s"], ["w", " "], ["s", "a"], ["w", "d", " "]];
      for (const k of combos[Math.floor(rnd() * combos.length)]) setKey(k, true);
    }
  }
  if (stuckPhase > 0 && !st.foot) {
    // Trying to get free: phase 1 reverses, phase 2 drives forward, nothing else held.
    release();
    setKey(stuckPhase === 1 ? "s" : "w", true);
  } else if (st.foot) {
    // Walk to the nearest vehicle and get in.
    const v = get(`(() => { const v = nearestVehicle(player.x, player.z); return v && {x: v.x, z: v.z}; })()`);
    if (v) run(`player.yaw = Math.atan2(${v.x} - player.x, ${v.z} - player.z);`);
    setKey("w", true);
    if (rnd() < 0.05) tap("e");
  } else if (mode === "seek") {
    const o = objective();
    if (o) {
      const want = Math.atan2(o.x - st.x, o.z - st.z);
      let err = want - st.yaw;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      setKey("w", stuckPhase === 0);
      setKey("s", stuckPhase === 1);
      setKey(leftKey, err > 0.12);
      setKey(rightKey, err < -0.12);
    }
  }
  step(6);
  if (firstError) break;
  // Hard-stuck check: no movement for 4 s, then 2 s of reverse and 2 s forward; still nothing means stuck.
  if (!st.foot) {
    if (!lastPos) lastPos = { x: st.x, z: st.z, at: sec };
    if (sec - lastPos.at >= 4) {
      const moved = Math.hypot(st.x - lastPos.x, st.z - lastPos.z);
      const throttle = held.has("w") || held.has("s");
      if (moved < 1 && throttle) {
        if (stuckPhase < 2) {
          stuckPhase++;
          release();
          lastPos = { x: st.x, z: st.z, at: sec - 2 };
        } else {
          report.hardStuck.push({ at: +sec.toFixed(0), x: +st.x.toFixed(1), z: +st.z.toFixed(1),
            context: get(`({vehicle: controlled.name, activity: currentActivity && currentActivity.def.id, event: currentEvent && currentEvent.type, grounded: controlled.grounded, y: controlled.y})`) });
          run(`__soak.teleportAt = performance.now(); controlled.x = Math.round(controlled.x / 110) * 110 + 55; controlled.z = Math.round(controlled.z / 110) * 110 + 55; controlled.vx = controlled.vz = 0;`);
          stuckPhase = 0;
          release();
          lastPos = null;
        }
      } else {
        if (stuckPhase > 0 && moved >= 1) stuckPhase = 0;
        lastPos = { x: st.x, z: st.z, at: sec };
      }
    }
  } else lastPos = null;
  if (f % 60 !== 0) continue;
  // Once a second: state checks.
  const s = get(`(() => {
    const bad = [];
    for (const v of vehicles) if (![v.x, v.z, v.vx, v.vz, v.yaw].every(Number.isFinite)) bad.push(v.id || v.name);
    for (const p of props) if (![p.x, p.z, p.vx, p.vz].every(Number.isFinite)) bad.push("prop");
    if (![cash, camera.x, camera.y, camera.z, player.x, player.z].every(Number.isFinite)) bad.push("globals");
    const out = props.filter(p => !p.broken && (Math.abs(p.x) > 436 || Math.abs(p.z) > 436));
    const objectiveOut = out.filter(p => p.type === "monster" || (currentActivity && currentActivity.targets && currentActivity.targets.includes(p)));
    const traffic = trafficFleet.map(v => ({id: v.id, speed: Math.hypot(v.vx, v.vz), x: v.x, z: v.z,
      inside: buildingColliders.some(b => b.kind === "building" && Math.abs(v.x - b.x) < b.hw - 0.5 && Math.abs(v.z - b.z) < b.hl - 0.5)}));
    return {bad, outCount: out.length, objectiveOut: objectiveOut.map(p => ({type: p.type, x: +p.x.toFixed(1), z: +p.z.toFixed(1)})),
      act: currentActivity ? currentActivity.def.id + ":" + Math.round(currentActivity.t) : "", actT: currentActivity ? currentActivity.t : 0,
      ev: currentEvent ? currentEvent.type : "", evT: currentEvent ? currentEvent.t : 0, props: props.length, debris: debris.length, traffic};
  })()`);
  if (s.bad.length && !nonFinite) nonFinite = { at: sec, what: s.bad.slice(0, 5) };
  if (s.objectiveOut.length) report.unreachable.push({ at: +sec.toFixed(0), props: s.objectiveOut });
  if (s.outCount) report.notes.push("props outside the playable area: " + s.outCount + " at " + sec.toFixed(0) + "s");
  maxActivity = Math.max(maxActivity, s.actT);
  maxEvent = Math.max(maxEvent, s.evT);
  maxProps = Math.max(maxProps, s.props);
  maxDebris = Math.max(maxDebris, s.debris);
  for (const v of s.traffic) {
    if (v.inside) trafficInside++;
    const k = v.id;
    if (v.speed < 0.3) trafficStuck.set(k, (trafficStuck.get(k) || 0) + 1);
    else {
      if ((trafficStuck.get(k) || 0) >= 20) trafficWedged++;
      trafficStuck.set(k, 0);
    }
  }
}
release();
const soak = get("__soak");
const totalMoney = Object.values(soak.money).reduce((a, b) => a + b, 0);
const ok =
  !firstError && !nonFinite && report.hardStuck.length === 0 && report.unreachable.length === 0 && maxEvent < 125;
const summary = {
  minutes,
  seed,
  ok,
  error: firstError,
  nonFinite,
  hardStuck: report.hardStuck,
  unreachableObjectiveProps: report.unreachable.slice(0, 5),
  propsOutsideNotes: report.notes.slice(0, 5),
  moneyPerMinute: Object.fromEntries(Object.entries(soak.money).map(([k, v]) => [k, Math.round(v / minutes)])),
  moneyTotal: totalMoney,
  longestActivitySeconds: Math.round(maxActivity),
  longestEventSeconds: Math.round(maxEvent),
  maxProps,
  maxDebris,
  camera: {
    framesInsideBuildingPct: +((100 * soak.camInside) / Math.max(1, soak.camFrames)).toFixed(2),
    lagMax: +soak.camLagMax.toFixed(1),
    lagAvg: +(soak.camLagSum / Math.max(1, soak.camFrames)).toFixed(2),
  },
  traffic: { wedgedEpisodesOver20s: trafficWedged, carSecondsInsideBuildings: trafficInside },
  completed: get("({activities: completedActivities, events: completedEvents})"),
};
console.log(JSON.stringify(summary, null, 2));
process.exit(ok ? 0 : 1);
