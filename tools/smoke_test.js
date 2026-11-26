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
// Toybox Events are held off until their own checks near the end, so a random event cannot
// disturb the earlier activity and traffic checks. Those checks start events on purpose.
run("eventNextRollAt = Infinity;", "events-off");
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

// ---- Activity board (T-017): nothing starts on its own; driving onto a pad starts it ----
const actId = () => get("currentActivity && currentActivity.def.id");
const actPhase = () => get("currentActivity && currentActivity.phase");
const skipVisible = () => w.document.getElementById("activitySkip").style.visibility !== "hidden";
// The board (T-038) only has three live pads; put the pads a check needs on it first.
const onBoard = (...ids) => run(`activityBoard = ${JSON.stringify(ids)}; lastActivityHud = "";`, "board");
const boardInfo = () => get(`(() => { const d = activityBoardDefs(); let m = Infinity;
  for (let a = 0; a < d.length; a++) for (let b = a + 1; b < d.length; b++) { const p = activityStart(d[a]), q = activityStart(d[b]); m = Math.min(m, Math.hypot(p.x - q.x, p.z - q.z)); }
  return {ids: d.map(x => x.id), types: d.map(x => x.type).sort().join(","), spread: m}; })()`);
const defOf = (id) => get(`(() => { const d = activityDefs.find(q => q.id === "${id}"); return Object.assign({}, d, {startPad: activityStart(d)}); })()`);
// The leftover activity-free spot is the empty middle of the central block.
const idleSpot = { x: -12, z: -45 };
run("onFoot=false; controlled=playerCar;", "act-setup");
teleport(idleSpot);
step(300);
if (actId() !== null) failures.push("Activity board: an activity started without driving onto its pad");
const idleMarkers = get("activeMarkers()");
if (idleMarkers.length !== 3 || !idleMarkers.every((m) => m.start) || new Set(idleMarkers.map((m) => m.kind)).size !== 3)
  failures.push("Activity board: expected exactly three start pads on the map, one of each type");
if (idleMarkers.filter((m) => m.pin).length !== 3)
  failures.push("Activity board: expected the nearest pad of each of the 3 types to be pinned");
if (get("new Set(activityDefs.map(d => d.type)).size") !== 3)
  failures.push("Activity board: expected delivery, smash and stunt activities");
if (get("activityDefs.filter(d => d.type === 'delivery').length") < 15)
  failures.push("Deliveries: expected at least 15 delivery routes across the city");
const pickupQuadrants = get(`activityDefs.filter(d => d.type === "delivery").map(d => (d.pickup.x < 0 ? "W" : "E") + (d.pickup.z < 0 ? "S" : "N"))`);
if (new Set(pickupQuadrants).size !== 4) failures.push("Deliveries: pickups do not cover all four quadrants");
if (get("activityDefs.filter(d => d.type === 'delivery').some(d => Math.max(Math.abs(d.pickup.x), Math.abs(d.pickup.z)) > 250)") !== true)
  failures.push("Deliveries: no pickup reaches the outer districts");
step(2);
if (!activityPanel.classList.contains("show") || skipVisible())
  failures.push("Activity HUD: idle panel should point at the nearest pad with SKIP hidden");

// ---- T-038: the board draws one pad of each type, spread apart, and every pad gets a turn ----
if (boardInfo().types !== "delivery,smash,stunt") failures.push("Activity board: the first board is not one of each type");
const boardStats = get(`(() => { let minSpread = Infinity, spreadOk = 0, bad = 0; const seen = new Set();
  for (let i = 0; i < 600; i++) { drawActivityBoard(null); const d = activityBoardDefs();
    if (d.map(x => x.type).sort().join(",") !== "delivery,smash,stunt") bad++;
    d.forEach(x => seen.add(x.id)); let m = Infinity;
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) { const p = activityStart(d[a]), q = activityStart(d[b]); m = Math.min(m, Math.hypot(p.x - q.x, p.z - q.z)); }
    minSpread = Math.min(minSpread, m); if (m >= ACTIVITY_BOARD_SPACING) spreadOk++; }
  return {minSpread, spreadOk, bad, unseen: activityDefs.filter(d => !seen.has(d.id)).map(d => d.id)}; })()`);
