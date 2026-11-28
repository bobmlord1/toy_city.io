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
const poolIds = get("EVENT_POOL.map(id => id || 'none')");
if (poolIds.length !== 6) failures.push("Events: expected five events plus 'no event' in the pool, got " + poolIds);
for (const id of poolIds)
  if (!(poolCounts[id] > (800 / poolIds.length) * 0.7 && poolCounts[id] < (800 / poolIds.length) * 1.3))
    failures.push("Events: pool weights are not equal (" + JSON.stringify(poolCounts) + ")");
// T-039: each draw halves the drawn option's weight until every option has come up, then all reset.
const weightCheck = get(`(() => {
  eventPoolWeights = EVENT_POOL.map(() => 1); eventPoolDrawn = EVENT_POOL.map(() => false);
  const first = EVENT_POOL.indexOf(drawFromEventPool());
  const afterOne = eventPoolWeights.slice();
  let guard = 0; while (eventPoolDrawn.some(Boolean) && guard++ < 100) drawFromEventPool();
  return {first, afterOne, reset: eventPoolWeights.every(w => w === 1) && eventPoolDrawn.every(d => !d)};
})()`);
if (weightCheck.afterOne[weightCheck.first] !== 0.5 || weightCheck.afterOne.filter((w) => w === 1).length !== weightCheck.afterOne.length - 1)
  failures.push("Events: drawing an option did not halve only its weight (" + JSON.stringify(weightCheck.afterOne) + ")");
if (!weightCheck.reset) failures.push("Events: weights did not reset once every option had been drawn");
// The point of the weights: no option goes missing for long.
const longestGap = get(`(() => { const last = {}, gap = {}; for (let i = 0; i < 4000; i++) { const k = String(rollEvent()); if (currentEvent) endEvent();
  gap[k] = Math.max(gap[k] || 0, i - (k in last ? last[k] : -1)); last[k] = i; } return Math.max(...Object.values(gap)); })()`);
// Measured over 4000 draws with six options: 22 to 26 at most with the weights, 36 to 54 plain random.
if (longestGap > 30) failures.push("Events: an option went " + longestGap + " draws without coming up");
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
if (JSON.stringify(get("RAY_EFFECT_IDS")) !== JSON.stringify(["soapTires", "superSprings", "turboOverload", "boingBumpers"]))
  failures.push("Tuning Ray: expected Soap Tires, Super Springs, Turbo Overload and Boing Bumpers");
if (!/at least 37% better\. I just need to measure at what!/.test(get("eventTypes.tuningRay.line")))
  failures.push("Tuning Ray: Dr. BadDude's line is not the owner's revised wording");
const rayChecks = get(`(() => {
  const v = playerCar, out = {};
  out.base = {speed: v.maxSpeed, accel: v.accel, grip: v.lateralGrip};
  v.rayEffect = {id: "soapTires", until: eventClock + 100, nextHop: 0, nextBoing: 0};
  out.soapGrip = rayMul(v, "grip");
  applyRayEffect(v, "turboOverload");
  out.turbo = {top: rayTopSpeed(v), accel: rayAccel(v), seconds: v.rayEffect.until - eventClock};
  applyRayEffect(v, "soapTires");
  out.soapSeconds = v.rayEffect.until - eventClock;
  // Turbo ends while the car has just won a speed upgrade.
  applyRayEffect(v, "turboOverload");
  v.rayEffect.until = eventClock + 0.2;
  applyUpgrade(v, "speed");
  out.upgradedSpeed = v.maxSpeed;
  return out;
})()`);
if (!(rayChecks.soapGrip < 0.5)) failures.push("Tuning Ray: Soap Tires does not reduce grip");
if (Math.abs(rayChecks.turbo.top - get("100 * MPH_TO_MS")) > 1e-6 || rayChecks.turbo.accel < 25 || Math.abs(rayChecks.turbo.seconds - get("TURBO_SECONDS")) > 1e-6 || get("TURBO_SECONDS") !== 18)
  failures.push("Tuning Ray: Turbo Overload should be 100 mph with huge acceleration for a few seconds (" + JSON.stringify(rayChecks.turbo) + ")");
if (Math.abs(rayChecks.soapSeconds - get("RAY_EFFECT_SECONDS")) > 1e-6) failures.push("Tuning Ray: other effects should last RAY_EFFECT_SECONDS");
step(30); // turbo has just ended: its top speed eases down rather than snapping
const fadeMid = get("({effect: playerCar.rayEffect || null, top: rayTopSpeed(playerCar)})");
if (fadeMid.effect !== null || !(fadeMid.top > rayChecks.upgradedSpeed + 1 && fadeMid.top < get("TURBO_TOP_SPEED")))
  failures.push("Tuning Ray: Turbo Overload should ease its top speed back down after it ends (" + JSON.stringify(fadeMid) + ")");
step(120);
const afterRay = get("({effect: playerCar.rayEffect || null, speed: playerCar.maxSpeed, accel: playerCar.accel, grip: playerCar.lateralGrip, top: rayTopSpeed(playerCar), aNow: rayAccel(playerCar)})");
if (afterRay.effect !== null) failures.push("Tuning Ray: an effect did not wear off");
if (Math.abs(afterRay.speed - rayChecks.upgradedSpeed) > 1e-9 || Math.abs(afterRay.top - rayChecks.upgradedSpeed) > 1e-9 ||
    afterRay.accel !== rayChecks.base.accel || afterRay.aNow !== rayChecks.base.accel || afterRay.grip !== rayChecks.base.grip)
  failures.push("Tuning Ray: ending an effect changed the car's own handling or lost an upgrade");
