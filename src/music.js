"use strict";
// =============================================================================
// src/music.js (T-051)
// Background music: a playlist of upbeat CC0 tracks that crossfade from one to the next, and a
// tenser track while one of Dr. BadDude's events runs. Tracks stream through two <audio>
// elements routed into the Web Audio master (so the sound button covers music too); decoding
// whole songs into memory would cost about 20 MB each on a phone. The music button (and the
// N key) turns music on or off on its own, remembered. Files and credits: assets/music/,
// ASSET_CREDITS.txt. Headless there is no Web Audio, so only musicState changes.
// =============================================================================

const MUSIC_TRACKS = ["amusement_park", "cider_course_1", "cider_course_2", "cider_course_3", "cider_course_4"];
const EVENT_MUSIC = "event_theme";
const MUSIC_VOLUME = 0.35; // tracks are mastered to about -18 LUFS; this puts them under the effects
const MUSIC_FADE_SECONDS = 2;

const musicState = { on: true, track: null, event: false, playlistIndex: -1 };
const musicPlayers = []; // two { el, gain } slots, alternated for crossfades
let musicActive = -1,
  musicBus = null;

try {
  if (localStorage.getItem("toyCityMusic") === "off") musicState.on = false;
} catch (e) {
  /* storage can be unavailable */
}

// Called by startAudio() the first time the Web Audio context starts (inside a tap or key press,
// which browsers require before media can play).
function startMusic() {
  if (!audioCtx || musicBus || typeof Audio === "undefined") return;
  musicBus = audioCtx.createGain();
  musicBus.gain.value = MUSIC_VOLUME;
  musicBus.connect(masterGain);
  for (let i = 0; i < 2; i++) {
    const el = new Audio();
    el.preload = "auto";
    let gain = null;
    try {
      const node = audioCtx.createMediaElementSource(el);
      gain = audioCtx.createGain();
      gain.gain.value = 0;
      node.connect(gain).connect(musicBus);
    } catch (e) {
      gain = null; // fall back to the element's own volume
    }
    el.addEventListener("timeupdate", () => musicTimeUpdate(i));
    el.addEventListener("ended", () => musicTimeUpdate(i, true));
    musicPlayers.push({ el, gain });
  }
  if (musicState.on) playMusic(musicState.event ? EVENT_MUSIC : nextPlaylistTrack());
}
function nextPlaylistTrack() {
  // First track random so sessions do not always open the same way, then in order.
  musicState.playlistIndex =
    musicState.playlistIndex < 0
      ? Math.floor(Math.random() * MUSIC_TRACKS.length)
      : (musicState.playlistIndex + 1) % MUSIC_TRACKS.length;
  return MUSIC_TRACKS[musicState.playlistIndex];
}
function musicFade(player, to, seconds) {
  if (player.gain) {
    const now = audioCtx.currentTime;
    player.gain.gain.cancelScheduledValues(now);
    player.gain.gain.setValueAtTime(player.gain.gain.value, now);
    player.gain.gain.linearRampToValueAtTime(to, now + seconds);
  } else player.el.volume = clamp(to * MUSIC_VOLUME * SOUND_LEVELS[soundLevel].gain, 0, 1);
}
// Crossfade to a track (or to silence with null).
function playMusic(name) {
  musicState.track = name;
  if (!musicPlayers.length) return;
  const old = musicActive >= 0 ? musicPlayers[musicActive] : null;
  if (old) {
    musicFade(old, 0, MUSIC_FADE_SECONDS);
    const el = old.el;
    setTimeout(() => {
      if (musicPlayers[musicActive] !== old) el.pause();
    }, MUSIC_FADE_SECONDS * 1000 + 100);
  }
  if (!name) {
    musicActive = -1;
    return;
  }
  musicActive = musicActive === 0 ? 1 : 0;
  const p = musicPlayers[musicActive];
  p.el.src = "assets/music/" + name + ".mp3";
  p.el.loop = name === EVENT_MUSIC; // event music repeats until the event ends
  p.el.currentTime = 0;
  musicFade(p, 0, 0.01);
  const playing = p.el.play();
  if (playing && playing.catch) playing.catch(() => {}); // blocked autoplay: stays silent, no error
  musicFade(p, 1, MUSIC_FADE_SECONDS);
}
// Start the next playlist track a little before this one ends, so they overlap in a crossfade.
function musicTimeUpdate(i, ended) {
  if (i !== musicActive || !musicState.on || musicState.event) return;
  const el = musicPlayers[i].el;
  if (ended || (el.duration && el.duration - el.currentTime < MUSIC_FADE_SECONDS + 0.3))
    playMusic(nextPlaylistTrack());
}
// Toybox Events switch to the event track and back (called from setEventAlert in events.js).
function setEventMusic(on) {
  if (musicState.event === !!on) return;
  musicState.event = !!on;
  if (!musicState.on) return;
  playMusic(on ? EVENT_MUSIC : nextPlaylistTrack());
}
function setMusicOn(on) {
  musicState.on = !!on;
  try {
    localStorage.setItem("toyCityMusic", on ? "on" : "off");
  } catch (e) {
    /* ignore */
  }
  const button = $("musicToggle");
  if (button) {
    button.classList.toggle("off", !on);
    button.setAttribute("aria-label", on ? "Music on. Turn music off" : "Music off. Turn music on");
    button.title = on ? "Music on (N)" : "Music off (N)";
  }
  if (!musicPlayers.length) return;
  if (!on) playMusic(null);
  else playMusic(musicState.event ? EVENT_MUSIC : nextPlaylistTrack());
}
// Media elements keep playing while the audio context is suspended, so pause them with the tab.
function pauseMusicForHiddenTab(hidden) {
  if (musicActive < 0) return;
  const el = musicPlayers[musicActive].el;
  if (hidden) el.pause();
  else if (musicState.on) {
    const playing = el.play();
    if (playing && playing.catch) playing.catch(() => {});
  }
}
// Without Web Audio the element volume has to follow the sound level by hand.
function musicLevelChanged() {
  for (const p of musicPlayers) if (!p.gain && musicPlayers[musicActive] === p) musicFade(p, 1, 0);
}

setMusicOn(musicState.on);
if ($("musicToggle")) {
  $("musicToggle").addEventListener("click", (e) => {
    e.stopPropagation();
    startAudio();
    setMusicOn(!musicState.on);
    sfx("click");
  });
}
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "n" && !e.repeat) setMusicOn(!musicState.on);
});
