"use strict";
// =============================================================================
// src/state.js
// Shared mutable game state: controlled vehicle, onFoot, player, camera mode, key/touch maps.
// Other files read and write these directly (shared global scope).
// =============================================================================

let controlled = playerCar;
let onFoot = false;
let player = { x: 6.7, z: 15.5, yaw: 0 };
let cameraMode = 0;
const keys = {};
const touch = { left: false, right: false, gas: false, brake: false };
let lastTime = 0,
  messageUntil = 0,
  lastHint = "";
