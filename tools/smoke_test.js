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

// ---- Smashable prop regression: pushing must not count as repeated impacts ----
const smashRegression = JSON.parse(run(`(() => {
  const p = {type:"barrel",hp:5,broken:false,x:0,y:0,z:0,vx:0,vz:0};
  const rammer = {id:"smash-regression",impactMultiplier:1};
  props.push(p);
  beginPropCollisionFrame();
  registerPropImpact(p,rammer,8);
  finishPropCollisionFrame(1/60);
  const afterFirstHit = p.hp;
  beginPropCollisionFrame();
  registerPropImpact(p,rammer,8);
  finishPropCollisionFrame(1/60);
  const afterSustainedContact = p.hp;
  // A brief gap is still part of the same shove; require a real disengagement.
  for (let i = 0; i < 10; i++) {
    beginPropCollisionFrame();
    finishPropCollisionFrame(1/60);
  }
  const afterBriefSeparation = p.hp;
  for (let i = 0; i < 20; i++) {
    beginPropCollisionFrame();
    finishPropCollisionFrame(1/60);
  }
  beginPropCollisionFrame();
  registerPropImpact(p,rammer,8);
  finishPropCollisionFrame(1/60);
  const result = {afterFirstHit,afterSustainedContact,afterBriefSeparation,broken:p.broken};
  props.splice(props.indexOf(p),1);
  return JSON.stringify(result);
})()`, "smashable-prop-regression"));
if (!(smashRegression.afterFirstHit < 5 &&
      smashRegression.afterSustainedContact === smashRegression.afterFirstHit &&
      smashRegression.afterBriefSeparation === smashRegression.afterFirstHit &&
      smashRegression.broken))
  failures.push("Smashable props: sustained pushing applied repeated damage or a fresh impact failed to break the barrel");

// Prop collisions must not create crash-bonus income without destroying the prop.
const propRewardRegression = JSON.parse(run(`(() => {
  const previous = currentCrashContacts;
  const before = cash;
  currentCrashContacts = new Set();
  registerCrashReward("prop:smash-regression:999", 2.8);
  registerCrashReward("trailer-prop:smash-regression:999", 2.8);
  const after = cash;
  currentCrashContacts = previous;
  return JSON.stringify({before,after});
})()`, "prop-reward-regression"));
if (propRewardRegression.after !== propRewardRegression.before)
  failures.push("Smashable props: prop contact paid crash-bonus cash without breaking the prop");


// ---- T-012 HUD and touch-input checks ----
const profileButton = w.document.getElementById("profileToggle");
if (!w.document.body.classList.contains("hud-desktop"))
  failures.push("HUD profile: Auto did not select desktop in the wide, fine-pointer test viewport");
profileButton.click(); // Auto -> Desktop
if (!w.document.body.classList.contains("hud-desktop"))
  failures.push("HUD profile: Desktop override did not apply");
profileButton.click(); // Desktop -> Mobile
if (!w.document.body.classList.contains("hud-mobile"))
  failures.push("HUD profile: Mobile override did not apply");
profileButton.click(); // Mobile -> Auto
if (!w.document.body.classList.contains("hud-desktop"))
  failures.push("HUD profile: returning to Auto did not re-detect the desktop viewport");

// Releasing a swipe must not cancel a brake button held by another finger.
run("touch.brake=true; swipeTouch.brake=true; releaseSwipe()", "touch-source-check");
if (run("pressed('brake')", "touch-check") !== true)
  failures.push("Touch input: releasing swipe input cleared a still-held brake button");
run("touch.brake=false; swipeTouch.brake=false", "touch-source-reset");

// T-012 fixed-orientation map and startup-only lighting checks.
const mapProjection = JSON.parse(run(
  "JSON.stringify({right:mapProjectPoint(10,0,{x:0,z:0},1,100,100),forward:mapProjectPoint(0,10,{x:0,z:0},1,100,100),leftTurn:mapHeadingScreenAngle(Math.PI/2)})",
  "map-projection"
));
if (mapProjection.right[0] >= 50)
  failures.push("HUD map: positive world X should appear to screen-left, matching the chase-camera view");
if (mapProjection.forward[1] >= 50)
  failures.push("HUD map: positive world Z should remain toward the top on the fixed map");
if (mapProjection.leftTurn >= 0)
  failures.push("HUD map: a positive/left vehicle turn should rotate its arrow toward screen-left");
const lightingButton = w.document.getElementById("lightingToggle");
if (!lightingButton || !lightingButton.closest("#startcard"))
  failures.push("HUD: PBR lighting control is not on the startup screen");