if (boardStats.bad) failures.push("Activity board: " + boardStats.bad + " draws were not one of each type");
if (boardStats.minSpread < 120 || boardStats.spreadOk < 540)
  failures.push("Activity board: pads not spread apart (closest " + boardStats.minSpread.toFixed(0) + ", " + boardStats.spreadOk + "/600 at full spacing)");
if (boardStats.unseen.length) failures.push("Activity board: some pads never came up: " + boardStats.unseen.join(", "));
// The activity just played is never in the next board.
const excludedSeen = get(`(() => { let n = 0; for (let i = 0; i < 300; i++) { drawActivityBoard("stunt-west"); if (activityBoard.includes("stunt-west")) n++; } drawActivityBoard(null); return n; })()`);
if (excludedSeen) failures.push("Activity board: the activity just played came back in " + excludedSeen + " of 300 redraws");
// A pad that is not on the board does nothing.
const offBoard = get(`(() => { const d = activityDefs.find(q => !activityBoard.includes(q.id)); return activityStart(d); })()`);
teleport(offBoard);
step(5);
if (actId() !== null) failures.push("Activity board: a pad that is not on the board started an activity");
if (get("activeMarkers().some(m => Math.hypot(m.x - " + offBoard.x + ", m.z - " + offBoard.z + ") < 0.1)"))
  failures.push("Activity board: a pad that is not on the board is shown on the map");
teleport(idleSpot);
step(200);

// On foot never starts an activity.
const delivery1 = defOf("south-to-pink-house");
onBoard(delivery1.id, "smash-west");
run(`onFoot=true;player.x=${delivery1.pickup.x};player.z=${delivery1.pickup.z};`, "foot");
step(5);
if (actId() !== null) failures.push("Activity board: walking onto a pad started an activity");
run("onFoot=false;", "foot");
teleport(idleSpot);
step(3);

// ---- Delivery ----
let cash0 = get("cash");
onBoard(delivery1.id, "smash-west");
teleport(delivery1.pickup);
step(3);
if (actId() !== delivery1.id || actPhase() !== "carrying")
  failures.push("Delivery: driving onto the pickup did not start it");
step(2);
if (!skipVisible()) failures.push("Activity HUD: SKIP should be visible while an activity runs");
// Other pads are ignored while an activity runs, and the board hides them.
const otherPad = defOf("smash-west").startPad;
teleport(otherPad);
step(3);
if (actId() !== delivery1.id) failures.push("Activity board: a second pad replaced the running activity");
if (get("activeMarkers().some(m => m.start)")) failures.push("Activity board: start pads still shown during an activity");
teleport(idleSpot);
step(30);
if (actId() !== delivery1.id || get("cash") !== cash0)
  failures.push("Delivery: leaving the pickup area changed the delivery or cash");
teleport(delivery1.dropoff);
step(3);
if (get("cash") !== cash0 + delivery1.payout)
  failures.push("Delivery payout wrong: expected " + (cash0 + delivery1.payout) + ", got " + get("cash"));
if (actId() !== null) failures.push("Delivery: still active after completion");
step(10);
if (get("cash") !== cash0 + delivery1.payout) failures.push("Delivery: paid more than once");
const boardAfterFinish = boardInfo();
if (boardAfterFinish.types !== "delivery,smash,stunt" || boardAfterFinish.ids.includes(delivery1.id))
  failures.push("Activity board: finishing did not draw a fresh board without the finished activity");

// A pad entered during the short pause after a finish does not start, and waiting on it does
// not start it either. Driving off and back on does.
const delivery2 = defOf("cross-town-to-pink-house");
onBoard(delivery2.id);
teleport(delivery2.pickup);
step(3);
if (actId() !== null) failures.push("Activity board: a pad started during the pause after a finish");
step(240);
if (actId() !== null) failures.push("Activity board: sitting on a pad started it without driving onto it");
teleport(idleSpot);
step(2);
teleport(delivery2.pickup);
step(3);
if (actId() !== delivery2.id) failures.push("Activity board: re-entering a pad did not start it");
cash0 = get("cash");
run("skipActivity()", "skip");
step(2);
if (actId() !== null || get("cash") !== cash0) failures.push("Skip: did not clear the activity or changed cash");
const boardAfterSkip = boardInfo();
if (boardAfterSkip.types !== "delivery,smash,stunt" || boardAfterSkip.ids.includes(delivery2.id))
  failures.push("Activity board: skipping did not draw a fresh board without the skipped activity");
