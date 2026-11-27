"use strict";
// =============================================================================
// src/audio.js (T-034)
// Small Web Audio sound system: one-shot effects, the engine and tire-skid loops, and the
// sound button (three levels: normal, quiet, off; key M). Files live in assets/audio/ and are
// listed in ASSET_CREDITS.txt (Kenney CC0, plus two sounds made by tools/make_sounds.js).
// Browsers only allow sound after a tap or key press, so the context starts on the first one.
// Without Web Audio (old browsers, the headless tests) every call quietly does nothing, except
// that sfx() still records the name in soundLog so the smoke test can check the hooks.
// =============================================================================

// name: [file, volume]. The volume evens out the files' own loudness (v0.23.1 mix): big moments
// (wins, activity done, klaxon, creature smash) about -20 dB, ordinary effects about -23 dB, small
// ones (coins, clicks, zaps, door) about -26 dB, measured as RMS while the sound plays.
// The engine sits well under all of them. To swap a sound, change the file here and re-measure.
const SOUND_FILES = {
  crash: ["crash.mp3", 0.47],
  crash_big: ["crash_big.mp3", 0.42],
  smash: ["smash.mp3", 0.36],
  monster_hit: ["monster_hit.mp3", 1.46],
  monster_smash: ["monster_smash.mp3", 0.43],
  coin: ["coin.mp3", 1.72],
  coins_big: ["coins_big.mp3", 1.05],
  upgrade: ["upgrade.mp3", 2.51],
  ring: ["ring.mp3", 2.02],
  zap: ["zap.mp3", 1.58],
  hop: ["hop.mp3", 0.97],
  boing: ["boing.mp3", 0.47],
  turbo: ["turbo.mp3", 0.72],
  boost: ["boost.mp3", 0.46],
  activity_start: ["activity_start.mp3", 0.25],
  pickup: ["pickup.mp3", 0.27],
  activity_done: ["activity_done.mp3", 0.35],
  event_win: ["event_win.mp3", 0.37],
  comms: ["comms.mp3", 0.34],
  klaxon: ["klaxon.mp3", 0.26],
  click: ["click.mp3", 0.79],
  door: ["door.mp3", 0.35],
  engine: ["engine.wav", 1],
  skid: ["skid.wav", 1],
};
const SOUND_LEVELS = [
  { id: "on", gain: 1, icon: "\u{1F50A}", label: "Sound on" },
  { id: "low", gain: 0.35, icon: "\u{1F509}", label: "Sound quiet" },
  { id: "off", gain: 0, icon: "\u{1F507}", label: "Sound off" },
];
const SOUND_MIN_GAP = 0.06; // seconds between two plays of the same sound
const SOUND_MAX_VOICES = 10; // one-shots playing at once
// Engine pitch per vehicle: the small car buzzes, the semi rumbles.
const ENGINE_PITCH = { compact: 1.15, pickup: 0.95, semi: 0.72 };
const ENGINE_VOLUME = 0.1; // about -36 dB at cruise, -33 dB flat out (was 0.22, louder than most effects)
const SKID_VOLUME = 0.4;

let audioCtx = null,
  masterGain = null,
  soundLevel = 0;
let soundVoiceEnds = []; // end times of playing one-shots (no reliance on onended)
const soundBuffers = {};
const soundLastPlayed = {};
const soundLog = []; // last few sfx() names, for the smoke test
const audioLoops = {};

try {
  const saved = localStorage.getItem("toyCitySound");
  const i = SOUND_LEVELS.findIndex((l) => l.id === saved);
  if (i >= 0) soundLevel = i;
} catch (e) {
  /* storage can be unavailable; keep the default */
}

function audioNow() {
  return audioCtx ? audioCtx.currentTime : 0;
}
function startAudio() {
  if (audioCtx) {
    if (audioCtx.state === "suspended" && !document.hidden) audioCtx.resume().catch(() => {});
    return;
  }
  const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return;
  try {
    audioCtx = new Ctx();
  } catch (e) {
    audioCtx = null;
    return;
  }
  masterGain = audioCtx.createGain();
  masterGain.gain.value = SOUND_LEVELS[soundLevel].gain;
  // A gentle compressor keeps stacked sounds (crash + coins + jingle over music) from clipping.
  let out = audioCtx.destination;
  if (audioCtx.createDynamicsCompressor) {
    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    comp.connect(audioCtx.destination);
    out = comp;
  }
  masterGain.connect(out);
  startMusic();
  for (const [name, [file]] of Object.entries(SOUND_FILES)) {
    fetch("assets/audio/" + file)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(file))))
      .then((data) => new Promise((ok, fail) => audioCtx.decodeAudioData(data, ok, fail)))
      .then((buffer) => {
        soundBuffers[name] = buffer;
        if (name === "engine" || name === "skid") startAudioLoop(name);
      })
      .catch(() => {}); // a missing sound is silent, never an error
  }
}
function startAudioLoop(name) {
  const src = audioCtx.createBufferSource();
  src.buffer = soundBuffers[name];
  src.loop = true;
  const gain = audioCtx.createGain();
  gain.gain.value = 0;
  src.connect(gain).connect(masterGain);
  src.start();
  audioLoops[name] = { src, gain };
}

