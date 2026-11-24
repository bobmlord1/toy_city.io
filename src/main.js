"use strict";
// =============================================================================
// src/main.js
// Frame loop and startup (marks engine ready).
// Must load LAST.
// =============================================================================

function frame(t) {
  if (!started) {
    requestAnimationFrame(frame);
    return;
  }
  try {
    const dt = Math.min(0.04, (t - (lastTime || t)) / 1000 || 0.016);
    lastTime = t;
    updatePhysics(dt);
    updateActivities(dt);
    drawWorld(dt);
    updateUI();
    drawMap();
    requestAnimationFrame(frame);
  } catch (error) {
    showFatalError(
      "The game stopped while running",
      error && error.message ? error.message : String(error),
    );
  }
}
engineReady = true;
$("startbtn").disabled = false;
$("startbtn").textContent = "START DRIVING";
requestAnimationFrame(frame);
say("");