step(60);
if (actId() !== null) failures.push("Skip: an activity started again on its own");

// ---- Smash targets (T-018) ----
const smash = defOf("smash-northeast");
teleport(idleSpot);
step(60);
const propsBefore = get("props.length");
onBoard(smash.id);
teleport(smash.startPad);
step(3);
if (actId() !== smash.id || actPhase() !== "smashing") failures.push("Smash: driving onto the pad did not start it");
if (get("props.length") !== propsBefore + smash.targets.length)
  failures.push("Smash: expected " + smash.targets.length + " target props to appear");
if (get("activeMarkers().filter(m => m.kind === 'smashTarget').length") !== smash.targets.length)
  failures.push("Smash: every target should have a marker");
// Skipping removes the unbroken targets again.
run("skipActivity()", "skip");
step(2);
if (get("props.length") !== propsBefore) failures.push("Smash: skipping left target props behind");
teleport(idleSpot);
step(60);
onBoard(smash.id);
teleport(smash.startPad);
step(3);
teleport(idleSpot); // the car leaves so only the scripted breaks below damage the targets
cash0 = get("cash");
// One target is broken by traffic (it still counts, with no cash), the rest by the player.
run("currentActivity && currentActivity.targets && damageProp(currentActivity.targets[0], 60, trafficFleet[0]);", "smash");
step(2);
if (actId() !== smash.id) failures.push("Smash: finished before every target broke");
if (get("currentActivity && currentActivity.targets ? currentActivity.targets.filter(p => p.broken).length : -1") !== 1 || !/1 \/ 4/.test(w.document.getElementById("activityText").textContent))
  failures.push("Smash: progress did not count a broken target");
run("currentActivity && currentActivity.targets && currentActivity.targets.filter(p => !p.broken).slice(0, -1).forEach(p => damageProp(p, 60, controlled));", "smash");
step(2);
if (actId() !== smash.id) failures.push("Smash: finished with one target still standing");
run("if (currentActivity && currentActivity.targets) for (const p of currentActivity.targets) if (!p.broken) damageProp(p, 60, controlled);", "smash");
step(3);
const smashPropCash = 18 * (smash.targets.length - 1);
if (actId() !== null) failures.push("Smash: did not finish after every target broke");
if (get("cash") !== cash0 + smash.payout + smashPropCash)
  failures.push("Smash payout wrong: expected " + (cash0 + smash.payout + smashPropCash) + ", got " + get("cash"));
step(10);
if (get("cash") !== cash0 + smash.payout + smashPropCash) failures.push("Smash: paid more than once");

// ---- Stunt jump (T-018): real driving off the marked ramp ----
const stunt = defOf("stunt-north");
const stuntRamp = get(`allRamps.find(r => r.id === "${stunt.rampId}")`);
const driveToLanding = (maxFrames) => {
  let launched = false;
  for (let i = 0; i < maxFrames; i++) {
    step(1);
    const g = get("controlled.grounded");
    if (g === false) launched = true;
    if (launched && g !== false) return true;
  }
  return launched;
};
const aimAtRamp = (speed) =>
  run(`controlled.yaw=${stunt.startPad.z < stuntRamp.startZ ? 0 : Math.PI};controlled.yawRate=0;` +
      `controlled.vx=0;controlled.vz=${(stunt.startPad.z < stuntRamp.startZ ? 1 : -1) * speed};controlled.grounded=true;`, "aim");
teleport(idleSpot);
step(200);
onBoard(stunt.id);
teleport(stunt.startPad);
step(2);
if (actId() !== stunt.id || actPhase() !== "jumping") failures.push("Stunt: driving onto the pad did not start it");
// A slow roll over the ramp launches but does not stay up long enough. No penalty, keep trying.
cash0 = get("cash");
run(`controlled.x=${stuntRamp.x};controlled.z=${stunt.startPad.z < stuntRamp.startZ ? stuntRamp.crestZ - 0.8 : stuntRamp.flatEndZ + 0.8};controlled.y=driveSurfaceH(controlled.x,controlled.z)+0.04;`, "slow");
aimAtRamp(4);
if (!driveToLanding(240)) failures.push("Stunt: the slow test roll did not launch");
step(5);
if (actId() !== stunt.id || get("cash") > cash0 + 30)
  failures.push("Stunt: a slow roll should not finish the jump (airtime bonus aside)");
