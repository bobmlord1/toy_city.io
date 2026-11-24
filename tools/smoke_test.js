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

const dom = new JSDOM(html.replace(/<script>[\s\S]*<\/script>/, ""), { runScripts: "outside-only" });
const w = dom.window;
const ctx = dom.getInternalVMContext();

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
  run("JSON.stringify({x:controlled.x,z:controlled.z,yaw:controlled.yaw,cash:cash,vehicles:vehicles.length})", "q"),
);

const failures = [];
if (uncaught) failures.push("Uncaught error: " + uncaught);
if (![end.x, end.z, end.yaw].every(Number.isFinite)) failures.push("Car state is not finite");
if (Math.hypot(end.x - start.x, end.z - start.z) < 1) failures.push("Car did not move");
if (end.vehicles < 1) failures.push("No vehicles exist");

if (failures.length) {
  console.error("SMOKE TEST FAILED\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("SMOKE TEST PASSED", JSON.stringify(end));
