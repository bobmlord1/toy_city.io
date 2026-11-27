"use strict";
// =============================================================================
// tools/economy_report.js (T-049)
// Headless economy measurements for balancing (T-044 is the balance; this only reports).
//   1. Tables: upgrade prices by level, reward multiplier stages, base payouts.
//   2. Earning rates ($/min) by play style, measured with the real game:
//        mixed      randomized play (tools/soak_test.js)
//        walls      ram a building wall, back off, repeat
//        traffic    ram traffic cars, back off, repeat (no travel time: an upper bound)
//        props      ram ordinary crates and barrels (no travel time: an upper bound)
//        ramps      full-throttle stunt-ramp jumps (no drive back: an upper bound)
//        activities focused activity play on the real board, travel time estimated from
//                   street (Manhattan) distance at an average speed
//        events     expected value of the event pool, per minute of play
//   3. Progression: minutes to afford 3, 6 and 12 upgrades for each style.
// Usage: node tools/economy_report.js [minutesPerStyle=4] [seed=1]
// =============================================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const { JSDOM } = require("jsdom");

const minutes = Number(process.argv[2] || 4);
const seed = Number(process.argv[3] || 1);
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

function boot() {
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
  const run = (src) => new vm.Script(src).runInContext(ctx);
  const get = (e) => JSON.parse(run("JSON.stringify(" + e + ")"));
  run(`Math.random=(()=>{let s=${seed * 7919 + 13};return()=>(s=(s*16807)%2147483647)/2147483647})()`);
  for (const name of SCRIPTS) run(read(`src/${name}.js`));
  w.document.getElementById("startbtn").click();
  let t = 0;
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      t += 16.7;
      queue.splice(0).forEach((cb) => cb(t));
    }
  };
  const key = (down, k) => w.dispatchEvent(new w.KeyboardEvent(down ? "keydown" : "keyup", { key: k }));
  run("eventNextRollAt = Infinity; onFoot = false; controlled = playerCar;");
  step(5);
  return { run, get, step, key };
}
const r0 = (x) => Math.round(x);

// ---------------------------------------------------------------------------
// 1. Tables
// ---------------------------------------------------------------------------
const g = boot();
const tables = g.get(`(() => {
  const v = {topSpeedLevel: 0, accelerationLevel: 0, impactLevel: 0};
  const prices = {};
  for (const tier of ["speed", "acceleration", "impact"]) {
    prices[tier] = [];
    for (let lv = 0; lv < 10; lv++) { const k = tier === "speed" ? "topSpeedLevel" : tier === "acceleration" ? "accelerationLevel" : "impactLevel";
      v[k] = lv; prices[tier].push(nextUpgradeCost(v, tier)); v[k] = 0; }
  }
  const stages = [0, 3, 6, 9, 12].map(n => { const save = paidUpgradeCount; paidUpgradeCount = n; const m = progressionMultiplier(); paidUpgradeCount = save; return {afterPaidUpgrades: n, rewardMultiplier: m}; });
  const byType = {};
  for (const d of activityDefs) (byType[d.type] = byType[d.type] || []).push(d.payout);
  const acts = Object.fromEntries(Object.entries(byType).map(([k, list]) => [k, {count: list.length, min: Math.min(...list), max: Math.max(...list), avg: Math.round(list.reduce((a, b) => a + b, 0) / list.length)}]));
  return {prices, stages, activityPayouts: acts,
    eventPayouts: {cityAttack: MONSTER_TIERS.map(t => t.id + " $" + t.payout), treasure: TREASURE_PAYOUT, rival: RIVAL_PAYOUT, rewardRing: "one free upgrade", tuningRay: 0},
    otherRewards: {crashBonus: "$8 to $45 per new contact (impact x 7.5), not scaled", airtime: "$12 to $110 (seconds x 24), not scaled", propSmash: "$18 per crate or barrel, not scaled", scaledByMultiplier: "activities and events (awardCash)"}};
})()`);

// ---------------------------------------------------------------------------
// 2. Earning rates by style
// ---------------------------------------------------------------------------
const frames = minutes * 3600;
const rate = (dollars, mins = minutes) => r0(dollars / mins);
const styles = {};