// Turbo Overload for real: full throttle down a long street reaches about 100 mph.
run(`playerCar.x=-420; playerCar.z=-56.5; playerCar.yaw=Math.PI/2; playerCar.vx=0; playerCar.vz=0; playerCar.yawRate=0; playerCar.grounded=true; applyRayEffect(playerCar, "turboOverload");`, "turbo");
key("keydown", "w", "KeyW");
step(180);
const turboMph = get("Math.hypot(playerCar.vx, playerCar.vz) * MPH_PER_MS");
key("keyup", "w", "KeyW");
if (turboMph < 95) failures.push("Tuning Ray: Turbo Overload only reached " + turboMph.toFixed(0) + " mph in 3 seconds");
// 100 mph into buildings must never put the car inside one.
const turboSlam = get(`(() => { let worst = 0;
  for (const b of buildingColliders.filter(q => q.kind === "building").slice(0, 12)) for (const [dx, dz] of [[-1, 0], [0, 1]]) {
    const v = playerCar; v.x = b.x + dx * (b.hw + 12); v.z = b.z + dz * (b.hl + 12); v.yaw = Math.atan2(-dx, -dz); v.yawRate = 0;
    v.vx = -dx * TURBO_TOP_SPEED; v.vz = -dz * TURBO_TOP_SPEED; v.grounded = true; v.y = driveSurfaceH(v.x, v.z);
    v.rayEffect = {id: "turboOverload", until: eventClock + 5, nextHop: 0, nextBoing: 0};
    for (let i = 0; i < 30; i++) { updateVehicle(v, 0.04); for (const q of buildingColliders) if (q.kind === "building")
      worst = Math.max(worst, Math.min(q.hw - Math.abs(v.x - q.x), q.hl - Math.abs(v.z - q.z))); }
  }
  playerCar.rayEffect = null; playerCar.turboFade = null; return worst; })()`);
if (turboSlam > 0.5) failures.push("Tuning Ray: a 100 mph crash put the car " + turboSlam.toFixed(1) + " units inside a building");
// Boing Bumpers: a 15 mph wall hit bounces back hard with a hop; a normal car barely rebounds.
const wallHit = (fx) => {
  const b = get("buildingColliders.find(q => q.kind === 'building' && q.hw > 6)");
  run(`playerCar.rayEffect = ${fx ? `{id: "${fx}", until: eventClock + 100, nextHop: 0, nextBoing: 0}` : "null"}; playerCar.boingUntil = 0;
    playerCar.x = ${b.x - b.hw - 8}; playerCar.z = ${b.z}; playerCar.yaw = Math.PI / 2; playerCar.vx = 6.7; playerCar.vz = 0; playerCar.yawRate = 0; playerCar.grounded = true; playerCar.y = driveSurfaceH(playerCar.x, playerCar.z);`, "wall");
  let hitAt = -1, hitX = 0, hopped = false, after20 = 0, prevVx = 0, worstDrop = 0;
  for (let i = 0; i < 240; i++) { step(1); const st = get("({vx: playerCar.vx, x: playerCar.x, g: playerCar.grounded})");
    if (hitAt < 0 && st.vx < 0) { hitAt = i; hitX = st.x; }
    if (hitAt >= 0) { if (i - hitAt === 20) after20 = -st.vx * 2.237; if (st.g === false) hopped = true;
      if (i > hitAt + 1) worstDrop = Math.max(worstDrop, (prevVx - st.vx) * -2.237); }
    prevVx = st.vx; }
  return { pushedBack: hitAt < 0 ? 0 : hitX - get("playerCar.x"), after20, hopped, worstDrop };
};
const plainHit = wallHit(null), boingHit = wallHit("boingBumpers");
// v0.20: about 2.6 units back at about 7 mph (the reverse limit cut the rebound off). Now about 19 units.
if (!(boingHit.pushedBack > 12 && boingHit.after20 > 20 && boingHit.hopped && plainHit.pushedBack < 2 && !plainHit.hopped))
  failures.push("Tuning Ray: Boing Bumpers should throw the car well back off a wall (" + JSON.stringify({plainHit, boingHit}) + ")");
if (boingHit.worstDrop > 5) failures.push("Tuning Ray: the Boing rebound stops abruptly (lost " + boingHit.worstDrop.toFixed(1) + " mph in one frame)");
const gentleBoing = get(`(() => { const v = playerCar; v.rayEffect = {id: "boingBumpers", until: eventClock + 100, nextHop: 0, nextBoing: 0};
  const vx0 = v.vx = 1, vz0 = v.vz = 0; v.grounded = true; rayBounce(v, -1, 0, 0.8); const moved = v.vx !== vx0 || v.grounded === false;
  v.rayEffect = null; return moved; })()`);
if (gentleBoing) failures.push("Tuning Ray: Boing Bumpers bounced on a gentle scrape");
run("playerCar.rayEffect = null; playerCar.vx = 0; playerCar.vz = 0;", "q");
step(30);
// Super Springs hops while driving, without airtime cash and without counting as a stunt jump.
run(`playerCar.rayEffect = {id: "superSprings", until: eventClock + 6, nextHop: 0, nextBoing: 0}; playerCar.lastRampId = "west-stunt";
  playerCar.x = -300; playerCar.z = -56.5; playerCar.yaw = Math.PI / 2; playerCar.vx = 0; playerCar.vz = 0; playerCar.yawRate = 0; playerCar.grounded = true;`, "springs");
cashBefore = get("cash");
key("keydown", "w", "KeyW");
let hops = 0, wasAir = false, springLift = 0;
for (let i = 0; i < 240; i++) {
  step(1);
  const air = get("playerCar.grounded === false");
  if (air) springLift = Math.max(springLift, get("playerCar.y - driveSurfaceH(playerCar.x, playerCar.z)"));
  if (air && !wasAir) hops++;
  wasAir = air;
}
key("keyup", "w", "KeyW");
if (hops < 2) failures.push("Tuning Ray: Super Springs made " + hops + " hops in 4 seconds");
// Owner asked for at least triple the v0.20 hop (0.81): about 2.5 now.
if (springLift < 2.43) failures.push("Tuning Ray: Super Springs hops only reach " + springLift.toFixed(2) + " (should be at least 2.43, triple the old 0.81)");
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

// ---- T-025: cross-system checks ----
run("if (currentEvent) endEvent(); if (currentActivity) skipActivity(); eventNextRollAt = Infinity; playerCar.rayEffect = null; playerCar.turboFade = null; onFoot = false; controlled = playerCar;", "sweep-reset");
step(200);
// Props stay on the playable ground: push a barrel at the edge and hit the creature at 100 mph.
const edgeProps = get(`(() => {
  const p = {type: "barrel", x: 430, z: 10, y: 0, vx: 30, vz: 0, yaw: 0, roll: 0, mass: 16, radius: 0.62, hp: 5, broken: false};
  props.push(p);
  startEvent("cityAttack"); const m = currentEvent.monster; m.x = 432; m.z = -10; m.vx = 24; m.vz = 0;
  for (let i = 0; i < 120; i++) updateProps(1 / 60);
  const out = {barrel: p.x, creature: m.x};
  props.splice(props.indexOf(p), 1); endEvent();
  return out; })()`);
if (edgeProps.barrel > get("PLAY_LIMIT") + 1e-6 || edgeProps.creature > get("PLAY_LIMIT") + 1e-6)
  failures.push("Props: pushed past the edge of the playable ground (" + JSON.stringify(edgeProps) + ")");
