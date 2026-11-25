"use strict";
// =============================================================================
// src/input.js — keyboard plus floating mobile swipe steering and action buttons.
// STEERING SIGNS ARE INTENTIONAL: A/left = +1, D/right = -1.
// =============================================================================
function pressed(name) { return !!keys[name] || !!touch[name]; }
function steeringInput() {
  const l=pressed("a")||pressed("arrowleft")||pressed("left");
  const r=pressed("d")||pressed("arrowright")||pressed("right");
  return (l?1:0)-(r?1:0);
}
function activateBoost() {
  if(onFoot||!controlled||controlled.parked)return;
  if(controlled.boostCooldown>0){say("Boost recharging",700);return;}
  controlled.boostTime=1.15; controlled.boostCooldown=4.0; say("TURBO!",700);
}
function setHudProfile(mode) {
  const selected=mode==="auto"?(matchMedia("(pointer: coarse)").matches||innerWidth<=760?"mobile":"desktop"):mode;
  document.body.classList.toggle("hud-mobile",selected==="mobile");
  document.body.classList.toggle("hud-desktop",selected==="desktop");
  const button=$("profileToggle"); button.textContent=mode.toUpperCase();
  button.setAttribute("aria-label","HUD layout: "+mode+". Change layout");
  try { localStorage.setItem("toyCityHudMode",mode); } catch(_){}
  window.toyCityHudMode=mode;
}
let hudMode="auto";
try { const saved=localStorage.getItem("toyCityHudMode"); if(["auto","desktop","mobile"].includes(saved))hudMode=saved; } catch(_){}
setHudProfile(hudMode);
$("profileToggle").addEventListener("click",()=>{hudMode=({auto:"desktop",desktop:"mobile",mobile:"auto"})[hudMode];setHudProfile(hudMode);});
window.addEventListener("resize",()=>{if(hudMode==="auto")setHudProfile("auto");});
window.addEventListener("keydown",e=>{
  const k=e.key.toLowerCase();
  if(["arrowup","arrowdown","arrowleft","arrowright"," ","w","a","s","d","e","c","shift"].includes(k))e.preventDefault();
  keys[k]=true;
  if(k==="e"&&!e.repeat)interact();
  if(k==="g"&&!e.repeat)skipActivity();
  if(k==="shift"&&!e.repeat)activateBoost();
  if(k==="c"&&!e.repeat){cameraMode=(cameraMode+1)%3;say(["Chase camera","Closer camera","Wide camera"][cameraMode],800);}
});
window.addEventListener("keyup",e=>{keys[e.key.toLowerCase()]=false;});
window.addEventListener("blur",()=>{for(const k in keys)keys[k]=false;for(const k in touch)touch[k]=false;swipePointer=null;});
let swipePointer=null, swipeOriginX=0, swipeOriginY=0;
function releaseSwipe(){swipePointer=null;touch.left=false;touch.right=false;touch.gas=false;touch.brake=false;}
function updateSwipe(e){
  const dx=e.clientX-swipeOriginX, dy=e.clientY-swipeOriginY;
  const nx=Math.max(-1,Math.min(1,dx/58)), ny=Math.max(-1,Math.min(1,dy/58));
  touch.left=nx < -0.18; touch.right=nx > 0.18;
  touch.gas=ny < -0.18; touch.brake=ny > 0.72;
}
document.addEventListener("pointerdown",e=>{
  if(!document.body.classList.contains("hud-mobile")||e.pointerType==="mouse")return;
  if(e.target.closest("button,#dashboard,#upgradePanel,#startcover,#activity"))return;
  if(swipePointer!==null)return;
  swipePointer=e.pointerId;swipeOriginX=e.clientX;swipeOriginY=e.clientY;updateSwipe(e);
},{passive:true});
document.addEventListener("pointermove",e=>{if(e.pointerId===swipePointer)updateSwipe(e);},{passive:true});
document.addEventListener("pointerup",e=>{if(e.pointerId===swipePointer)releaseSwipe();},{passive:true});
document.addEventListener("pointercancel",e=>{if(e.pointerId===swipePointer)releaseSwipe();},{passive:true});
function bindAction(id,down,up){
  const el=$(id); if(!el)return;
  el.addEventListener("pointerdown",e=>{e.preventDefault();el.classList.add("active");try{el.setPointerCapture(e.pointerId);}catch(_){}down();});
  const release=e=>{e.preventDefault();el.classList.remove("active");if(up)up();};
  el.addEventListener("pointerup",release);el.addEventListener("pointercancel",release);el.addEventListener("lostpointercapture",release);
}
bindAction("brakeButton",()=>{touch.brake=true;},()=>{touch.brake=false;});
bindAction("boostButton",()=>activateBoost());
bindAction("interact",()=>interact());