// Full throttle from the pad completes it.
teleport(stunt.startPad);
aimAtRamp(0);
cash0 = get("cash");
key("keydown", "w", "KeyW");
const landed = driveToLanding(400);
key("keyup", "w", "KeyW");
step(3);
if (!landed) failures.push("Stunt: full throttle from the pad did not reach the ramp");
if (actId() !== null) failures.push("Stunt: a full-speed jump off the marked ramp did not finish it");
const stuntGain = get("cash") - cash0;
if (stuntGain < stunt.payout || stuntGain > stunt.payout + 110)
  failures.push("Stunt payout wrong: gained " + stuntGain + ", expected the payout plus any airtime bonus");
step(10);
if (get("cash") - cash0 !== stuntGain) failures.push("Stunt: paid more than once");
// Jumping a different ramp does not count.
const stuntW = defOf("stunt-west");
teleport(idleSpot);
step(200);
onBoard(stuntW.id);
teleport(stuntW.startPad);
step(2);
const eastRamp = get(`allRamps.find(r => r.id === "east-stunt")`);
if (actId() !== stuntW.id) failures.push("Stunt: driving onto the west pad did not start it");
run(`controlled.x=${eastRamp.x};controlled.z=${eastRamp.startZ - 16};controlled.yaw=0;controlled.yawRate=0;controlled.vx=0;controlled.vz=0;controlled.grounded=true;`, "wrong-ramp");
const airBefore = get("cash");
key("keydown", "w", "KeyW");
if (!driveToLanding(400)) failures.push("Stunt: the wrong-ramp test jump did not launch");
key("keyup", "w", "KeyW");
step(3);
if (get("cash") === airBefore) failures.push("Stunt: the wrong-ramp test jump was too short to prove anything");
if (actId() !== stuntW.id) failures.push("Stunt: a jump off a different ramp finished the activity");
run("skipActivity()", "skip");
teleport(idleSpot);
step(5);

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
// Use one compact and one pickup with no other vehicle close by, so a second collision during
// the check cannot spin the car away and turn a lane-recovery test into a timing lottery.
const recoveryPickExpr = `(() => {
  const clear = (v) => vehicles.every((o) => o === v || Math.hypot(o.x - v.x, o.z - v.z) > 35);
  const pick = (type) => trafficFleet.find((v) => (type === "pickup") === (v.type === "pickup") && clear(v)) ||
    trafficFleet.find((v) => (type === "pickup") === (v.type === "pickup"));
  return [pick("compact"), pick("pickup")];
})()`;
const recoverySetup = get(`(() => {
  const targets = ${recoveryPickExpr};
  window.__recoveryTargets = targets;
  return targets.map((v) => {
    const p = trafficLegPoint(v.trafficLeg, Math.min(v.trafficProgress, v.trafficLeg.length));
    const rightX = Math.cos(p.yaw), rightZ = -Math.sin(p.yaw);
    // Knock to whichever side is clear of buildings. Teleporting a car inside a building
    // collider tests building escape, not lane recovery, and depends on where traffic happens to be.
    const inBuilding = (x, z) => buildingColliders.some((b) => b.kind === "building" &&
      Math.abs(x - b.x) < b.hw + 3 && Math.abs(z - b.z) < b.hl + 3);
    const side = inBuilding(p.x + rightX * 8, p.z + rightZ * 8) ? -1 : 1;
    v.x = p.x + side * rightX * 8;
    v.z = p.z + side * rightZ * 8;
    v.vx = 0;
    v.vz = 0;
    v.aiKnockTime = 2;
    return {id:v.id, initialOffset:8};
  });
})()`);
step(240);
const recoveryLateralErrors =
  get(`window.__recoveryTargets.map((v) => {
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

// ---- T-020: knocked traffic must not drive through buildings ----
const wallCars = get(`(() => {
  const big = buildingColliders.filter(b => b.kind === "building" && b.hw > 6 && b.hl > 6).slice(0, 8);
  big.forEach((b, i) => {
    const v = trafficFleet[i];
    v.x = b.x - b.hw - 6; v.z = b.z; v.yaw = Math.PI / 2; v.vx = 9; v.vz = 0; v.aiKnockTime = 2;
    v.__wallTarget = b;
  });
  return big.length;
})()`);
let wallDepth = 0;
for (let i = 0; i < 600; i++) {
  step(1);
  if (i % 3) continue;
  wallDepth = Math.max(wallDepth, ...get(`trafficFleet.slice(0, ${wallCars}).map(v => { const b = v.__wallTarget;
    return Math.max(0, Math.min(b.hw - Math.abs(v.x - b.x), b.hl - Math.abs(v.z - b.z))); })`));
}
if (wallCars < 6 || wallDepth > 0.6)
  failures.push("Traffic: a knocked car drove " + wallDepth.toFixed(1) + " units into a building");

// ---- T-021: Toybox Events framework ----
for (const problem of get("validateEventData()")) failures.push("Event data: " + problem);
run("onFoot=false; controlled=playerCar; controlled.x=-12; controlled.z=-45; controlled.vx=0; controlled.vz=0; controlled.yaw=0;", "ev-setup");
step(5);
if (get("currentEvent") !== null) failures.push("Events: an event started while events were held off");
// The pool: every event plus "no event", equal weight, one draw per interval.
const poolCounts = get(`(() => {
  const counts = {};
  for (let i = 0; i < 800; i++) {
    const pick = rollEvent();
    counts[pick || "none"] = (counts[pick || "none"] || 0) + 1;
    if (currentEvent) endEvent();
  }
  return counts;
})()`);
for (const id of ["cityAttack", "tuningRay", "rewardRing", "none"])
  if (!(poolCounts[id] > 800 * 0.18 && poolCounts[id] < 800 * 0.32))
    failures.push("Events: pool weights are not equal (" + JSON.stringify(poolCounts) + ")");
// T-039: each draw halves the drawn option's weight until every option has come up, then all reset.
const weightCheck = get(`(() => {
  eventPoolWeights = EVENT_POOL.map(() => 1); eventPoolDrawn = EVENT_POOL.map(() => false);
  const first = EVENT_POOL.indexOf(drawFromEventPool());
  const afterOne = eventPoolWeights.slice();
  let guard = 0; while (eventPoolDrawn.some(Boolean) && guard++ < 100) drawFromEventPool();
  return {first, afterOne, reset: eventPoolWeights.every(w => w === 1) && eventPoolDrawn.every(d => !d)};
})()`);
if (weightCheck.afterOne[weightCheck.first] !== 0.5 || weightCheck.afterOne.filter((w) => w === 1).length !== 3)
  failures.push("Events: drawing an option did not halve only its weight (" + JSON.stringify(weightCheck.afterOne) + ")");
if (!weightCheck.reset) failures.push("Events: weights did not reset once every option had been drawn");
// The point of the weights: no option goes missing for long.
const longestGap = get(`(() => { const last = {}, gap = {}; for (let i = 0; i < 4000; i++) { const k = String(rollEvent()); if (currentEvent) endEvent();
  gap[k] = Math.max(gap[k] || 0, i - (k in last ? last[k] : -1)); last[k] = i; } return Math.max(...Object.values(gap)); })()`);
// Measured over 4000 draws: about 15 at most with the weights, 27 to 30 with plain random draws.
if (longestGap > 20) failures.push("Events: an option went " + longestGap + " draws without coming up");
// Test switch: ?event= starts an event, with optional tier/effect; bad ids do nothing.
run(`startEvent("rewardRing")`, "q");
if (get(`applyEventTestSwitch("?event=nonsense")`) !== false || get("currentEvent && currentEvent.type") !== "rewardRing")
  failures.push("Events: the test switch acted on an unknown event");
run("endEvent();", "q");
if (get(`applyEventTestSwitch("")`) !== false) failures.push("Events: the test switch did something without ?event=");
if (get(`applyEventTestSwitch("?event=cityAttack&tier=large")`) !== true || get("currentEvent.tier.id") !== "large")
  failures.push("Events: ?event=cityAttack&tier=large did not start the large creature");
run("endEvent();", "q");
if (get(`applyEventTestSwitch("?event=tuningRay&effect=soapTires")`) !== true || get("currentEvent.type") !== "tuningRay")
  failures.push("Events: ?event=tuningRay did not start the Tuning Ray");
const forcedRay = get(`(() => { const ev = currentEvent, v = playerCar; controlled = v; onFoot = false; ev.prevSide = -1;
  v.x = ev.x + (ev.axis === "z" ? 0.5 : 0.3); v.z = ev.z + (ev.axis === "x" ? 0.5 : 0.3); updateEvents(0.016);
  const id = v.rayEffect && v.rayEffect.id; v.rayEffect = null; return id; })()`);
if (forcedRay !== "soapTires") failures.push("Events: &effect=soapTires gave " + forcedRay);
run("if (currentEvent) endEvent(); controlled.x = -12; controlled.z = -45;", "q");
run("eventNextRollAt = eventClock + 1;", "ev-roll");
step(70);
if (get("eventNextRollAt - eventClock") < get("EVENT_ROLL_INTERVAL") - 3)
  failures.push("Events: the timer did not draw from the pool when it came due");
run("if (currentEvent) endEvent(); eventNextRollAt = Infinity;", "ev-reset");
// One at a time, comms, map symbol.
if (get(`startEvent("rewardRing")`) !== true) failures.push("Events: could not start the Reward Ring");
if (get(`startEvent("tuningRay")`) !== false) failures.push("Events: a second event started while one was running");
const comms = w.document.getElementById("comms");
if (!comms.classList.contains("show") || !/Reward Ring/.test(comms.textContent) || !/test dummy/.test(comms.textContent))
  failures.push("Events: the comms panel did not show the event name and line");
const evMarkers = get("eventMarkers()");
if (evMarkers.length !== 1 || !evMarkers[0].pin || evMarkers[0].shape !== "ring")
  failures.push("Events: expected one pinned ring symbol on the map");
step(8 * 60);
if (comms.classList.contains("show")) failures.push("Events: the comms panel did not slide away");
// Timer: the event vanishes cleanly with no cash change.
let cashBefore = get("cash");
step(80 * 60);
if (get("currentEvent") !== null) failures.push("Events: the Reward Ring did not disappear when its timer ran out");
if (get("cash") !== cashBefore) failures.push("Events: a timed-out event changed cash");
if (get("eventMarkers().length") !== 0) failures.push("Events: a map symbol was left behind");

// Events never block or cancel activities.
const evDelivery = get(`(() => { const d = activityDefs.find(q => q.id === "south-to-pink-house"); return {pickup: d.pickup, dropoff: d.dropoff, payout: d.payout}; })()`);
run("eventNextRollAt = Infinity;", "q");
step(200);
run(`activityBoard = ["south-to-pink-house"];`, "board");
teleport(evDelivery.pickup);
step(3);
const evActivityId = get("currentActivity && currentActivity.def.id");
run(`startEvent("cityAttack")`, "q");
step(30);
if (get("currentActivity && currentActivity.def.id") !== evActivityId || evActivityId === null)
  failures.push("Events: starting an event changed the running activity");
cashBefore = get("cash");
teleport(evDelivery.dropoff);
step(3);
if (get("cash") !== cashBefore + evDelivery.payout || get("currentEvent && currentEvent.type") !== "cityAttack")
  failures.push("Events: a delivery could not be finished while an event was running");

// ---- T-022: City Under Attack ----
const monsterProps = get("props.filter(p => p.type === 'monster').length");
if (monsterProps !== 1) failures.push("City Under Attack: expected one creature prop, found " + monsterProps);
// A gentle bump visibly shoves it without damaging it.
const shove = get(`(() => {
  const m = currentEvent.monster, v = controlled;
  const x0 = m.x, z0 = m.z, hp0 = m.hp;
  v.x = m.x - m.radius - 3.2; v.z = m.z; v.yaw = Math.PI / 2; v.vx = 2.2; v.vz = 0; v.yawRate = 0; v.grounded = true;
  return {x0, z0, hp0};
})()`);
step(90);
const afterShove = get("({x: currentEvent.monster.x, z: currentEvent.monster.z, hp: currentEvent.monster.hp})");
// A normal-weight prop moves about 1.4 units from this bump; the creature must clearly move more.
if (Math.hypot(afterShove.x - shove.x0, afterShove.z - shove.z0) < 2.5 || afterShove.hp !== shove.hp0)
  failures.push("City Under Attack: a gentle bump should shove the creature without hurting it");
// Smashing it pays the tier payout once, and no ordinary prop cash.
cashBefore = get("cash");
const monsterPayout = get("currentEvent.tier.payout");
run("for (let i = 0; i < 40 && !currentEvent.monster.broken; i++) { const m = currentEvent.monster; m._damageContactCooldowns = new Map(); damageProp(m, 30, controlled); }", "smash-monster");
step(3);
if (get("cash") !== cashBefore + monsterPayout) failures.push("City Under Attack: payout wrong, expected +" + monsterPayout + ", got +" + (get("cash") - cashBefore));
if (get("currentEvent") !== null) failures.push("City Under Attack: the event did not end after the creature broke");
step(10);
if (get("cash") !== cashBefore + monsterPayout) failures.push("City Under Attack: paid more than once");
// All three tiers can appear, and a timed-out creature is removed from the world.
const tiersSeen = get(`(() => { const seen = new Set(); for (let i = 0; i < 40; i++) { startEvent("cityAttack"); seen.add(currentEvent.tier.id); endEvent(); } return [...seen]; })()`);
if (tiersSeen.length !== 3) failures.push("City Under Attack: not every tier appeared (" + tiersSeen + ")");
run(`startEvent("cityAttack")`, "q");
step(121 * 60);
if (get("currentEvent") !== null || get("props.filter(p => p.type === 'monster').length") !== 0)
  failures.push("City Under Attack: the creature was not removed when the timer ran out");

// ---- T-022: Tuning Ray and Reward Ring (drive through the gate) ----
const driveThrough = (offset) => {
  if (get("currentEvent === null")) { failures.push("Events: no event to drive through (it ended early)"); return; }
  run(`(() => { const ev = currentEvent, v = controlled; onFoot = false;
    const dir = ev.axis === "z" ? [0, 1] : [1, 0];
    v.x = ev.x - dir[0] * 9 + (ev.axis === "z" ? ${offset} : 0);
    v.z = ev.z - dir[1] * 9 + (ev.axis === "x" ? ${offset} : 0);
    v.yaw = ev.axis === "z" ? 0 : Math.PI / 2; v.yawRate = 0; v.vx = dir[0] * 8; v.vz = dir[1] * 8; v.grounded = true; ev.prevSide = undefined;
  })()`, "drive-through");
  step(150);
};
run("controlled.x=-12; controlled.z=-45; controlled.yaw=0; controlled.vx=0; controlled.vz=0;", "q");
step(2);
run(`startEvent("tuningRay")`, "q");
const gate = get("({x: currentEvent.x, z: currentEvent.z})");
const gateDist = Math.hypot(gate.x + 12, gate.z + 45);
if (gateDist < 55 || gateDist > 205) failures.push("Tuning Ray: the gate should appear 60 to 200 units away, got " + gateDist.toFixed(0));
driveThrough(14); // beside the road: must not count
if (get("currentEvent && currentEvent.type") !== "tuningRay" || get("playerCar.rayEffect || null") !== null)
  failures.push("Tuning Ray: driving past the gate (not through it) applied the effect");
driveThrough(1.5);
const rayId = get("playerCar.rayEffect && playerCar.rayEffect.id");
if (!rayId) failures.push("Tuning Ray: driving through the gate did not apply an effect");
if (get("currentEvent") !== null) failures.push("Tuning Ray: the gate did not disappear after use");
// Effects change handling while active, undo cleanly, and keep upgrades won meanwhile.
const rayChecks = get(`(() => {
  const v = playerCar, out = {};
  const base = {speed: v.maxSpeed, accel: v.accel, grip: v.lateralGrip, steer: v.steerRate};
  for (const id of RAY_EFFECT_IDS) {
    v.rayEffect = {id, until: eventClock + 100, nextHop: 0};
    out[id] = {grip: rayMul(v, "grip"), steer: rayMul(v, "steer"), accel: rayMul(v, "accel"), top: rayTopSpeed(v)};
  }
  const savedSpeed = v.maxSpeed;
  v.rayEffect = {id: "turboOverload", until: eventClock + 100, nextHop: 0};
  v.maxSpeed = 20; // an upgraded car: Turbo Overload must stop at the cap
  out.cappedTop = rayTopSpeed(v);
  v.maxSpeed = savedSpeed;
  v.rayEffect = {id: "turboOverload", until: eventClock + 0.5, nextHop: 0};
  applyUpgrade(v, "speed");
  out.baseSpeed = base.speed; out.upgradedSpeed = v.maxSpeed; out.baseAccel = base.accel; out.baseGrip = base.grip;
  return out;
})()`);
step(60);
const afterRay = get("({effect: playerCar.rayEffect || null, speed: playerCar.maxSpeed, accel: playerCar.accel, grip: playerCar.lateralGrip, top: rayTopSpeed(playerCar)})");
if (!(rayChecks.soapTires.grip < 0.5 && rayChecks.tankTreads.steer < 1 && rayChecks.tankTreads.grip > 1 && rayChecks.turboOverload.accel > 1.5))
  failures.push("Tuning Ray: effect multipliers are not applied (" + JSON.stringify(rayChecks) + ")");
if (Math.abs(rayChecks.cappedTop - get("RAY_TOP_SPEED_CAP")) > 1e-6)
  failures.push("Tuning Ray: Turbo Overload is not capped");
if (afterRay.effect !== null) failures.push("Tuning Ray: an effect did not wear off");
if (Math.abs(afterRay.speed - rayChecks.upgradedSpeed) > 1e-9 || Math.abs(afterRay.top - rayChecks.upgradedSpeed) > 1e-9 ||
    afterRay.accel !== rayChecks.baseAccel || afterRay.grip !== rayChecks.baseGrip)
  failures.push("Tuning Ray: ending an effect changed the car's own handling or lost an upgrade");
// Super Springs hops while driving, without airtime cash and without counting as a stunt jump.
run(`playerCar.rayEffect = {id: "superSprings", until: eventClock + 6, nextHop: 0}; playerCar.lastRampId = "west-stunt";
  playerCar.x = -12; playerCar.z = -45; playerCar.yaw = Math.PI / 2; playerCar.grounded = true;`, "springs");
cashBefore = get("cash");
key("keydown", "w", "KeyW");
let hops = 0, wasAir = false;
for (let i = 0; i < 240; i++) {
  step(1);
  const air = get("playerCar.grounded === false");
  if (air && !wasAir) hops++;
  wasAir = air;
}
key("keyup", "w", "KeyW");
if (hops < 3) failures.push("Tuning Ray: Super Springs made " + hops + " hops in 4 seconds");
if (get("cash") !== cashBefore) failures.push("Tuning Ray: Super Springs hops paid airtime cash");
if (get("playerCar.lastRampId") !== null) failures.push("Tuning Ray: a Super Springs hop kept the last stunt ramp id");
run("playerCar.rayEffect = null;", "q");
step(60);

// Reward Ring: drive through for one permanent upgrade, no cash.
run("controlled.x=-12; controlled.z=-45; controlled.yaw=0; controlled.vx=0; controlled.vz=0;", "q");
step(2);
run(`startEvent("rewardRing")`, "q");
const levelsBefore = get("playerCar.topSpeedLevel + playerCar.accelerationLevel + playerCar.impactLevel");
cashBefore = get("cash");
driveThrough(6);
if (get("playerCar.topSpeedLevel + playerCar.accelerationLevel + playerCar.impactLevel") !== levelsBefore)
  failures.push("Reward Ring: driving beside the ring gave an upgrade");
driveThrough(0.5);
if (get("playerCar.topSpeedLevel + playerCar.accelerationLevel + playerCar.impactLevel") !== levelsBefore + 1)
  failures.push("Reward Ring: driving through did not give exactly one upgrade level");
if (get("cash") !== cashBefore) failures.push("Reward Ring: changed cash");
if (get("currentEvent") !== null) failures.push("Reward Ring: the ring did not disappear after use");
const ringTiers = get(`(() => { const seen = new Set(); for (let i = 0; i < 30; i++) { startEvent("rewardRing"); const before = [playerCar.topSpeedLevel, playerCar.accelerationLevel, playerCar.impactLevel];
  controlled = playerCar; onFoot = false; currentEvent.prevSide = -1;
  playerCar.x = currentEvent.x + (currentEvent.axis === "x" ? 0.5 : 0.2); playerCar.z = currentEvent.z + (currentEvent.axis === "z" ? 0.5 : 0.2);
  updateEvents(0.016); const after = [playerCar.topSpeedLevel, playerCar.accelerationLevel, playerCar.impactLevel];
  after.forEach((a, k) => { if (a > before[k]) seen.add(k); }); if (currentEvent) endEvent(); } return [...seen]; })()`);
if (ringTiers.length !== 3) failures.push("Reward Ring: not every upgrade type was given (" + ringTiers + ")");

if (failures.length) {
  console.error("SMOKE TEST FAILED\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("SMOKE TEST PASSED", JSON.stringify(end));
