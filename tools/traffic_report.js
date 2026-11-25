// Headless traffic behavior report. Simulates the AI traffic with no player input and prints
// how often cars collide, what kind of collisions they are, and how often and how long cars
// leave the road. Use it before and after changing traffic code.
//
// Setup (once):   npm install jsdom
// Run:            node tools/traffic_report.js [simulated minutes, default 5] [seed, default 1]
//                 The seed picks the random traffic speed offsets. Try several seeds when comparing.
//
// Numbers come from a stubbed browser, so they say nothing about graphics or frame rate.

const { JSDOM } = require("jsdom");
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const minutes = Number(process.argv[2]) || 5;
const seed = Math.max(1, Math.floor(Number(process.argv[3]) || 1)); // seeds Math.random, which picks the traffic speed offsets
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const html = read("index.html");
const SCRIPTS = JSON.parse(html.match(/const SCRIPTS=(\[[^\]]*\])/)[1]);

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
w.requestAnimationFrame = () => 0;
const meta = JSON.parse(read("assets/vehicle_meshes.json"));
const bin = fs.readFileSync(path.join(root, "assets/vehicle_meshes.bin"));
const buf = new w.ArrayBuffer(bin.length);
new Uint8Array(buf).set(bin);
w.FREE_ROAM_VEHICLE_ASSETS = { meta, buffer: buf };
const run = (src, name) => new vm.Script(src, { filename: name }).runInContext(ctx);

run("Math.random=(()=>{let s=" + seed + ";return()=>(s=(s*16807)%2147483647)/2147483647})()", "seed");
for (const name of SCRIPTS) run(read(`src/${name}.js`), `src/${name}.js`);
w.document.getElementById("startbtn").click();

const report = run(
  `(() => {
  const fleet = trafficFleet;
  const near = (val) => Math.min(...streetLines.map((l) => Math.abs(val - l)));
  const events = [];
  const lastContact = {};
  let contactFrames = 0;
  let simT = 0;
  const original = resolveVehiclePair;
  resolveVehiclePair = function (a, b) {
    const ka = a.aiKnockTime, kb = b.aiKnockTime;
    original(a, b);
    if ((a.ai && a.aiKnockTime > ka) || (b.ai && b.aiKnockTime > kb)) {
      // One incident = contact between the same pair with no gap longer than half a second.
      const key = a.id + "|" + b.id;
      const isNew = !(key in lastContact) || simT - lastContact[key] > 0.5;
      lastContact[key] = simT;
      contactFrames++;
      if (!isNew) return;
      const dot = Math.sin(a.yaw) * Math.sin(b.yaw) + Math.cos(a.yaw) * Math.cos(b.yaw);
      events.push({
        rel: dot > 0.7 ? "same-direction (rear-end)" : dot < -0.7 ? "opposite" : "crossing",
        atIntersection: near(a.x) <= 9 && near(a.z) <= 9,
        kinds: [a.type === "pickup" ? "pickup" : "car", b.type === "pickup" ? "pickup" : "car"].sort().join("+"),
      });
    }
  };
  const runLen = fleet.map(() => 0), longest = fleet.map(() => 0);
  let excursions = 0, offSamples = 0, samples = 0, maxDist = 0, nonFinite = 0;
  let heldBack = 0, maxStreak = 0;
  const frames = ${minutes} * 60 * 60;
  for (let f = 0; f < frames; f++) {
    simT = f / 60;
    updatePhysics(1 / 60);
    if (f % 6) continue;
    fleet.forEach((v, i) => {
      samples++;
      if (v.trafficLeader) heldBack++;
      maxStreak = Math.max(maxStreak, v.trafficFollowStreak || 0);
      if (![v.x, v.z, v.yaw, v.vx, v.vz].every(Number.isFinite)) nonFinite++;
      const d = Math.min(near(v.x), near(v.z));
      if (d > 7.5) {
        offSamples++;
        maxDist = Math.max(maxDist, d);
        if (runLen[i] === 0) excursions++;
        runLen[i]++;
        longest[i] = Math.max(longest[i], runLen[i]);
      } else runLen[i] = 0;
    });
  }
  const count = (key) => events.reduce((m, e) => ((m[e[key]] = (m[e[key]] || 0) + 1), m), {});
  resolveVehiclePair = original;
  return {
    simulatedMinutes: ${minutes},
    trafficVehicles: fleet.length,
    collisionIncidents: events.length,
    incidentsPerMinute: +(events.length / ${minutes}).toFixed(2),
    contactSecondsTotal: +(contactFrames / 60).toFixed(1),
    byRelation: count("rel"),
    byVehicleKinds: count("kinds"),
    atIntersection: events.filter((e) => e.atIntersection).length,
    offRoad: {
      excursions,
      excursionsPerMinute: +(excursions / ${minutes}).toFixed(2),
      percentOfCarTime: +((100 * offSamples) / samples).toFixed(2),
      longestSeconds: Math.max(...longest) / 10,
      farthestFromRoadCenter: +maxDist.toFixed(1),
    },
    heldBack: {
      percentOfCarTime: +((100 * heldBack) / samples).toFixed(2),
      longestStreakOfIntersections: maxStreak,
    },
    nonFiniteSamples: nonFinite,
    carsOffRoadAtEnd: fleet.filter((v) => Math.min(near(v.x), near(v.z)) > 7.5).length,
  };
})()`,
  "report",
);
console.log(JSON.stringify(report, null, 2));