// A delivery keeps going after switching vehicles, and pays once.
const swapDef = get(`(() => { const d = activityDefs.find(q => q.id === "south-to-pink-house"); return {pickup: d.pickup, dropoff: d.dropoff, payout: d.payout}; })()`);
run(`activityBoard = ["south-to-pink-house"];`, "board");
teleport(swapDef.pickup);
step(3);
const otherCar = get(`(() => { const v = vehicles.find(q => !q.ai && q !== playerCar); return v && {name: v.name}; })()`);
if (get("currentActivity && currentActivity.def.id") !== "south-to-pink-house" || !otherCar)
  failures.push("Sweep: could not start the vehicle-switch delivery check");
else {
  run(`(() => { const other = vehicles.find(q => !q.ai && q !== playerCar); other.x = playerCar.x + 12; other.z = playerCar.z; other.vx = other.vz = 0; })()`, "q");
  key("keydown", "e", "KeyE"); step(1); key("keyup", "e", "KeyE"); step(2);
  run(`(() => { const other = vehicles.find(q => !q.ai && q !== playerCar); player.x = other.x - 2.5; player.z = other.z; })()`, "q");
  key("keydown", "e", "KeyE"); step(1); key("keyup", "e", "KeyE"); step(2);
  const swapped = get("!onFoot && controlled !== playerCar && controlled.name");
  const cashSwap = get("cash");
  run(`controlled.x = ${swapDef.dropoff.x}; controlled.z = ${swapDef.dropoff.z}; controlled.vx = controlled.vz = 0;`, "q");
  step(3);
  if (!swapped) failures.push("Sweep: the vehicle switch did not happen");
  else if (get("cash") !== cashSwap + swapDef.payout || get("currentActivity") !== null)
    failures.push("Sweep: a delivery did not finish (once) after switching vehicles");
  run("onFoot = false; controlled = playerCar;", "q");
  step(3);
}
// Getting out anywhere in the city leaves the player next to the car, able to get back in.
run("controlled.x = 300; controlled.z = 56.5; controlled.vx = controlled.vz = 0; controlled.grounded = true;", "q");
step(5);
key("keydown", "e", "KeyE"); step(1); key("keyup", "e", "KeyE"); step(30);
const exitGap = get("Math.hypot(player.x - playerCar.x, player.z - playerCar.z)");
key("keydown", "e", "KeyE"); step(1); key("keyup", "e", "KeyE"); step(5);
if (exitGap > 5 || get("onFoot")) failures.push("Sweep: getting out at (300, 56.5) left the player " + exitGap.toFixed(0) + " units from the car and unable to get back in");
run("onFoot = false; controlled = playerCar;", "q");
// Walking through a ray gate does nothing.
run(`startEvent("tuningRay"); (() => { const ev = currentEvent; onFoot = true;
  // Stand 3 units before the gate line, facing through it.
  player.x = ev.x - (ev.axis === "x" ? 3 : 0) + (ev.axis === "z" ? 0.3 : 0); player.z = ev.z - (ev.axis === "z" ? 3 : 0) + (ev.axis === "x" ? 0.3 : 0);
  player.yaw = ev.axis === "z" ? 0 : Math.PI / 2; })()`, "q");
step(2);
key("keydown", "w", "KeyW"); step(90); key("keyup", "w", "KeyW");
const walkedThrough = get("currentEvent && (currentEvent.axis === 'z' ? player.z - currentEvent.z : player.x - currentEvent.x)");
if (!(walkedThrough > 2)) failures.push("Sweep: the on-foot gate check did not walk through the gate (" + walkedThrough + ")");
if (get("currentEvent && currentEvent.type") !== "tuningRay" || get("(playerCar.rayEffect || null) !== null"))
  failures.push("Sweep: walking through the ray gate used it");
run("endEvent(); onFoot = false; controlled = playerCar;", "q");
step(3);
// A smash activity and the event creature do not count toward each other.
run(`activityBoard = ["smash-northwest"];`, "q");
const smashDefS = get(`(() => { const d = activityDefs.find(q => q.id === "smash-northwest"); return {start: d.start}; })()`);
run(`controlled.x = -12; controlled.z = -45;`, "q");
step(200);
run(`controlled.x = ${smashDefS.start.x}; controlled.z = ${smashDefS.start.z}; controlled.vx = controlled.vz = 0;`, "q");
step(3);
run(`startEvent("cityAttack"); for (let i = 0; i < 40 && !currentEvent.monster.broken; i++) { currentEvent.monster._damageContactCooldowns = new Map(); damageProp(currentEvent.monster, 30, controlled); }`, "q");
step(3);
const mixed = get(`({activity: currentActivity && currentActivity.def.id, broken: currentActivity ? currentActivity.targets.filter(p => p.broken).length : -1, event: currentEvent})`);
if (mixed.activity !== "smash-northwest" || mixed.broken !== 0 || mixed.event !== null)
  failures.push("Sweep: smashing the event creature affected the smash activity (" + JSON.stringify(mixed) + ")");
run("if (currentActivity) skipActivity();", "q");
step(5);

// ---- T-033: camera ----
// Full Turbo: the camera stays close (chase distance plus the lag cap), not twice as far back.
run(`controlled.x = -420; controlled.z = -56.5; controlled.yaw = Math.PI / 2; controlled.vx = 0; controlled.vz = 0; controlled.yawRate = 0; controlled.grounded = true; cameraMode = 0; applyRayEffect(controlled, "turboOverload");`, "cam");
step(30);
key("keydown", "w", "KeyW");
let camFar = 0;
for (let i = 0; i < 240; i++) { step(1); camFar = Math.max(camFar, get("Math.hypot(camera.x - controlled.x, camera.z - controlled.z)")); }
key("keyup", "w", "KeyW");
if (camFar > 10.5 + get("CAMERA_MAX_LAG") + 1) failures.push("Camera: fell " + camFar.toFixed(1) + " units behind the car at Turbo speed");
run("controlled.rayEffect = null; controlled.turboFade = null; controlled.vx = controlled.vz = 0;", "q");
step(120);
// Parked with its back to a wall: the camera must not end up inside the building.
const wallCam = get(`(() => { const b = buildingColliders.find(q => q.kind === "building" && q.hw > 6 && q.hl > 6);
  const v = controlled; v.x = b.x; v.z = b.z + b.hl + 3; v.yaw = 0; v.vx = v.vz = 0; v.yawRate = 0; v.grounded = true; v.y = driveSurfaceH(v.x, v.z);
  return {x: b.x, z: b.z, hw: b.hw, hl: b.hl, topY: b.topY}; })()`);