// Walls: ram a big building, back off, repeat.
{
  const s = boot();
  const c0 = s.get("cash");
  const b = s.get("buildingColliders.find(q => q.kind === 'building' && q.hw > 8 && Math.abs(q.x) < 300)");
  s.run(`playerCar.x = ${b.x - b.hw - 16}; playerCar.z = ${b.z}; playerCar.yaw = Math.PI / 2; playerCar.vx = playerCar.vz = 0;`);
  for (let f = 0; f < frames; f += 150) {
    s.key(true, "w"); s.step(90); s.key(false, "w");
    s.key(true, "s"); s.step(60); s.key(false, "s");
    s.run(`playerCar.yaw = Math.PI / 2; playerCar.yawRate = 0; if (playerCar.x > ${b.x - b.hw - 3}) playerCar.x = ${b.x - b.hw - 16};`);
  }
  styles.walls = { perMinute: rate(s.get("cash") - c0), note: "ram one wall at full throttle, reverse, repeat" };
}
// Traffic: put the car 22 units ahead of the nearest traffic car, facing it, and drive at it
// (head-on, the way a child tends to hit traffic). Chasing from behind barely closes on traffic.
{
  const s = boot();
  const c0 = s.get("cash");
  for (let f = 0; f < frames; f += 360) {
    s.run(`(() => { const v = controlled; let best = null, bd = 1e9; for (const t of trafficFleet) { const d = Math.hypot(t.x - v.x, t.z - v.z); if (!t.aiKnockTime && d < bd) { bd = d; best = t; } }
      const f = [Math.sin(best.yaw), Math.cos(best.yaw)]; v.x = best.x + f[0] * 22; v.z = best.z + f[1] * 22; v.yaw = best.yaw + Math.PI; v.vx = v.vz = 0; v.yawRate = 0; v.grounded = true; window.__target = best; })()`);
    for (let k = 0; k < 360; k += 3) {
      const st = s.get("(() => { const r = __target, v = controlled; let e = Math.atan2(r.x - v.x, r.z - v.z) - v.yaw; while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI; return {e, d: Math.hypot(r.x - v.x, r.z - v.z)}; })()");
      const back = st.d < 4.4 || (k % 120 > 90);
      s.key(!back, "w"); s.key(back, "s"); s.key(!back && st.e > 0.08, "a"); s.key(!back && st.e < -0.08, "d");
      s.step(3);
    }
  }
  ["w", "s", "a", "d"].forEach((k) => s.key(false, k));
  styles.traffic = { perMinute: rate(s.get("cash") - c0), note: "upper bound: head-on at the nearest traffic car every 6 s, no travel" };
}
// Props: drive straight at the nearest unbroken ordinary prop.
{
  const s = boot();
  const c0 = s.get("cash");
  let smashed = 0;
  for (let f = 0; f < frames; f += 120) {
    const ok = s.get(`(() => { const v = controlled; let best = null, bd = 1e9; for (const p of props) { if (p.model || p.broken) continue; const d = Math.hypot(p.x - v.x, p.z - v.z); if (d < bd) { bd = d; best = p; } }
      if (!best) return false; v.x = best.x - 12; v.z = best.z; v.yaw = Math.PI / 2; v.vx = v.vz = 0; v.yawRate = 0; v.grounded = true; return true; })()`);
    if (!ok) break;
    s.key(true, "w"); s.step(100); s.key(false, "w"); s.step(20);
  }
  smashed = s.get("props.filter(p => !p.model).length");
  styles.props = { perMinute: rate(s.get("cash") - c0), note: "upper bound: placed 12 units from the nearest prop each time", propsLeft: smashed, totalPropCashInCity: 18 * s.get("props.filter(p => !p.model).length") };
}
// Ramps: full-throttle stunt-ramp jumps, placed back on the run-up after each landing.
{
  const s = boot();
  const c0 = s.get("cash");
  let jumps = 0;
  for (let f = 0; f < frames; f += 340) {
    s.run(`(() => { const r = stuntRamps[${jumps} % stuntRamps.length], v = controlled; v.x = r.x; v.z = r.startZ - 22; v.yaw = 0; v.vx = v.vz = 0; v.yawRate = 0; v.grounded = true; v.y = driveSurfaceH(v.x, v.z); })()`);
    s.key(true, "w"); s.step(300); s.key(false, "w"); s.step(40);
    jumps++;
  }
  const dollars = s.get("cash") - c0;
  styles.ramps = { perMinute: rate(dollars), note: "upper bound: no drive back between jumps", perJump: r0(dollars / jumps) };
}
// Activities: the real board; the player picks the nearest of its three pads.
{
  const s = boot();
  const sim = s.get(`(() => {
    const SPEED = 8; // m/s average along streets at stock top speed (20 mph is about 9 m/s)
    const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
    let pos = {x: controlled.x, z: controlled.z}, t = 0, earned = 0, done = 0;
    const work = {delivery: (d) => man(d.pickup, d.dropoff) / SPEED + 5, smash: () => 20, stunt: () => 10};
    const end = {delivery: (d) => d.dropoff, smash: (d) => d.start, stunt: (d) => d.start};
    while (t < ${minutes} * 60) {
      const opts = activityBoardDefs().map(d => ({d, cost: man(pos, activityStart(d)) / SPEED + work[d.type](d)}));
      opts.sort((a, b) => a.cost - b.cost);
      const pick = opts[0].d;
      t += opts[0].cost; earned += pick.payout; done++;
      pos = end[pick.type](pick);
      drawActivityBoard(pick.id);
    }
    return {earned, done, minutes: t / 60};
  })()`);
  styles.activities = { perMinute: r0(sim.earned / sim.minutes), note: "estimate: nearest board pad each time, street distance at 8 m/s, base payouts (x1 multiplier)", activitiesPerMinute: +(sim.done / sim.minutes).toFixed(2) };
}
// Events: one draw every EVENT_ROLL_INTERVAL while idle; expected payout per draw.
{
  const ev = g.get(`(() => {
    const pool = EVENT_POOL;
    const monsterAvg = MONSTER_TIERS.reduce((a, t) => a + t.payout, 0) / MONSTER_TIERS.length;
    const upgradeValue = Math.round((nextUpgradeCost(playerCar, "speed") + nextUpgradeCost(playerCar, "acceleration") + nextUpgradeCost(playerCar, "impact")) / 3);
    const pay = {cityAttack: monsterAvg, tuningRay: 0, rewardRing: upgradeValue, treasure: TREASURE_PAYOUT, rival: RIVAL_PAYOUT};
    const dur = {cityAttack: 60, tuningRay: 20, rewardRing: 30, treasure: 40, rival: 45}; // rough time to finish when chased
    let money = 0, time = 0;
    for (const id of pool) { time += EVENT_ROLL_INTERVAL + (id ? dur[id] : 0); money += id ? pay[id] : 0; }
    return {perMinute: Math.round(money / (time / 60)), note: "expected value if every event is completed (Reward Ring counted at the price of a first upgrade; ring and ray time assumed short)", rewardRingValue: upgradeValue};
  })()`);
  styles.events = ev;
}
// Mixed play from the soak monkey.
try {
  const out = execFileSync(process.execPath, [path.join(__dirname, "soak_test.js"), String(Math.max(4, minutes)), String(seed)], { encoding: "utf8", maxBuffer: 1 << 24 });
  const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
  styles.mixed = { perMinute: Object.values(j.moneyPerMinute).reduce((a, b) => a + b, 0), bySource: j.moneyPerMinute, note: "randomized play (soak_test.js) with events on" };
} catch (e) {
  styles.mixed = { error: String(e).slice(0, 200) };
}

