// Headless smoke test. Boots the game in jsdom with a stubbed WebGL/2D context,
// drives the car for a few hundred frames and checks that nothing throws or goes NaN.
//
// Setup (once):   npm install jsdom
// Run:            node tools/smoke_test.js
//
// This does NOT check how the game looks. It only proves the code loads in order,
// runs, and that the physics state stays sane. Always run it before handing work off.

const { JSDOM } = require("jsdom");
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// Load order comes straight from index.html so there is only one list to maintain.
const html = read("index.html");
const listMatch = html.match(/const SCRIPTS=(\[[^\]]*\])/);
if (!listMatch) throw new Error("Could not find the SCRIPTS list in index.html");
const SCRIPTS = JSON.parse(listMatch[1]);

const dom = new JSDOM(html.replace(/<script>[\s\S]*<\/script>/, ""), {
  runScripts: "outside-only",
});
const w = dom.window;
const ctx = dom.getInternalVMContext();

const stub = () =>
  new Proxy(function () {}, {
    get(_t, p) {
      if (typeof p === "symbol") return undefined;
      if (p === "canvas") return null;
      if (/^[A-Z_0-9]+$/.test(p)) return 1;
      if (/Location$/.test(p)) return () => 0;
      if (p === "createLinearGradient" || p === "createRadialGradient")
        return () => ({ addColorStop() {} });
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
Object.defineProperty(w.HTMLElement.prototype, "clientWidth", { get: () => 1280 });
Object.defineProperty(w.HTMLElement.prototype, "clientHeight", { get: () => 720 });
const queue = [];
w.requestAnimationFrame = (cb) => queue.push(cb);

const meta = JSON.parse(read("assets/vehicle_meshes.json"));
const bin = fs.readFileSync(path.join(root, "assets/vehicle_meshes.bin"));
const buf = new w.ArrayBuffer(bin.length);
new Uint8Array(buf).set(bin);
w.FREE_ROAM_VEHICLE_ASSETS = { meta, buffer: buf };

const run = (src, name) => new vm.Script(src, { filename: name }).runInContext(ctx);
let uncaught = null;
w.addEventListener("error", (e) => (uncaught = e.error || e.message));

// Deterministic Math.random so runs are repeatable.
run("Math.random=(()=>{let s=1;return()=>(s=(s*16807)%2147483647)/2147483647})()", "seed");
for (const name of SCRIPTS) run(read(`src/${name}.js`), `src/${name}.js`);

w.document.getElementById("startbtn").click();
const key = (type, k, code) => w.dispatchEvent(new w.KeyboardEvent(type, { key: k, code }));
const start = JSON.parse(run("JSON.stringify({x:controlled.x,z:controlled.z})", "q"));
key("keydown", "w", "KeyW");
let t = 0;
for (let i = 0; i < 400; i++) {
  if (i === 120) key("keydown", "d", "KeyD");
  if (i === 200) key("keyup", "d", "KeyD");
  t += 16.7;
  queue.splice(0).forEach((cb) => cb(t));
}
const end = JSON.parse(
  run(
    "JSON.stringify({x:controlled.x,z:controlled.z,yaw:controlled.yaw,cash:cash,vehicles:vehicles.length})",
    "q",
  ),
);

const failures = [];
if (uncaught) failures.push("Uncaught error: " + uncaught);
if (![end.x, end.z, end.yaw].every(Number.isFinite)) failures.push("Car state is not finite");
if (Math.hypot(end.x - start.x, end.z - start.z) < 1) failures.push("Car did not move");
if (end.vehicles < 1) failures.push("No vehicles exist");

// ---- Activity checks (src/activities.js) ----
const get = (expr) => JSON.parse(run("JSON.stringify(" + expr + ")", "q"));
const step = (n) => {
  for (let i = 0; i < n; i++) {
    t += 16.7;
    queue.splice(0).forEach((cb) => cb(t));
  }
};
const teleport = (p) =>
  run(`controlled.x=${p.x};controlled.z=${p.z};controlled.vx=0;controlled.vz=0;`, "tp");

const trafficProblems = get(`(() => {
  const problems = [];
  if (trafficFleet.length !== 12) problems.push("Expected 12 persistent traffic cars, got " + trafficFleet.length);
  if (vehicles.filter((v) => v.ai).length !== 12) problems.push("Traffic fleet changed the total AI vehicle count");
  if (trafficFleet.some((v) => !vehicles.includes(v))) problems.push("A traffic car is not part of the persistent vehicle list");
  if (trafficFleet.some((v) => v.route !== "grid" || !v.trafficLeg))
    problems.push("A traffic car is not using the intersection grid controller");
  const startEdges = new Set(trafficFleet.map((v) => v.trafficStartEdgeKey));
  if (startEdges.size !== 12) problems.push("Starting road segments are not unique");
  let startRegions = 0;
  for (const v of trafficFleet) startRegions |= v.trafficStartRegionMask;
  if (startRegions !== 15) problems.push("Seeded starting positions do not cover all four city quadrants");
  const validIndex = (i) => Number.isInteger(i) && i >= 0 && i < streetLines.length;
  for (const v of trafficFleet) {
    if (!validIndex(v.trafficStartXIndex) || !validIndex(v.trafficStartZIndex))
      problems.push(v.id + ": starting node is outside the street grid");
    if (!Number.isInteger(v.trafficSeed) || v.trafficSeed === 0)
      problems.push(v.id + ": missing deterministic traffic seed");
    if (!Number.isFinite(v.trafficLeg.length) || v.trafficLeg.length <= 0)
      problems.push(v.id + ": invalid traffic leg length");
    const h = TRAFFIC_HEADINGS[v.trafficHeading];
    const delta = (v.trafficLeg.nextHeading - v.trafficHeading + 4) % 4;
    if (delta === 2) problems.push(v.id + ": traffic attempted an immediate U-turn");
    if (
      v.trafficLeg.nextXIndex !== v.trafficNodeXIndex + h.dx ||
      v.trafficLeg.nextZIndex !== v.trafficNodeZIndex + h.dz ||
      !validIndex(v.trafficLeg.nextXIndex) ||
      !validIndex(v.trafficLeg.nextZIndex)
    )
      problems.push(v.id + ": planned leg does not lead to an adjacent legal intersection");
    for (const p of v.trafficLeg.samples) {
      const nearX = Math.min(...streetLines.map((line) => Math.abs(line - p.x)));
      const nearZ = Math.min(...streetLines.map((line) => Math.abs(line - p.z)));
      if (Math.min(nearX, nearZ) > ROAD_WIDTH / 2 + 0.1) {
        problems.push(v.id + ": planned line/turn path leaves the road and intersection footprint");
        break;
      }
    }
  }
  return problems;
})()`);
for (const problem of trafficProblems) failures.push("Traffic grid: " + problem);
key("keyup", "w", "KeyW");
for (const problem of get("validateActivityDefs()")) failures.push("Activity data: " + problem);
step(300);
const offer = get("currentActivity && {id:currentActivity.def.id, phase:currentActivity.phase}");
if (!offer || offer.phase !== "offer") {
  failures.push("No delivery offer is available");
} else {
  const def = get(`activityDefs.find(d=>d.id==="${offer.id}")`);
  const cash0 = get("cash");
  step(60);
  if (get("cash") !== cash0 || get("currentActivity && currentActivity.phase") !== "offer")
    failures.push("An ignored offer changed the game state");
  // On foot does not pick up a parcel.
  run("onFoot=true;player.x=" + def.pickup.x + ";player.z=" + def.pickup.z, "foot");
  step(5);
  if (get("currentActivity && currentActivity.phase") !== "offer")
    failures.push("On-foot player triggered the pickup");
  run("onFoot=false", "foot");
  // Pickup, then leave the area: no penalty and still carrying.
  teleport(def.pickup);
  step(3);
  if (get("currentActivity && currentActivity.phase") !== "carrying")
    failures.push("Pickup did not start the delivery");
  teleport({ x: 0, z: 0 });
  step(30);
  if (get("currentActivity && currentActivity.phase") !== "carrying" || get("cash") !== cash0)
    failures.push("Leaving the pickup area changed the delivery or cash");
  // Drop-off pays exactly once.
  teleport(def.dropoff);
  step(3);
  if (get("cash") !== cash0 + def.payout)
    failures.push("Payout wrong: expected " + (cash0 + def.payout) + ", got " + get("cash"));
  if (get("currentActivity") !== null) failures.push("Activity still active after completion");
  step(10);
  if (get("cash") !== cash0 + def.payout) failures.push("Payout was paid more than once");
  // Another offer appears without reloading, and it can be skipped with no penalty.
  step(200);
  const next = get("currentActivity && {id:currentActivity.def.id, phase:currentActivity.phase}");
  if (!next || next.phase !== "offer" || next.id === offer.id)
    failures.push("A new, different offer did not appear after completion");
  run("skipActivity()", "skip");
  if (get("currentActivity") !== null) failures.push("Skip did not clear the activity");
  step(60);
  if (get("currentActivity === null")) failures.push("No offer appeared after skipping");
  if (get("cash") !== cash0 + def.payout) failures.push("Skipping changed cash");
}

// Traffic should make intersection decisions, turn, and travel across the city grid.
const trafficBefore = get(`trafficFleet.map((v) => ({
  x:v.x,z:v.z,yaw:v.yaw,progress:v.trafficProgress,
  turns:v.trafficTurnCount,nodes:v.trafficVisitedNodeCount,regions:v.trafficRegionMask
}))`);
step(180 * 60);
const trafficAfter = get(`trafficFleet.map((v) => ({
  id:v.id,x:v.x,z:v.z,yaw:v.yaw,progress:v.trafficProgress,
  turns:v.trafficTurnCount,nodes:v.trafficVisitedNodeCount,regions:v.trafficRegionMask,
  legSamples:v.trafficLeg.samples
}))`);
let regionalCrossers = 0;
let totalTrafficTurns = 0;
for (let i = 0; i < trafficAfter.length; i++) {
  const car = trafficAfter[i];
  if (![car.x, car.z, car.yaw, car.progress].every(Number.isFinite))
    failures.push("Traffic runtime: " + car.id + " has non-finite state");
  if (car.nodes - trafficBefore[i].nodes < 6)
    failures.push("Traffic runtime: " + car.id + " did not travel through enough intersections");
  if (car.turns <= trafficBefore[i].turns)
    failures.push("Traffic runtime: " + car.id + " never turned at an intersection");
  if ((car.regions & (car.regions - 1)) !== 0) regionalCrossers++;
  totalTrafficTurns += car.turns - trafficBefore[i].turns;
  for (const p of car.legSamples) {
    const nearX = get("Math.min(...streetLines.map(line => Math.abs(line-" + p.x + ")))");
    const nearZ = get("Math.min(...streetLines.map(line => Math.abs(line-" + p.z + ")))");
    if (Math.min(nearX, nearZ) > ROAD_WIDTH / 2 + 0.1) {
      failures.push("Traffic runtime: " + car.id + " planned a path outside the road footprint");
      break;
    }
  }
}
if (regionalCrossers < 8)
  failures.push("Traffic runtime: only " + regionalCrossers + " cars crossed into another city quadrant");
if (totalTrafficTurns < 24)
  failures.push("Traffic runtime: too few intersection turns were made (" + totalTrafficTurns + ")");

// Simulate a collision knockback and verify that the existing soft recovery still works.
const recoverySetup = get(`(() => {
  const v = trafficFleet[0];
  const p = trafficLegPoint(v.trafficLeg, Math.min(v.trafficProgress, v.trafficLeg.length));
  const rightX = Math.cos(p.yaw), rightZ = -Math.sin(p.yaw);
  v.x = p.x + rightX * 8;
  v.z = p.z + rightZ * 8;
  v.vx = 0;
  v.vz = 0;
  v.aiKnockTime = 2;
  return {id:v.id, initialOffset:8};
})()`);
step(240);
const recoveryLateralError = get(`(() => {
  const v = trafficFleet[0];
  const p = trafficLegPoint(v.trafficLeg, Math.min(v.trafficProgress, v.trafficLeg.length));
  const rightX = Math.cos(p.yaw), rightZ = -Math.sin(p.yaw);
  return Math.abs((v.x - p.x) * rightX + (v.z - p.z) * rightZ);
})()`);
if (!Number.isFinite(recoveryLateralError) || recoveryLateralError > recoverySetup.initialOffset * 0.5)
  failures.push("Traffic recovery: " + recoverySetup.id + " did not return toward its lane after knockback");

// ---- Ramp geometry and ramp shadow checks ----
const geometryProblems = get(`(() => {
  const problems = [];
  const d = worldB.data; // 12 floats per vertex, 3 vertices per triangle
  const key = (y, z) => y.toFixed(3) + "," + z.toFixed(3);
  for (const r of allRamps) {
    const walls = {};
    for (const [name, edge] of [["left", r.x - r.halfWidth], ["right", r.x + r.halfWidth]]) {
      walls[name] = new Set();
      for (let i = 0; i + 35 < d.length; i += 36) {
        if (![0, 12, 24].every((o) => Math.abs(d[i + o] - edge) < 1e-4)) continue;
        for (const o of [0, 12, 24]) {
          const y = d[i + o + 1], z = d[i + o + 2];
          if (z < r.startZ - 1e-3 || z > r.endZ + 1e-3) continue;
          walls[name].add(key(y, z));
          const zc = Math.min(Math.max(z, r.startZ + 0.001), r.endZ - 0.001);
          if (y > profileForRamp(r, r.x, zc) + 0.1)
            problems.push(r.id + " " + name + " wall rises above its deck at z=" + z.toFixed(2) + " (y=" + y.toFixed(2) + ")");
        }
      }
    }
    for (const k of walls.left) if (!walls.right.has(k)) problems.push(r.id + ": right wall is missing vertex " + k);
    for (const k of walls.right) if (!walls.left.has(k)) problems.push(r.id + ": left wall is missing vertex " + k);
  }
  // Shadows on ramps must stay above the surface they fall on (deck, tuning pad and its stripes).
  const surface = (x, z) => {
    let y = driveSurfaceH(x, z) - 0.005;
    if (Math.abs(x - upgradeRamp.x) <= 3.85 && z >= 31.2 && z <= 37.2)
      y = terrainH(x, z) + rampProfile(x, z) + 0.215;
    return y;
  };
  const spots = [[upgradeRamp.x, 34.2, 0], [upgradeRamp.x, 34.2, 0.7]];
  for (const r of allRamps)
    for (const z of [r.startZ + 1, r.crestZ, (r.crestZ + r.flatEndZ) / 2, r.flatEndZ, r.endZ - 1])
      for (const dx of [0, r.halfWidth * 0.6])
        for (const yaw of [0, 0.7]) spots.push([r.x + dx, z, yaw]);
  let worst = 0, bad = 0, total = 0;
  for (const [x, z, yaw] of spots) {
    const out = [];
    appendShadowCaster(out, { x, z, hw: 1.1, hl: 2.5, yaw, height: 2.25, alpha: 0.32, useDriveSurface: true });
    for (let i = 0; i + 11 < out.length; i += 12) {
      const P = [0, 1, 2].map((k) => ({ x: out[i + k * 4], y: out[i + k * 4 + 1], z: out[i + k * 4 + 2] }));
      const w = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]];
      for (const [a, b, c] of w) {
        const px = P[0].x * a + P[1].x * b + P[2].x * c, pz = P[0].z * a + P[1].z * b + P[2].z * c;
        const py = P[0].y * a + P[1].y * b + P[2].y * c;
        // A shadow straddling a ramp's vertical side wall cannot be exact; skip that thin band.
        if (
          allRamps.some(
            (r) =>
              pz >= r.startZ - 1 &&
              pz <= r.endZ + 1 &&
              Math.abs(Math.abs(px - r.x) - r.halfWidth) < 1.0,
          )
        )
          continue;
        total++;
        const gap = py - surface(px, pz);
        if (gap < -0.01) { bad++; worst = Math.min(worst, gap); }
      }
    }
  }
  if (bad) problems.push("Ramp shadows dip below the surface at " + bad + " of " + total + " sample points (worst " + worst.toFixed(3) + ")");
  return problems;
})()`);
for (const problem of geometryProblems) failures.push("Geometry: " + problem);

if (failures.length) {
  console.error("SMOKE TEST FAILED\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("SMOKE TEST PASSED", JSON.stringify(end));