let camInside = 0;
for (let i = 0; i < 120; i++) { step(1);
  if (get(`Math.abs(camera.x - ${wallCam.x}) < ${wallCam.hw} && Math.abs(camera.z - ${wallCam.z}) < ${wallCam.hl} && camera.y < ${wallCam.topY}`)) camInside++; }
if (camInside) failures.push("Camera: inside a building for " + camInside + " frames with the car's back to a wall");
run("controlled.x = -12; controlled.z = -45;", "q");
step(60);

// ---- T-028: traffic slows for turns and stays on its own side after them ----
const turnCheck = get(`(() => { const near = (val) => streetLines.reduce((b, l) => Math.abs(val - l) < Math.abs(val - b) ? l : b, streetLines[0]);
  let samples = 0, wrong = 0, fastTurns = 0, turnSamples = 0;
  for (let f = 0; f < 2 * 3600; f++) { updatePhysics(1 / 60); if (f % 6) continue;
    for (const v of trafficFleet) { if (v.aiKnockTime > 0) continue;
      const leg = v.trafficLeg;
      if (leg.turn && v.trafficProgress > leg.lineLength + 1) { turnSamples++; if (Math.hypot(v.vx, v.vz) > TRAFFIC_YAW_RATE * ((leg.length - leg.lineLength) / (Math.PI / 2)) + 0.5) fastTurns++; }
      const s = Math.sin(v.yaw), c = Math.cos(v.yaw), alongZ = Math.abs(c) >= Math.abs(s);
      const along = alongZ ? Math.abs(v.z - near(v.z)) : Math.abs(v.x - near(v.x));
      if (along < 9 || along > 30) continue;
      samples++; if ((alongZ ? (v.x - near(v.x)) * Math.sign(c) : -(v.z - near(v.z)) * Math.sign(s)) > 0) wrong++; } }
  return {samples, wrong, fastTurns, turnSamples}; })()`);
// Measured over 2 minutes: about 780 wrong-side samples before the turn limit, about 60 after.
if (turnCheck.wrong > 200) failures.push("Traffic: " + turnCheck.wrong + " samples on the wrong side of the road just past intersections");
if (turnCheck.turnSamples === 0 || turnCheck.fastTurns > turnCheck.turnSamples * 0.05)
  failures.push("Traffic: cars take turns faster than they can steer (" + JSON.stringify(turnCheck) + ")");