// ---------------------------------------------------------------------------
// 3. Progression: buy the cheapest next upgrade as soon as it is affordable.
// ---------------------------------------------------------------------------
function progression(perMinute, scaledShare) {
  const lv = { speed: 0, acceleration: 0, impact: 0 };
  const price = (tier) => Math.round((({ speed: 100, acceleration: 120, impact: 150 })[tier] * Math.pow(({ speed: 1.18, acceleration: 1.18, impact: 1.17 })[tier], lv[tier])) / 5) * 5;
  const mult = (n) => (n >= 12 ? 2.5 : n >= 9 ? 2.1 : n >= 6 ? 1.7 : n >= 3 ? 1.35 : 1);
  let cash = 0, bought = 0, t = 0;
  const marks = {};
  while (t < 600 && bought < 12) {
    t += 1 / 6; // 10 s steps
    cash += (perMinute / 6) * (1 - scaledShare + scaledShare * mult(bought));
    for (;;) {
      const tier = ["speed", "acceleration", "impact"].sort((a, b) => price(a) - price(b))[0];
      if (cash < price(tier)) break;
      cash -= price(tier);
      lv[tier]++;
      bought++;
      if ([3, 6, 12].includes(bought)) marks["upgrades" + bought] = +t.toFixed(1);
    }
  }
  return marks;
}
// Check the price formula used above against the game.
const priceCheck = tables.prices.speed[3] === Math.round((100 * Math.pow(1.18, 3)) / 5) * 5;
const progress = {};
for (const [name, s] of Object.entries(styles)) {
  if (!s.perMinute) continue;
  const scaled = name === "activities" || name === "events" ? 1 : name === "mixed" && s.bySource ? ((s.bySource.activities || 0) + (s.bySource.events || 0)) / Math.max(1, s.perMinute) : 0;
  progress[name] = progression(s.perMinute, scaled);
}

const report = { minutesPerStyle: minutes, seed, tables, stylesPerMinute: styles, minutesToAfford: progress, priceFormulaMatchesGame: priceCheck };
console.log(JSON.stringify(report, null, 2));