if (w.document.getElementById("dashboard").contains(lightingButton))
  failures.push("HUD: PBR lighting control is still present in the driving dashboard");
if (!w.document.getElementById("speedGauge"))
  failures.push("HUD: analog/digital speed gauge markup is missing");
if (run("updateSpeedGauge(null, 0.5) === false", "missing-gauge-check") !== true)
  failures.push("HUD: a missing optional speed gauge should not throw");

// T-013 compact dashboard structure and objective placement.
const dashboard = w.document.getElementById("dashboard");
const dashCenter = w.document.querySelector("#dashboard .dash-center");
const activityPanel = w.document.getElementById("activity");
const mapBox = w.document.getElementById("mapbox");
if (!dashboard || !dashCenter || !activityPanel || !mapBox || !dashboard.contains(activityPanel))
  failures.push("HUD: objective panel is not integrated into the dashboard");
if (activityPanel.parentElement !== dashCenter || dashCenter.children[0] !== mapBox || dashCenter.children[1] !== activityPanel)
  failures.push("HUD: minimap and objective details must be side by side, with map first");
const hudStyles = Array.from(w.document.querySelectorAll("style")).map((style) => style.textContent).join("\n");
if (!hudStyles.includes("grid-template-columns:minmax(96px,.9fr) minmax(120px,1.1fr);") || !hudStyles.includes("grid-template-rows:54px;"))
  failures.push("HUD: desktop side-by-side map/objective dimensions are missing");
if (!hudStyles.includes("grid-template-columns:minmax(64px,.9fr) minmax(88px,1.1fr);") || !hudStyles.includes("grid-template-rows:48px;"))
  failures.push("HUD: mobile side-by-side map/objective dimensions are missing");
if (!hudStyles.includes("#dashboard #activity.show{display:grid}"))
  failures.push("HUD: active objective panel is not restored when an activity is available");
if (!hudStyles.includes("width:100%;") || !hudStyles.includes("height:54px;"))
  failures.push("HUD: minimap is not sized to fill its larger dashboard column");
if (![end.x, end.z, end.yaw].every(Number.isFinite)) failures.push("Car state is not finite");
if (Math.hypot(end.x - start.x, end.z - start.z) < 1) failures.push("Car did not move");
if (end.vehicles < 1) failures.push("No vehicles exist");
if (run("started", "q") !== true)
  failures.push("Frame loop: the game stopped during the initial driving frames");