// Play a one-shot. volume 0..1 on top of the file's own volume; rate 1 = normal pitch.
function sfx(name, volume = 1, rate = 1) {
  soundLog.push(name);
  if (soundLog.length > 40) soundLog.shift();
  if (!audioCtx || !masterGain || soundLevel === SOUND_LEVELS.length - 1) return;
  const buffer = soundBuffers[name];
  if (!buffer || volume <= 0) return;
  const now = audioNow();
  soundVoiceEnds = soundVoiceEnds.filter((t) => t > now);
  if (soundVoiceEnds.length >= SOUND_MAX_VOICES) return;
  if (now - (soundLastPlayed[name] ?? -1) < SOUND_MIN_GAP) return;
  soundLastPlayed[name] = now;
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const gain = audioCtx.createGain();
  gain.gain.value = Math.min(1, volume) * SOUND_FILES[name][1];
  src.connect(gain).connect(masterGain);
  soundVoiceEnds.push(now + buffer.duration / rate);
  src.start();
}
// Small random pitch change so repeated hits do not sound identical.
function sfxVaried(name, volume = 1) {
  sfx(name, volume, 0.92 + Math.random() * 0.16);
}
function playCrashSound(impact) {
  const k = clamp((impact - 2) / 10, 0.25, 1);
  sfxVaried("crash", k);
  if (impact > 9) sfxVaried("crash_big", k);
}

// Engine and skid loops follow the driven vehicle every frame.
let soundButtonPlacedAt = -1;
function updateAudio(dt) {
  soundButtonPlacedAt -= dt;
  if (soundButtonPlacedAt <= 0) {
    soundButtonPlacedAt = 0.5; // the dashboard height changes with the HUD layout
    placeSoundButton();
  }
  if (!audioCtx) return;
  const engine = audioLoops.engine,
    skid = audioLoops.skid;
  const t = audioNow();
  const v = !onFoot && controlled ? controlled : null;
  let engineGain = 0,
    engineRate = 1,
    skidGain = 0;
  if (v) {
    const speed = Math.hypot(v.vx, v.vz);
    const ratio = Math.min(1.4, speed / Math.max(1, v.maxSpeed || 20));
    const push = v.audioThrottle ? 1 : 0;
    engineRate = (ENGINE_PITCH[v.type] || 1) * (0.75 + 0.7 * ratio + 0.1 * push);
    engineGain = ENGINE_VOLUME * (0.45 + 0.35 * Math.min(1, ratio) + 0.2 * push);
    if (v.grounded !== false && speed > 3) {
      const f = vehicleForward(v);
      const sideways = Math.abs(v.vx * f[1] - v.vz * f[0]);
      skidGain = SKID_VOLUME * clamp((sideways - 3.5) / 7, 0, 1);
    }
  }
  if (engine) {
    engine.gain.gain.setTargetAtTime(engineGain, t, 0.12);
    engine.src.playbackRate.setTargetAtTime(clamp(engineRate, 0.4, 2.6), t, 0.08);
  }
  if (skid) skid.gain.gain.setTargetAtTime(skidGain, t, 0.06);
}

// Sound button: placed just under the dashboard on the right, so it fits every HUD layout.
function setSoundLevel(i) {
  soundLevel = ((i % SOUND_LEVELS.length) + SOUND_LEVELS.length) % SOUND_LEVELS.length;
  const level = SOUND_LEVELS[soundLevel];
  if (masterGain) masterGain.gain.setTargetAtTime(level.gain, audioNow(), 0.05);
  if (typeof musicLevelChanged === "function") musicLevelChanged();
  const button = $("soundToggle");
  if (button) {
    button.textContent = level.icon;
    button.setAttribute("aria-label", level.label + ". Change sound level");
    button.title = level.label + " (M)";
  }
  try {
    localStorage.setItem("toyCitySound", level.id);
  } catch (e) {
    /* ignore */
  }
}
function placeSoundButton() {
  const button = $("soundToggle"),
    dash = $("dashboard");
  if (!button || !dash) return;
  const r = dash.getBoundingClientRect();
  button.style.top = Math.round(r.bottom + 8) + "px";
  const music = $("musicToggle");
  if (music) music.style.top = Math.round(r.bottom + 8 + button.offsetHeight + 8) + "px";
}
setSoundLevel(soundLevel);
if ($("soundToggle")) {
  $("soundToggle").addEventListener("click", (e) => {
    e.stopPropagation();
    startAudio();
    setSoundLevel(soundLevel + 1);
    sfx("click");
  });
}
for (const type of ["pointerdown", "keydown", "touchend"])
  window.addEventListener(type, startAudio, { passive: true });
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "m" && !e.repeat) setSoundLevel(soundLevel + 1);
});
window.addEventListener("resize", placeSoundButton);
document.addEventListener("visibilitychange", () => {
  if (!audioCtx) return;
  if (document.hidden) audioCtx.suspend().catch(() => {});
  else audioCtx.resume().catch(() => {});
  pauseMusicForHiddenTab(document.hidden);
});
