"use strict";
// =============================================================================
// tools/make_sounds.js (T-034, T-032)
// Builds the game's original sounds and seamless loops. Run from the repo root:
//   node tools/make_sounds.js <folder with the Kenney Starter-Kit-Racing "audio" files>
// Writes into assets/audio/:
//   klaxon.mp3   "ah-OO-gah" alarm for Toybox Events (made here from code, CC0 like the rest)
//   boing.mp3    spring "boing" for Boing Bumpers (made here from code)
//   engine.wav   seamless loop cut from the Starter Kit's engine.ogg (CC0, Kenney)
//   skid.wav     seamless loop cut from the Starter Kit's skid.ogg (CC0, Landeplage)
// Needs ffmpeg on the PATH for decoding the .ogg files and for MP3 encoding.
// The other sounds are Kenney CC0 files converted with ffmpeg; see ASSET_CREDITS.txt.
// =============================================================================
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const RATE = 22050;
const out = path.join(__dirname, "..", "assets", "audio");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "toy-city-sounds-"));

function writeWav(file, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++)
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}
function readMono(file) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-"]);
  const s = new Float32Array(raw.length / 2);
  for (let i = 0; i < s.length; i++) s[i] = raw.readInt16LE(i * 2) / 32768;
  return s;
}
function toMp3(samples, name) {
  const wav = path.join(tmp, name + ".wav");
  writeWav(wav, samples);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", wav, "-ac", "1", "-ar", "32000", "-c:a", "libmp3lame", "-b:a", "56k", path.join(out, name + ".mp3")]);
}
const smooth = (a, b, t) => a + (b - a) * (t * t * (3 - 2 * t));

// Old car horn: a buzzy band-limited sawtooth whose pitch swoops up ("ah-OO") and drops ("gah").
function klaxon() {
  const honk = 0.74,
    gap = 0.12,
    total = honk * 2 + gap + 0.1;
  const s = new Float32Array(Math.round(total * RATE));
  let phase = 0,
    low = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / RATE;
    const k = t < honk ? t : t - honk - gap;
    if (k < 0 || k > honk) continue;
    let f;
    if (k < 0.07) f = 150;
    else if (k < 0.38) f = smooth(150, 300, (k - 0.07) / 0.31);
    else if (k < 0.58) f = 300;
    else f = smooth(300, 245, (k - 0.58) / 0.16);
    f *= 1 + 0.008 * Math.sin(2 * Math.PI * 7 * t);
    phase += f / RATE;
    let v = 0;
    for (let h = 1; h <= 14; h++) v += Math.sin(2 * Math.PI * h * phase) / h;
    low += (v - low) * 0.35; // soften the top end a little
    const env = Math.min(1, k / 0.02) * Math.min(1, (honk - k) / 0.07);
    s[i] = Math.tanh(low * 1.6) * 0.55 * env;
  }
  return s;
}
// Cartoon spring: a quick upward swoop that wobbles and dies away.
function boing() {
  const s = new Float32Array(Math.round(0.6 * RATE));
  let phase = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / RATE;
    const wobble = 1 + 0.22 * Math.exp(-t * 5) * Math.sin(2 * Math.PI * 14 * t);
    const f = (180 + 260 * (1 - Math.exp(-t * 18))) * wobble;
    phase += f / RATE;
    const env = Math.min(1, t / 0.005) * Math.exp(-t * 6.5);
    s[i] = (Math.sin(2 * Math.PI * phase) + 0.25 * Math.sin(4 * Math.PI * phase)) * 0.6 * env;
  }
  return s;
}
// Seamless loop: take [start, start + len) and crossfade its tail into its head.
function loopCut(src, start, len, fade) {
  const a = Math.round(start * RATE),
    n = Math.round(len * RATE),
    f = Math.round(fade * RATE);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = src[a + i];
  for (let i = 0; i < f; i++) {
    const w = i / f;
    s[i] = src[a + i] * w + src[a + n + i] * (1 - w);
  }
  return s;
}

fs.mkdirSync(out, { recursive: true });
toMp3(klaxon(), "klaxon");
toMp3(boing(), "boing");
const kit = process.argv[2];
if (kit) {
  writeWav(path.join(out, "engine.wav"), loopCut(readMono(path.join(kit, "engine.ogg")), 1.0, 2.0, 0.15));
  writeWav(path.join(out, "skid.wav"), loopCut(readMono(path.join(kit, "skid.ogg")), 0.5, 1.5, 0.15));
} else console.log("No Starter Kit folder given: engine.wav and skid.wav were left as they are.");
fs.rmSync(tmp, { recursive: true, force: true });
console.log("Sounds written to " + out);