// ---- T-041: touch steering is proportional, with a dead zone, and keys are unchanged ----
{
  const body = w.document.body;
  const hadMobile = body.classList.contains("hud-mobile"), hadDesktop = body.classList.contains("hud-desktop");
  body.classList.add("hud-mobile"); body.classList.remove("hud-desktop");
  Object.defineProperty(w, "innerWidth", { value: 800, configurable: true });
  Object.defineProperty(w, "innerHeight", { value: 400, configurable: true });
  const finger = (type, x, y) => { const e = new w.Event(type, { bubbles: true });
    Object.assign(e, { pointerId: 41, pointerType: "touch", clientX: x, clientY: y }); body.dispatchEvent(e); };
  const steerAt = (dx) => { finger("pointerdown", 120, 300); finger("pointermove", 120 + dx, 255); const v = get("steeringInput()"); finger("pointerup", 120, 300); return v; };
  const curve = { d10: steerAt(-10), d25: steerAt(-25), d40: steerAt(-40), d64: steerAt(-64), r64: steerAt(64), released: get("steeringInput()") };
  if (curve.d10 !== 0 || !(curve.d25 > 0 && curve.d25 < 0.2) || !(curve.d40 > 0.25 && curve.d40 < 0.6) || curve.d64 !== 1 || curve.r64 !== -1 || curve.released !== 0)
    failures.push("Touch steering: not proportional with a dead zone (" + JSON.stringify(curve) + ")");
  // A thumb holding gas while wobbling +/-20 px sideways keeps the car nearly straight.
  run("if (currentActivity) skipActivity(); onFoot = false; controlled = playerCar; playerCar.x = -420; playerCar.z = -56.5; playerCar.yaw = Math.PI / 2; playerCar.vx = playerCar.vz = 0; playerCar.yawRate = 0; playerCar.rayEffect = null;", "thumb");
  step(3);
  finger("pointerdown", 120, 300);
  let wob = 0, ws = 5, worst = 0;
  for (let i = 0; i < 300; i++) {
    ws = (ws * 16807) % 2147483647; wob = Math.max(-20, Math.min(20, wob + (ws / 2147483647 - 0.5) * 10));
    finger("pointermove", 120 + wob, 255);
    step(1);
    const yaw = get("playerCar.yaw");
    worst = Math.max(worst, Math.abs(((yaw - Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
  }
  finger("pointerup", 120, 300);
  // Measured: up to 119 degrees off straight with the old on/off stick, about 1 now.
  if (worst * 57.3 > 10) failures.push("Touch steering: a +/-20 px thumb wobble swung the car " + (worst * 57.3).toFixed(0) + " degrees off straight");
  key("keydown", "a", "KeyA");
  const keyLeft = get("steeringInput()");
  key("keyup", "a", "KeyA");
  if (keyLeft !== 1) failures.push("Touch steering: keyboard steering changed (A gave " + keyLeft + ")");
  body.classList.toggle("hud-mobile", hadMobile); body.classList.toggle("hud-desktop", hadDesktop);
  step(5);
}

// ---- T-043: gentle stop on the tuning pad, and the panel's close button ----
{
  run("if (currentActivity) skipActivity(); if (currentEvent) endEvent(); onFoot = false; controlled = playerCar; playerCar.rayEffect = null; playerCar.boingUntil = 0;", "pad");
  const padPlace = (x, z, yaw, speed) => run(`(() => { const v = playerCar; v.x = ${x}; v.z = ${z}; v.yaw = ${yaw}; v.vx = Math.sin(${yaw}) * ${speed}; v.vz = Math.cos(${yaw}) * ${speed};
    v.yawRate = 0; v.grounded = true; v.y = driveSurfaceH(v.x, v.z); })()`, "pad");
  const padState = () => get("({z: playerCar.z, speed: Math.hypot(playerCar.vx, playerCar.vz), onPad: atUpgradePad(), panel: document.getElementById('upgradePanel').classList.contains('show')})");
  const ux = get("upgradeRamp.x");
  // Earlier checks left this car heavily upgraded (Reward Ring); test as a stock car, then restore.
  run(`window.__padSaved = {maxSpeed: playerCar.maxSpeed, accel: playerCar.accel, top: playerCar.topSpeedLevel, acc: playerCar.accelerationLevel};
    playerCar.topSpeedLevel = 0; playerCar.accelerationLevel = 0; playerCar.accel = playerCar.baseAccel;
    playerCar.maxSpeed = __padSaved.maxSpeed - __padSaved.top * 5 * MPH_TO_MS; upgradePanelDismissed = false;`, "pad");
  // Full speed onto the ramp, letting go of the gas late: without help the car overshoots.
  // Measured: releasing at z 20 to 34 stops on the pad 8 of 8 times with the assist, 3 of 8 without.
  for (const releaseAt of [28, 32]) {
    padPlace(ux, 16, 0, 0);
    key("keydown", "w", "KeyW");
    for (let i = 0; i < 600 && get("playerCar.z") < releaseAt; i++) step(1);
    key("keyup", "w", "KeyW");
    step(360);
    const ps = padState();
    if (!ps.onPad || ps.speed > 1.2) failures.push("Tuning pad: letting go of the gas at z " + releaseAt + " did not stop on the pad (" + JSON.stringify(ps) + ")");
  }
  // A car with three top-speed upgrades (35 mph) arriving at full speed is still caught.
  run("playerCar.maxSpeed += 15 * MPH_TO_MS;", "pad");
  padPlace(ux, -14, 0, 0);
  key("keydown", "w", "KeyW");
  for (let i = 0; i < 900 && get("playerCar.z") < 32; i++) step(1);
  key("keyup", "w", "KeyW");
  step(420);
  if (!padState().onPad || padState().speed > 1.2) failures.push("Tuning pad: a 35 mph car letting go at z 32 did not stop on the pad (" + JSON.stringify(padState()) + ")");
  run("playerCar.maxSpeed -= 15 * MPH_TO_MS;", "pad");
  for (const [label, z, yaw] of [["slowly from the ramp start", 27, 0], ["slowly from the far end", 42, Math.PI]]) {
    padPlace(ux, z, yaw, 2);
    step(360);
    const ps = padState();
    if (!ps.onPad || ps.speed > 1.2) failures.push("Tuning pad: coasting in " + label + " did not settle on the pad (" + JSON.stringify(ps) + ")");
  }
  // Driving off from a standstill on the pad is not held back at all.
  const acrossRun = (assist) => { padPlace(ux, 33, 0, 0); if (!assist) run("window.__padAssist = upgradePadAssist; upgradePadAssist = () => {};", "pad");
    key("keydown", "w", "KeyW"); step(150); key("keyup", "w", "KeyW"); const ps = padState(); if (!assist) run("upgradePadAssist = window.__padAssist;", "pad"); return ps; };
  const withAssist = acrossRun(true), withoutAssist = acrossRun(false);
  if (Math.abs(withAssist.z - withoutAssist.z) > 0.01 || Math.abs(withAssist.speed - withoutAssist.speed) > 0.01)
    failures.push("Tuning pad: the assist held back a car driving off with the gas");
  // Settled on the pad, gas or reverse drives away.
  for (const k of ["w", "s"]) {
    padPlace(ux, 30, 0, 3); step(240);
    key("keydown", k, "Key" + k.toUpperCase()); step(150); key("keyup", k, "Key" + k.toUpperCase());
    if (get("nearUpgradePad(playerCar)")) failures.push("Tuning pad: holding " + k.toUpperCase() + " did not leave the pad area");
  }
  // The close button hides the panel and lets the car roll; Escape works too; leaving resets it.
  run("upgradePanelDismissed = false;", "pad");
  padPlace(ux, 30, 0, 3); step(240);
  if (!padState().panel) failures.push("Tuning pad: the panel did not show on the pad");
  w.document.getElementById("upgradeClose").dispatchEvent(new w.Event("click", { bubbles: true }));
  step(2);
  const closed = padState().panel;
  run("playerCar.vz = 2.5;", "pad"); step(30);
  if (closed || padState().panel) failures.push("Tuning pad: the close button did not hide the panel");
  if (padState().speed < 1.5) failures.push("Tuning pad: the assist kept pulling after the panel was closed");
  run(`playerCar.x = ${ux}; playerCar.z = 70; playerCar.vx = playerCar.vz = 0;`, "pad"); step(3);
  padPlace(ux, 30, 0, 3); step(240);
  if (!padState().panel) failures.push("Tuning pad: the panel did not come back after leaving and returning");
  w.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" }));
  step(2);
  if (padState().panel) failures.push("Tuning pad: Escape did not close the panel");
  const closeBtn = w.document.getElementById("upgradeClose");
  if (closeBtn.tagName !== "BUTTON" || !closeBtn.getAttribute("aria-label")) failures.push("Tuning pad: the close control is not a labelled button");
  run(`playerCar.x = -12; playerCar.z = -45; playerCar.vx = playerCar.vz = 0;
    playerCar.maxSpeed = __padSaved.maxSpeed; playerCar.accel = __padSaved.accel; playerCar.topSpeedLevel = __padSaved.top; playerCar.accelerationLevel = __padSaved.acc;`, "pad"); step(5);
}

// ---- T-045: creatures are building-sized and take several hits ----
{
  run("if (currentActivity) skipActivity(); if (currentEvent) endEvent(); eventNextRollAt = Infinity; onFoot = false; controlled = playerCar; playerCar.rayEffect = null;", "q");
  const tiers = get("MONSTER_TIERS.map(t => ({id: t.id, tall: 4.7 * t.scale, radius: t.radius, hp: t.hp}))");
  const wantTall = { small: 11, medium: 17, large: 26 };
  for (const t of tiers)
    if (t.tall < wantTall[t.id] || t.hp < 20 || t.radius < t.tall * 0.25)
      failures.push("City Under Attack: the " + t.id + " creature is too small or too weak (" + JSON.stringify(t) + ")");
  if (get("eventLawnSites.length") < 30) failures.push("City Under Attack: only " + get("eventLawnSites.length") + " spawn spots for the bigger creatures");
  // A full-speed stock ram takes several hits to smash the small one.
  run(`applyEventTestSwitch("?event=cityAttack&tier=small")`, "q");
  let monsterRams = 0;
  const savedLv = get("({m: playerCar.maxSpeed, a: playerCar.accel, i: playerCar.impactMultiplier})");
  run("playerCar.maxSpeed = 20 * MPH_TO_MS; playerCar.accel = playerCar.baseAccel; playerCar.impactMultiplier = 1;", "q");
  while (monsterRams < 20 && get("currentEvent !== null")) {
    run(`(() => { const m = currentEvent.monster, v = controlled; v.x = m.x - m.radius - 14; v.z = m.z; v.yaw = Math.PI / 2; v.vx = v.vz = 0; v.yawRate = 0; v.grounded = true; v.y = driveSurfaceH(v.x, v.z); })()`, "q");
    key("keydown", "w", "KeyW"); step(150); key("keyup", "w", "KeyW"); step(20); monsterRams++;
  }
  run(`playerCar.maxSpeed = ${savedLv.m}; playerCar.accel = ${savedLv.a}; playerCar.impactMultiplier = ${savedLv.i};`, "q");
  if (monsterRams < 4 || get("currentEvent !== null")) failures.push("City Under Attack: the small creature took " + monsterRams + " stock rams (expected about 5)");
  run("if (currentEvent) endEvent(); controlled.x = -12; controlled.z = -45; controlled.vx = controlled.vz = 0;", "q");
  step(5);
}
// ---- T-046: Treasure ----
{
  if (get(`applyEventTestSwitch("?event=treasure")`) !== true || get("eventMarkers()[0].shape") !== "square" || get("currentEvent.chest.model !== undefined") !== true)
    failures.push("Treasure: did not start with its chest model and square map symbol");
  if (get("currentEvent.chest.hp") > 1) failures.push("Treasure: the chest should break in one hit (hp " + get("currentEvent.chest.hp") + ")");
  const savedT = get("({m: playerCar.maxSpeed, a: playerCar.accel, i: playerCar.impactMultiplier})");
  run("playerCar.maxSpeed = 20 * MPH_TO_MS; playerCar.accel = playerCar.baseAccel; playerCar.impactMultiplier = 1;", "q");
  run(`(() => { const c = currentEvent.chest, v = controlled; v.x = c.x - c.radius - 3; v.z = c.z; v.yaw = Math.PI / 2; v.vx = 1.6; v.vz = 0; v.grounded = true; v.yawRate = 0; })()`, "q");
  step(90);
  if (get("currentEvent && currentEvent.chest.broken") !== false) failures.push("Treasure: a gentle nudge broke the chest");
  const cashT = get("cash");
  run(`(() => { const c = currentEvent.chest, v = controlled; v.x = c.x - c.radius - 12; v.z = c.z; v.yaw = Math.PI / 2; v.vx = v.vz = 0; v.grounded = true; v.yawRate = 0; })()`, "q");
  key("keydown", "w", "KeyW"); step(120); key("keyup", "w", "KeyW"); step(20);
  const treasurePay = get("TREASURE_PAYOUT");
  if (treasurePay !== 500) failures.push("Treasure: payout should be $500 (owner, 2026-11-27), is $" + treasurePay);
  if (get("cash") - cashT !== treasurePay || get("currentEvent") !== null) failures.push("Treasure: one ram should pay exactly $" + treasurePay + " (got +" + (get("cash") - cashT) + ")");
  step(10);
  if (get("cash") - cashT !== treasurePay) failures.push("Treasure: paid more than once");
  run(`playerCar.maxSpeed = ${savedT.m}; playerCar.accel = ${savedT.a}; playerCar.impactMultiplier = ${savedT.i};`, "q");
  run(`applyEventTestSwitch("?event=treasure")`, "q");
  step(91 * 60);
  if (get("currentEvent") !== null || get("props.some(p => p.type === 'treasure')")) failures.push("Treasure: the chest was not removed when the timer ran out");
  run("controlled.x = -12; controlled.z = -45; controlled.vx = controlled.vz = 0;", "q");
  step(5);
}
// ---- T-047: Rival ----
{
  if (get(`applyEventTestSwitch("?event=rival")`) !== true || get("eventMarkers()[0].shape") !== "triangle")
    failures.push("Rival: did not start with its arrowhead map symbol");
  const rivalId = get("currentEvent.rival.id");
  step(240);
  if (get("Math.hypot(currentEvent.rival.vx, currentEvent.rival.vz)") > get("RIVAL_MAX_CRUISE") + 0.3)
    failures.push("Rival: the marked car is faster than RIVAL_MAX_CRUISE");
  // Gentle touches and other traffic do not count.
  run(`(() => { const r = currentEvent.rival; eventVehicleHit(controlled, r, 1.0); const other = trafficFleet.find(v => v !== r); eventVehicleHit(other, r, 9); })()`, "q");
  if (get("currentEvent.hits") !== 0) failures.push("Rival: a gentle touch or another car's hit counted");
  // Chase from behind: ram, back off, ram again.
  run(`(() => { const r = currentEvent.rival, v = controlled; const f = [Math.sin(r.yaw), Math.cos(r.yaw)]; v.x = r.x - f[0] * 15; v.z = r.z - f[1] * 15; v.yaw = r.yaw; v.vx = f[0] * 4; v.vz = f[1] * 4; v.yawRate = 0; v.grounded = true; })()`, "q");
  const cashR = get("cash"), payoutR = get("RIVAL_PAYOUT");
  let mode = "chase", until = 0, last = 0;
  for (let t = 0; t < 40 * 60 && get("currentEvent !== null"); t += 3) {
    const st = get("(() => { const r = currentEvent.rival, v = controlled; let e = Math.atan2(r.x - v.x, r.z - v.z) - v.yaw; while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI; return {e, d: Math.hypot(r.x - v.x, r.z - v.z), hits: currentEvent.hits}; })()");
    if (st.hits !== last || (mode === "chase" && st.d < 4.4)) { last = st.hits; mode = "back"; until = t + 45; }
    if (mode === "back" && t >= until) mode = "chase";
    const ch = mode === "chase";
    key(ch ? "keydown" : "keyup", "w", "KeyW"); key(ch ? "keyup" : "keydown", "s", "KeyS");
    key(ch && st.e > 0.08 ? "keydown" : "keyup", "a", "KeyA"); key(ch && st.e < -0.08 ? "keydown" : "keyup", "d", "KeyD");
    step(3);
  }
  for (const k of ["w", "s", "a", "d"]) key("keyup", k, "Key" + k.toUpperCase());
  const gotR = get("cash") - cashR;
  if (get("currentEvent") !== null || gotR < payoutR || gotR > payoutR + 300)
    failures.push("Rival: ramming from behind did not wreck it within 40 s (got +" + gotR + ")");
  if (get(`trafficFleet.find(v => v.id === "${rivalId}").isRival`)) failures.push("Rival: the car stayed marked after the event");
  run(`applyEventTestSwitch("?event=rival")`, "q");
  const rival2 = get("currentEvent.rival.id");
  step(91 * 60);
  if (get("currentEvent") !== null || get(`trafficFleet.find(v => v.id === "${rival2}").isRival`)) failures.push("Rival: the timeout did not return the car to normal traffic");
  run("controlled.x = -12; controlled.z = -45; controlled.vx = controlled.vz = 0;", "q");
  step(5);
}
// ---- T-048: props across the city ----
{
  const propInfo = get(`(() => { const ordinary = props.filter(p => !p.model);
    const quads = new Set(ordinary.map(p => (p.x < -165 ? "W" : p.x > 165 ? "E" : "C") + (p.z < -165 ? "S" : p.z > 165 ? "N" : "C")));
    const bad = [];
    for (const p of ordinary) { if (!propSpotAllowed(p.x, p.z)) bad.push("street/ramp " + p.x + "," + p.z);
      for (const b of buildingColliders) if (Math.abs(p.x - b.x) < b.hw + p.radius - 0.05 && Math.abs(p.z - b.z) < b.hl + p.radius - 0.05) bad.push("inside " + b.kind + " " + p.x.toFixed(1) + "," + p.z.toFixed(1)); }
    return {count: ordinary.length, zones: quads.size, bad: bad.slice(0, 5)}; })()`);
  if (propInfo.count < 150 || propInfo.zones < 9) failures.push("Props: expected groups in every part of the city (" + JSON.stringify(propInfo) + ")");
  if (propInfo.bad.length) failures.push("Props: badly placed: " + propInfo.bad.join("; "));
  // Far ordinary props are not drawn in a real frame; event props always are.
  run(`controlled.x = -12; controlled.z = -45; startEvent("treasure"); window.__propDraws = 0; window.__chestDraws = 0; window.__realDraw = draw;
    draw = function (mesh, ...rest) { if (mesh === barrelModel || mesh === crateModel) __propDraws++; if (mesh === treasureChestMesh) __chestDraws++; return __realDraw.call(this, mesh, ...rest); };
    currentEvent.chest.x = 400; currentEvent.chest.z = 400;`, "cull");
  step(1);
  const cull = get("({drawn: __propDraws, chest: __chestDraws, ordinary: props.filter(p => !p.model && !p.broken).length})");
  run("draw = __realDraw; endEvent();", "cull");
  if (!(cull.drawn > 0 && cull.drawn < cull.ordinary - 50) || cull.chest < 1)
    failures.push("Props: distance culling is wrong in a real frame (" + JSON.stringify(cull) + ")");
  // A resting prop that gets pushed into a building is still pushed back out.
  const pushed = get(`(() => { const b = buildingColliders.find(q => q.kind === "building" && q.hw > 6);
    const p = {type: "crate", x: b.x - b.hw - 0.8, z: b.z, y: 0, vx: 0, vz: 0, yaw: 0, roll: 0, mass: 34, radius: 0.72, hp: 9.5, broken: false};
    props.push(p); for (let i = 0; i < 30; i++) updateProps(1 / 60);
    p.vx = 12; for (let i = 0; i < 60; i++) updateProps(1 / 60);
    const inside = Math.abs(p.x - b.x) < b.hw && Math.abs(p.z - b.z) < b.hl; props.splice(props.indexOf(p), 1); return inside; })()`);
  if (pushed) failures.push("Props: a resting prop pushed toward a building ended up inside it");
}

// ---- T-050: crash bonus cooldown per surface ----
{
  const cd = get(`(() => {
    const saved = { prev: previousCrashContacts, cur: currentCrashContacts, clock: eventClock, cash, foot: onFoot };
    onFoot = false;
    const paid = [];
    const hit = (key, at, impact = 8) => {
      eventClock = at; previousCrashContacts = new Set(); currentCrashContacts = new Set();
      const before = cash; soundLog.length = 0; registerCrashReward(key, impact);
      paid.push({ pay: cash - before, crashSound: soundLog.includes("crash") });
    };
    const t0 = 50000;
    hit("building:car1:wallA", t0);                 // first hit pays
    hit("building:car1:wallA", t0 + 1);             // same wall soon after: no pay
    hit("trailer-building:wallA", t0 + 2);          // trailer on the same wall: no pay
    hit("building:car1:wallB", t0 + 2.5);           // another building pays
    hit("vehicle-pair:a:b", t0 + 3);                // a car pays
    hit("trailer-vehicle:a:b", t0 + 3.5);           // same pair via the trailer: no pay
    hit("building:car1:wallA", t0 + CRASH_REWARD_COOLDOWN + 0.1); // after the cooldown: pays again
    previousCrashContacts = saved.prev; currentCrashContacts = saved.cur; eventClock = saved.clock; cash = saved.cash; onFoot = saved.foot; updateCashUI();
    return { paid, cooldown: CRASH_REWARD_COOLDOWN };
  })()`);
  const pays = cd.paid.map((p) => p.pay > 0);
  if (JSON.stringify(pays) !== JSON.stringify([true, false, false, true, true, false, true]))
    failures.push("Crash cooldown: wrong pay pattern " + JSON.stringify(pays));
  if (!cd.paid.every((p) => p.crashSound)) failures.push("Crash cooldown: every new hit should still play the crash sound");
  if (!(cd.cooldown >= 4 && cd.cooldown <= 12)) failures.push("Crash cooldown: should be short (4 to 12 s), is " + cd.cooldown);
}
// ---- T-034: sound effects ----
{
  const files = get("Object.values(SOUND_FILES).map(f => f[0])");
  const credits = read("ASSET_CREDITS.txt");
  let total = 0;
  for (const f of files) {
    const p = path.join(root, "assets/audio", f);
    if (!fs.existsSync(p)) { failures.push("Sound: missing file assets/audio/" + f); continue; }
    const size = fs.statSync(p).size;
    total += size;
    if (size > 120000) failures.push("Sound: " + f + " is too big for phones (" + size + " bytes)");
    if (!credits.includes(f)) failures.push("Sound: " + f + " is not listed in ASSET_CREDITS.txt");
  }
  if (total > 400000) failures.push("Sound: all sounds together should stay under 400 KB (" + total + ")");
  // Hooks fire (headless has no Web Audio, but sfx() still records names).
  const heard = (code) => get(`(() => { soundLog.length = 0; ${code}; return soundLog.slice(); })()`);
  if (!heard("awardCash(10)").includes("coins_big")) failures.push("Sound: awardCash did not play the coin sound");
  run("controlled.boostCooldown = 0;", "q");
  if (!heard("activateBoost()").includes("boost")) failures.push("Sound: boost did not play its sound");
  // Sound button cycles on, quiet, off with the M key, and the label follows.
  const lv0 = get("soundLevel");
  key("keydown", "m", "KeyM"); key("keyup", "m", "KeyM");
  const lv1 = get("({ level: soundLevel, label: document.getElementById('soundToggle').getAttribute('aria-label') })");
  if (lv1.level !== (lv0 + 1) % 3 || !/^Sound (on|quiet|off)/.test(lv1.label)) failures.push("Sound: M did not change the sound level (" + JSON.stringify(lv1) + ")");
  run("setSoundLevel(0);", "q");
  if (!/"audio"/.test(read("index.html").match(/const SCRIPTS=(\[[^\]]*\])/)[1])) failures.push("Sound: src/audio.js is not loaded");
}
// ---- T-032: Dr. BadDude presentation ----
{
  const img = get("(() => { const i = document.querySelector('#commsAvatar img'); return i ? i.getAttribute('src') : null; })()");
  const imgPath = img && path.join(root, img);
  if (!img || !fs.existsSync(imgPath)) failures.push("Dr. BadDude: the comms portrait image is missing");
  else {
    const b = fs.readFileSync(imgPath);
    if (b[0] !== 0xff || b[1] !== 0xd8 || b.length > 20000) failures.push("Dr. BadDude: portrait should be a small JPG (" + b.length + " bytes)");
  }
  if (!/The government asked about my research fund/.test(get("eventTypes.treasure.line"))) failures.push("Dr. BadDude: Treasure line not updated");
  const ev = get(`(() => { soundLog.length = 0; if (currentEvent) endEvent(); const ok = startEvent("cityAttack", { tier: MONSTER_TIERS[2] });
    const r = { ok, tint: document.body.classList.contains("event-alert"), shake: screenShake.left > 0, sounds: soundLog.slice() };
    endEvent(); r.tintAfter = document.body.classList.contains("event-alert"); return r; })()`);
  if (!ev.ok || !ev.tint || ev.tintAfter) failures.push("Dr. BadDude: the red event tint should be on during an event and off after (" + JSON.stringify(ev) + ")");
  if (!ev.sounds.includes("klaxon")) failures.push("Dr. BadDude: no klaxon when an event starts");
  if (!ev.shake) failures.push("Dr. BadDude: no screen shake when a creature appears");
  const ring = get(`(() => { startEvent("rewardRing"); const r = { shake: screenShake.left, tint: document.body.classList.contains("event-alert") }; endEvent(); return r; })()`);
  if (!ring.tint) failures.push("Dr. BadDude: the tint should show for every event");
  step(120); // let the creature's shake finish and the frame code run with the shake
  if (get("screenShake.left") !== 0) failures.push("Dr. BadDude: the screen shake did not end");
}

// ---- T-051: music and the v0.23.1 mix ----
{
  const tracks = get("MUSIC_TRACKS.concat([EVENT_MUSIC])");
  const credits = read("ASSET_CREDITS.txt");
  for (const t of tracks) {
    const p = path.join(root, "assets/music", t + ".mp3");
    if (!fs.existsSync(p)) { failures.push("Music: missing assets/music/" + t + ".mp3"); continue; }
    if (fs.statSync(p).size > 700000) failures.push("Music: " + t + ".mp3 is too big to stream on phones");
    if (!credits.includes(t + ".mp3")) failures.push("Music: " + t + ".mp3 is not listed in ASSET_CREDITS.txt");
  }
  const levels = get("SOUND_LEVELS.map(l => l.gain)");
  if (!(levels[0] <= 0.32 && levels[1] <= 0.112 && levels[2] === 0)) failures.push("Mix: master levels should be at least 10 dB under 1 and 0.35 (" + levels + ")");
  if (!(get("ENGINE_VOLUME") <= 0.12)) failures.push("Mix: the engine is louder than the v0.23.1 mix (" + get("ENGINE_VOLUME") + ")");
  const m0 = get("musicState.on");
  key("keydown", "n", "KeyN"); key("keyup", "n", "KeyN");
  const m1 = get("({ on: musicState.on, label: document.getElementById('musicToggle').getAttribute('aria-label') })");
  if (m1.on === m0 || !/^Music (on|off)/.test(m1.label)) failures.push("Music: N did not toggle music (" + JSON.stringify(m1) + ")");
  run("setMusicOn(true);", "q");
  const ev = get(`(() => { if (currentEvent) endEvent(); startEvent("rewardRing"); const during = musicState.event; endEvent(); return { during, after: musicState.event }; })()`);
  if (!ev.during || ev.after) failures.push("Music: event music should switch on for an event and off after (" + JSON.stringify(ev) + ")");
}

// ---- T-029: toy plastic materials ----
{
  const m = get(`(() => { const b = new MeshBuilder(); const r = {};
    b.useMaterial(0.97, 0, 1); r.lawn = b.material[0];
    b.useMaterial(0.2, 0, 0); r.toy = b.material[0];
    b.useMaterial(0.34, 0.72, 6); r.metal = b.material[1];
    return r; })()`);
  if (!(m.lawn >= 0.9)) failures.push("Materials: the lawn and roads should stay satin (roughness " + m.lawn + "), or they glare like the toys");
  if (!(m.toy <= 0.25)) failures.push("Materials: toys should stay glossy (roughness " + m.toy + ")");
  if (!(m.metal <= 0.2)) failures.push("Materials: painted metal should not turn into chrome (metallic " + m.metal + ")");
  const src = read("src/renderer.js");
  for (const tag of ["TOY_REFLECT_MAX", "TOY_SHADE_SATURATION", "2.51*lum+0.03"])
    if (!src.includes(tag)) failures.push("Materials: renderer.js lost the toy look piece " + tag);
  if (/color=color\/\(color\+vec3/.test(src)) failures.push("Materials: the old per-channel tone curve (washes colors out) is back");
  if (!/normalize\(TOY_LIGHT\.sunDirection\)/.test(read("src/shadows.js"))) failures.push("Materials: shadows should use the same sun as the shaders");
  if (!(get("VEHICLE_PAINT_SATURATION") > 1)) failures.push("Materials: vehicle paint saturation boost is missing");
}

if (failures.length) {
  console.error("SMOKE TEST FAILED\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("SMOKE TEST PASSED", JSON.stringify(end));