if (w.document.getElementById("map").width < 1 || w.document.getElementById("map").height < 1)
  failures.push("HUD: minimap canvas has an invalid backing size");

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
  if (trafficFleet.length !== 24) problems.push("Expected 24 persistent traffic vehicles, got " + trafficFleet.length);
  if (vehicles.filter((v) => v.ai).length !== 24) problems.push("Traffic fleet changed the total AI vehicle count");
  if (trafficFleet.filter((v) => v.type !== "pickup").length !== 12)
    problems.push("Expected 12 compact-car traffic vehicles");
  if (trafficFleet.filter((v) => v.type === "pickup").length !== 12)
    problems.push("Expected 12 pickup-truck traffic vehicles");
  if (trafficFleet.some((v) => !vehicles.includes(v))) problems.push("A traffic vehicle is not part of the persistent vehicle list");
  if (trafficFleet.some((v) => v.route !== "grid" || !v.trafficLeg))
    problems.push("A traffic vehicle is not using the intersection grid controller");
  const startEdges = new Set(trafficFleet.map((v) => v.trafficStartEdgeKey));
  if (startEdges.size !== 24) problems.push("Starting road segments are not unique");
  let startRegions = 0;
  for (const v of trafficFleet) startRegions |= v.trafficStartRegionMask;
  if (startRegions !== 15) problems.push("Seeded starting positions do not cover all four city quadrants");
  const pickupTraffic = trafficFleet.filter((v) => v.type === "pickup");
  const compactTraffic = trafficFleet.filter((v) => v.type !== "pickup");
  if (new Set(pickupTraffic.map((v) => v.name)).size < 4 ||
      new Set(pickupTraffic.map((v) => v.model)).size < 4)
    problems.push("Pickup traffic does not use all four paint/model variants");
  // Top speeds are a base speed per type plus a random offset of up to 5 mph either way.
  if (Math.max(...pickupTraffic.map((v) => v.trafficBaseSpeed)) >=
      Math.min(...compactTraffic.map((v) => v.trafficBaseSpeed)))
    problems.push("Pickup traffic base speeds are not slower than compact-car base speeds");
  const avgSpeed = (list) => list.reduce((sum, v) => sum + v.maxSpeed, 0) / list.length;
  if (avgSpeed(pickupTraffic) >= avgSpeed(compactTraffic))
    problems.push("Pickup traffic is not slower on average than compact-car traffic");
  const speedLimit = 5 / MPH_PER_MS + 1e-9;
  for (const v of trafficFleet)
    if (Math.abs(v.maxSpeed - v.trafficBaseSpeed) > speedLimit)
      problems.push(v.id + ": top speed is more than 5 mph away from its base speed");
  if (trafficFleet.filter((v) => Math.abs(v.maxSpeed - v.trafficBaseSpeed) > 0.05).length < 22)
    problems.push("Traffic top speeds are not varied");
  const validIndex = (i) => Number.isInteger(i) && i >= 0 && i < streetLines.length;
  for (const v of trafficFleet) {
    if (!validIndex(v.trafficStartXIndex) || !validIndex(v.trafficStartZIndex))
      problems.push(v.id + ": starting node is outside the street grid");
    if (!Number.isInteger(v.trafficSeed) || v.trafficSeed === 0)
      problems.push(v.id + ": missing deterministic traffic seed");
    if (!Number.isFinite(v.trafficLeg.length) || v.trafficLeg.length <= 0)
      problems.push(v.id + ": invalid traffic leg length");
    if (v.type === "pickup" && (v.width < 2 || v.length < 5))
      problems.push(v.id + ": pickup traffic is missing its larger vehicle footprint");
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

    // Check the complete oriented vehicle rectangle at every route sample. This catches
    // pickups whose body could leave the road even when the route centerline stays on it.
    const samples = v.trafficLeg.samples;
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      const previous = samples[Math.max(0, i - 1)];
      const next = samples[Math.min(samples.length - 1, i + 1)];
      const yaw = Math.atan2(next.x - previous.x, next.z - previous.z);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      for (const forwardSign of [-1, 1]) {
        for (const sideSign of [-1, 1]) {
          const x = p.x + forwardSign * v.length * 0.5 * fx + sideSign * v.width * 0.5 * rx;
          const z = p.z + forwardSign * v.length * 0.5 * fz + sideSign * v.width * 0.5 * rz;
          const nearX = Math.min(...streetLines.map((line) => Math.abs(line - x)));
          const nearZ = Math.min(...streetLines.map((line) => Math.abs(line - z)));
          if (Math.min(nearX, nearZ) > ROAD_WIDTH / 2 + 0.1) {
            problems.push(v.id + ": vehicle body leaves the road/intersection footprint");
            break;
          }
        }
      }
    }
  }
  // Exercise every left/right turn orientation with the full pickup-truck footprint,
  // even if a particular orientation is not selected by the 24 live starting routes.
  const seedForRoll = (minimum, maximum) => {
    for (let seed = 1; seed < 10000; seed++) {
      const nextSeed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const roll = nextSeed / 4294967296;
      if (roll >= minimum && roll < maximum) return seed;
    }
    return 0;
  };
  for (let heading = 0; heading < 4; heading++) {
    for (const turn of [
      {name:"left", next:(heading + 3) % 4, min:0.56, max:0.78},
      {name:"right", next:(heading + 1) % 4, min:0.78, max:1.0},
    ]) {
      const fakeVehicle = {
        trafficHeading: heading,
        trafficNodeXIndex: 3,
        trafficNodeZIndex: 3,
        trafficLane: TRAFFIC_LANE_OFFSET,
        trafficExitOffset: 0,
        trafficSeed: seedForRoll(turn.min, turn.max),
        trafficDecisionCount: 0,
      };
      const leg = trafficBuildLeg(fakeVehicle);
      if (leg.nextHeading !== turn.next)
        problems.push("Pickup clearance fixture failed to build the " + turn.name + " turn for heading " + heading);
      const samples = leg.samples;
      for (let i = 0; i < samples.length; i++) {
        const p = samples[i];
        const previous = samples[Math.max(0, i - 1)];
        const next = samples[Math.min(samples.length - 1, i + 1)];
        const yaw = Math.atan2(next.x - previous.x, next.z - previous.z);
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        for (const forwardSign of [-1, 1]) {
          for (const sideSign of [-1, 1]) {
            const x = p.x + forwardSign * 5.0 * 0.5 * fx + sideSign * 2.0 * 0.5 * rx;
            const z = p.z + forwardSign * 5.0 * 0.5 * fz + sideSign * 2.0 * 0.5 * rz;
            const nearX = Math.min(...streetLines.map((line) => Math.abs(line - x)));
            const nearZ = Math.min(...streetLines.map((line) => Math.abs(line - z)));
            if (Math.min(nearX, nearZ) > ROAD_WIDTH / 2 + 0.1) {
              problems.push("5-by-2 pickup body leaves the road during " + turn.name + " turn at heading " + heading);
              break;
            }
          }
        }
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

// Traffic should make intersection decisions, turn, and travel across the city grid over two simulated minutes.
const trafficBefore = get(`trafficFleet.map((v) => ({
  x:v.x,z:v.z,yaw:v.yaw,progress:v.trafficProgress,
  turns:v.trafficTurnCount,nodes:v.trafficVisitedNodeCount,regions:v.trafficRegionMask
}))`);
step(120 * 60);
const trafficAfter = get(`trafficFleet.map((v) => ({
  id:v.id,x:v.x,z:v.z,yaw:v.yaw,progress:v.trafficProgress,
  turns:v.trafficTurnCount,nodes:v.trafficVisitedNodeCount,regions:v.trafficRegionMask,
  maxRoadOffset:Math.max(...v.trafficLeg.samples.map(p => Math.min(
    ...streetLines.map(line => Math.abs(line-p.x)),
    ...streetLines.map(line => Math.abs(line-p.z))
  )))
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
  if (!Number.isFinite(car.maxRoadOffset) || car.maxRoadOffset > get("ROAD_WIDTH") / 2 + 0.1)
    failures.push("Traffic runtime: " + car.id + " planned a path outside the road footprint");
}
if (regionalCrossers < 16)
  failures.push(
    "Traffic runtime: only " + regionalCrossers + " vehicles crossed into another city quadrant",
  );
if (totalTrafficTurns < 48)
  failures.push(
    "Traffic runtime: too few intersection turns were made (" + totalTrafficTurns + ")",
  );

// Simulate a collision knockback for both classes and verify the shared soft recovery.
const recoverySetup = get(`(() => {
  const targets = [trafficFleet[0], trafficFleet.find((v) => v.type === "pickup")];
  return targets.map((v) => {
    const p = trafficLegPoint(v.trafficLeg, Math.min(v.trafficProgress, v.trafficLeg.length));
    const rightX = Math.cos(p.yaw), rightZ = -Math.sin(p.yaw);
    v.x = p.x + rightX * 8;
    v.z = p.z + rightZ * 8;
    v.vx = 0;
    v.vz = 0;
    v.aiKnockTime = 2;
    return {id:v.id, initialOffset:8};
  });
})()`);
step(240);
const recoveryLateralErrors =
  get(`[trafficFleet[0], trafficFleet.find((v) => v.type === "pickup")].map((v) => {
  const p = trafficLegPoint(v.trafficLeg, Math.min(v.trafficProgress, v.trafficLeg.length));
  const rightX = Math.cos(p.yaw), rightZ = -Math.sin(p.yaw);
  return Math.abs((v.x - p.x) * rightX + (v.z - p.z) * rightZ);
})`);
for (let i = 0; i < recoverySetup.length; i++) {
  if (
    !Number.isFinite(recoveryLateralErrors[i]) ||
    recoveryLateralErrors[i] > recoverySetup[i].initialOffset * 0.5
  )
    failures.push(
      "Traffic recovery: " +
        recoverySetup[i].id +
        " did not return toward its lane after knockback",
    );
}

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

// ---- Traffic following check: a fast car behind a slow car must not run into it ----
const followResult = get(`(() => {
  const fleet = trafficFleet;
  const leader = fleet.reduce((a, b) => (b.maxSpeed < a.maxSpeed ? b : a));
  const follower = fleet.reduce((a, b) => (b.maxSpeed > a.maxSpeed ? b : a));
  // Let the leader run until it is early on a long leg, so nothing odd happens in the next 8 s.
  let guard = 0;
  while ((leader.trafficProgress < 12 || leader.trafficProgress > 20) && guard++ < 40000) updatePhysics(1 / 60);
  if (guard >= 40000) return { error: "leader never reached the test window" };
  // Copy the leader's route state onto the follower, 14 units behind, same lane, same speed as leader.
  for (const key of Object.keys(leader)) if (key.startsWith("traffic")) follower[key] = leader[key];
  follower.trafficProgress = leader.trafficProgress - 14;
  const point = trafficLegPoint(follower.trafficLeg, follower.trafficProgress);
  follower.x = point.x;
  follower.z = point.z;
  follower.yaw = leader.yaw;
  follower.vx = leader.vx;
  follower.vz = leader.vz;
  follower.aiKnockTime = 0;
  let minGap = 1e9, knocked = false;
  for (let i = 0; i < 450; i++) {
    updatePhysics(1 / 60);
    const fx = Math.sin(leader.yaw), fz = Math.cos(leader.yaw);
    const gap = (leader.x - follower.x) * fx + (leader.z - follower.z) * fz - (leader.length + follower.length) / 2;
    minGap = Math.min(minGap, gap);
    if (leader.aiKnockTime > 0 || follower.aiKnockTime > 0) knocked = true;
  }
  return {
    minGap: +minGap.toFixed(2),
    knocked,
    leaderSpeed: +Math.hypot(leader.vx, leader.vz).toFixed(2),
    followerSpeed: +Math.hypot(follower.vx, follower.vz).toFixed(2),
    followerMax: follower.maxSpeed,
    leaderMax: leader.maxSpeed,
  };
})()`);
if (followResult.error) failures.push("Traffic following: " + followResult.error);
else {
  if (followResult.knocked)
    failures.push(
      "Traffic following: the follower hit the leader (" + JSON.stringify(followResult) + ")",
    );
  if (followResult.minGap < 0.4)
    failures.push("Traffic following: bumper gap fell to " + followResult.minGap);
  if (followResult.followerSpeed > followResult.leaderMax + 1.2)
    failures.push(
      "Traffic following: follower is still speeding behind the leader (" +
        followResult.followerSpeed +
        ")",
    );
  if (followResult.followerSpeed < followResult.leaderSpeed - 2)
    failures.push(
      "Traffic following: follower stopped far behind the leader (" +
        followResult.followerSpeed +
        ")",
    );
}


// ---- Route weighting: a car held back by a slower car is less likely to take the same exit ----
const weightResult = get(`(() => {
  const share = (leaderLeg, streakBefore) => {
    // Share of "straight" exits chosen at an interior intersection (all three exits are legal).
    const f = { trafficSeed: 987654321, trafficLeader: leaderLeg ? { trafficLeg: leaderLeg } : null, trafficFollowStreak: streakBefore };
    let straight = 0;
    const N = 6000;
    for (let i = 0; i < N; i++) {
      f.trafficFollowStreak = streakBefore;
      if (trafficChooseNextHeading(f, 0, 3, 3) === 0) straight++;
    }
    return { share: straight / N, streak: f.trafficFollowStreak };
  };
  const straightLeg = { nextXIndex: 3, nextZIndex: 3, nextHeading: 0 };
  const otherNode = { nextXIndex: 4, nextZIndex: 3, nextHeading: 0 };
  const turnLeg = { nextXIndex: 3, nextZIndex: 3, nextHeading: 1 };
  return {
    free: share(null, 0).share,
    k1: share(straightLeg, 0).share,
    k2: share(straightLeg, 1).share,
    k3: share(straightLeg, 2).share,
    elsewhere: share(otherNode, 0),
    leaderTurns: share(turnLeg, 0).share,
    resetStreak: share(null, 4).streak,
    countedStreak: share(straightLeg, 4).streak,
  };
})()`);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
// Expected straight shares with weights 0.56 / 0.22 / 0.22: free 0.56, then 0.28, 0.14, 0.07 for the straight exit.
if (!near(weightResult.free, 0.56, 0.03)) failures.push("Route weights: free straight share is " + weightResult.free);
if (!near(weightResult.k1, 0.28 / 0.72, 0.03)) failures.push("Route weights: 1st intersection behind a slower car gave " + weightResult.k1);
if (!near(weightResult.k2, 0.14 / 0.58, 0.03)) failures.push("Route weights: 2nd intersection gave " + weightResult.k2);
if (!near(weightResult.k3, 0.07 / 0.51, 0.03)) failures.push("Route weights: 3rd intersection gave " + weightResult.k3);
if (!near(weightResult.elsewhere.share, 0.56, 0.03) || weightResult.elsewhere.streak !== 0)
  failures.push("Route weights: a leader heading to a different intersection changed the choice");
if (weightResult.leaderTurns < 0.56 + 0.05) failures.push("Route weights: straight should become MORE likely when the leader turns (" + weightResult.leaderTurns + ")");
if (weightResult.resetStreak !== 0) failures.push("Route weights: the streak did not reset when no car was in front");
if (weightResult.countedStreak !== 5) failures.push("Route weights: the streak did not count up behind a slower car");

if (failures.length) {
  console.error("SMOKE TEST FAILED\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("SMOKE TEST PASSED", JSON.stringify(end));
