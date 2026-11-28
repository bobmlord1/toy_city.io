"use strict";
// =============================================================================
// src/renderer.js
// MeshBuilder (procedural toy geometry), shaders, lighting modes, matrices, draw().
// Pure rendering plumbing. No game rules live here.
// =============================================================================

// A tiny mesh builder keeps every visual asset inside this one HTML file.
class MeshBuilder {
  constructor() {
    this.data = [];
    this.material = [0.27, 0.015, 0];
  }
  useMaterial(roughness = 0.35, metallic = 0, texture = 0) {
    // T-029: toys are glossy molded plastic (roughness about 0.15 to 0.35); the ground, roads and
    // concrete are a satin play mat (about 0.8 to 0.95). The old mapping squeezed every value into
    // 0.17 to 0.36, so the lawn and roads were as shiny as the toys and caught sky glare.
    const toyRoughness = clamp(roughness, 0.15, 0.95);
    const toyMetallic = clamp(metallic, 0, 0.85) * 0.2; // painted toy metal, never bare chrome
    this.material = [toyRoughness, toyMetallic, 0];
  }
  tri(a, b, c, color, na = null, nb = null, nc = null) {
    const n = normalize(
      cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]),
    );
    const m = this.material;
    for (const [p, norm] of [
      [a, na || n],
      [b, nb || n],
      [c, nc || n],
    ])
      this.data.push(
        p[0],
        p[1],
        p[2],
        norm[0],
        norm[1],
        norm[2],
        color[0],
        color[1],
        color[2],
        m[0],
        m[1],
        m[2],
      );
  }
  quad(a, b, c, d, color, normal = null) {
    this.tri(a, b, c, color, normal, normal, normal);
    this.tri(a, c, d, color, normal, normal, normal);
  }
  box(x0, y0, z0, x1, y1, z1, color) {
    const a = [x0, y0, z0],
      b = [x1, y0, z0],
      c = [x1, y1, z0],
      d = [x0, y1, z0];
    const e = [x0, y0, z1],
      f = [x1, y0, z1],
      g = [x1, y1, z1],
      h = [x0, y1, z1];
    this.quad(e, f, g, h, color, [0, 0, 1]);
    this.quad(b, a, d, c, color, [0, 0, -1]);
    this.quad(f, b, c, g, color, [1, 0, 0]);
    this.quad(a, e, h, d, color, [-1, 0, 0]);
    this.quad(h, g, c, d, color, [0, 1, 0]);
    this.quad(a, b, f, e, color, [0, -1, 0]);
  }
  cylinderY(cx, cy, cz, r, h, color, segments = 12) {
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2,
        b = ((i + 1) / segments) * Math.PI * 2;
      const p0 = [cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r],
        p1 = [cx + Math.cos(b) * r, cy, cz + Math.sin(b) * r];
      const q0 = [p0[0], cy + h, p0[2]],
        q1 = [p1[0], cy + h, p1[2]];
      this.tri(p0, p1, q1, color);
      this.tri(p0, q1, q0, color);
      this.tri([cx, cy, cz], p1, p0, color);
      this.tri([cx, cy + h, cz], q0, q1, color);
    }
  }
  cylinderX(cx, cy, cz, r, len, color, segments = 10) {
    const x0 = cx - len / 2,
      x1 = cx + len / 2;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2,
        b = ((i + 1) / segments) * Math.PI * 2;
      const p0 = [x0, cy + Math.cos(a) * r, cz + Math.sin(a) * r],
        p1 = [x0, cy + Math.cos(b) * r, cz + Math.sin(b) * r];
      const q0 = [x1, p0[1], p0[2]],
        q1 = [x1, p1[1], p1[2]];
      this.tri(p0, p1, q1, color);
      this.tri(p0, q1, q0, color);
      this.tri([x0, cy, cz], p0, p1, [0.12, 0.14, 0.16]);
      this.tri([x1, cy, cz], q1, q0, [0.12, 0.14, 0.16]);
    }
  }
  cone(cx, cy, cz, r, h, color, segments = 8) {
    const tip = [cx, cy + h, cz];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2,
        b = ((i + 1) / segments) * Math.PI * 2;
      this.tri(
        [cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r],
        [cx + Math.cos(b) * r, cy, cz + Math.sin(b) * r],
        tip,
        color,
      );
    }
  }
  finish() {
    const data = new Float32Array(this.data);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buffer, count: data.length / 12 };
  }
}

const vs = `
precision mediump float;
attribute vec3 aPosition; attribute vec3 aNormal; attribute vec3 aColor; attribute vec3 aMaterial;
uniform mat4 uViewProj; uniform mat4 uModel; uniform mediump vec3 uCamera;
varying vec3 vColor; varying vec3 vNormal; varying vec3 vWorld; varying vec3 vMaterial; varying float vFog;
void main(){
 vec4 world=uModel*vec4(aPosition,1.0); gl_Position=uViewProj*world;
 vNormal=normalize(mat3(uModel)*aNormal); vWorld=world.xyz; vColor=aColor; vMaterial=aMaterial;
 vFog=smoothstep(480.0,1050.0,distance(uCamera,world.xyz));
}`;
const fs = `
precision mediump float;
uniform vec3 uFogColor; uniform vec3 uSunDirection; uniform vec3 uSunColor;
uniform vec3 uSkyAmbient; uniform vec3 uGroundAmbient; uniform mediump vec3 uCamera;
varying vec3 vColor; varying vec3 vNormal; varying vec3 vWorld; varying vec3 vMaterial; varying float vFog;
const float PI=3.14159265;
const float TOY_AMBIENT=0.7; const float TOY_REFLECT=0.75; const float TOY_REFLECT_MAX=0.45; const float TOY_EXPOSURE=0.8; const float TOY_SHADE_SATURATION=0.3;
vec3 fresnelSchlick(float cosTheta,vec3 f0){return f0+(1.0-f0)*pow(1.0-cosTheta,5.0);}
float distributionGGX(vec3 N,vec3 H,float roughness){float a=roughness*roughness;float a2=a*a;float nDotH=max(dot(N,H),0.0);float n2=nDotH*nDotH;float d=n2*(a2-1.0)+1.0;return a2/max(PI*d*d,0.001);}
float geometrySchlickGGX(float nDotV,float roughness){float r=roughness+1.0;float k=(r*r)/8.0;return nDotV/max(nDotV*(1.0-k)+k,0.001);}
void main(){
 vec3 N=normalize(vNormal),V=normalize(uCamera-vWorld),L=normalize(uSunDirection),H=normalize(V+L);
 float roughness=clamp(vMaterial.x,0.14,0.95),metallic=clamp(vMaterial.y,0.0,0.45);
 // Flat, saturated vertex colors are intentional: every object should read as molded toy plastic.
 vec3 base=pow(max(vColor,vec3(0.0)),vec3(2.2));
 float nDotL=max(dot(N,L),0.0),nDotV=max(dot(N,V),0.001),vDotH=max(dot(V,H),0.0);
 vec3 F0=mix(vec3(0.045),base,metallic),F=fresnelSchlick(vDotH,F0);
 float D=distributionGGX(N,H,roughness),G=geometrySchlickGGX(nDotV,roughness)*geometrySchlickGGX(nDotL,roughness);
 vec3 sunSpec=(D*G*F)/max(4.0*nDotV*nDotL,0.001);
 vec3 sunDiffuse=(1.0-F)*(1.0-metallic)*base/PI;
 vec3 directSun=(sunDiffuse+sunSpec*2.15)*uSunColor*nDotL;
 // A broad studio-style fill source creates readable glossy highlights on the toy surfaces.
 // Studio fill: a soft second light from the opposite side so shaded faces keep their shape.
 vec3 fillL=normalize(vec3(-0.58,0.62,-0.53)),fillH=normalize(V+fillL);
 float fillNdotL=max(dot(N,fillL),0.0);
 float fillD=distributionGGX(N,fillH,roughness*1.18);
 vec3 directFill=(base*(1.0-metallic)/PI*vec3(.20,.24,.32)+F0*fillD*0.18*vec3(.85,.92,1.0))*fillNdotL;
 // Ambient multiplies the base color, so faces in shade stay saturated instead of turning grey.
 float hemi=clamp(N.y*0.5+0.5,0.0,1.0);
 vec3 ambient=mix(uGroundAmbient,uSkyAmbient,hemi);
 float groundBounce=0.16*(1.0-hemi)*clamp(1.0-vWorld.y/20.0,0.0,1.0);
 vec3 indirectDiffuse=base*(1.0-metallic)*(ambient*TOY_AMBIENT+uGroundAmbient*groundBounce);
 // Glossy plastic reflects its surroundings only at glancing angles (Fresnel). A procedural
 // sky/horizon/ground gradient stands in for an environment map: faces turned toward the camera
 // keep their pure color, edges and faces seen side-on pick up a bright sky sheen.
 vec3 R=reflect(-V,N);
 float up=R.y;
 vec3 skyLin=vec3(0.78,0.84,0.95);
 vec3 env=mix(pow(uGroundAmbient,vec3(2.2))*0.6,vec3(1.0,1.02,1.05),smoothstep(-0.2,0.02,up));
 env=mix(env,skyLin,smoothstep(0.05,0.55,up));
 float glossy=1.0-smoothstep(0.15,0.6,roughness);
 vec3 envF=min(fresnelSchlick(nDotV,F0),vec3(TOY_REFLECT_MAX))*glossy;
 vec3 indirectSpecular=env*envF*TOY_REFLECT;
 vec3 color=(directSun+directFill+indirectDiffuse)*(1.0-envF)+indirectSpecular;
 color*=TOY_EXPOSURE;
 vec3 fogLinear=pow(max(uFogColor,vec3(0.0)),vec3(2.2));
 color=mix(color,fogLinear,vFog);
 // Filmic (ACES-style) curve on brightness only: keeps mid-tones punchy and a strong red red,
 // where the old per-channel curve pulled every color toward grey and pink.
 float lum=dot(color,vec3(0.2126,0.7152,0.0722));
 float mapped=clamp(lum*(2.51*lum+0.03)/(lum*(2.43*lum+0.59)+0.14),0.0,1.0);
 color*=mapped/max(lum,0.0001);
 // Faces turned away from the sun keep (slightly boost) their color, so a yellow wall in shade
 // reads as deep yellow rather than olive.
 float shadeAmount=1.0-clamp(nDotL*1.6,0.0,1.0);
 color=max(mix(vec3(dot(color,vec3(0.2126,0.7152,0.0722))),color,1.0+TOY_SHADE_SATURATION*shadeAmount),0.0);
 // Anything still over 1.0 (a hot highlight) blends toward white like a real overexposed sheen.
 float over=max(max(color.r,max(color.g,color.b))-1.0,0.0);
 color=mix(color,vec3(1.0),clamp(over*0.6,0.0,1.0));
 color=pow(clamp(color,0.0,1.0),vec3(1.0/2.2));
 gl_FragColor=vec4(color,1.0);
}`;
function shader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) || "Unknown shader compilation error");
  return s;
}
const fallbackFs = `
precision mediump float;
uniform vec3 uFogColor; uniform vec3 uSunDirection; uniform vec3 uSunColor;
uniform vec3 uSkyAmbient; uniform vec3 uGroundAmbient; uniform mediump vec3 uCamera;
varying vec3 vColor; varying vec3 vNormal; varying vec3 vWorld; varying vec3 vMaterial; varying float vFog;
// Simple lighting: the same toy look as the PBR shader (T-029) with a cheaper Blinn-Phong highlight.
void main(){
 vec3 N=normalize(vNormal),V=normalize(uCamera-vWorld),L=normalize(uSunDirection);
 float roughness=clamp(vMaterial.x,0.14,0.95),metallic=clamp(vMaterial.y,0.0,0.45);
 vec3 base=pow(max(vColor,vec3(0.0)),vec3(2.2));
 float ndl=max(dot(N,L),0.0),ndv=max(dot(N,V),0.001),hemi=clamp(N.y*0.5+0.5,0.0,1.0);
 vec3 ambient=mix(uGroundAmbient,uSkyAmbient,hemi);
 vec3 H=normalize(L+V);
 float glossy=1.0-smoothstep(0.15,0.6,roughness);
 float shine=pow(max(dot(N,H),0.0),mix(160.0,18.0,roughness))*mix(0.15,1.0,glossy);
 vec3 f0=mix(vec3(0.045),base,metallic);
 vec3 fillL=normalize(vec3(-0.58,0.62,-0.53));
 vec3 color=base*(1.0-metallic)*(uSunColor*ndl/3.14159+vec3(.2,.24,.32)*max(dot(N,fillL),0.0)/3.14159+ambient*0.7)
   +(f0+0.3)*shine*ndl*uSunColor*0.9;
 vec3 R=reflect(-V,N);
 vec3 env=mix(pow(uGroundAmbient,vec3(2.2))*0.6,vec3(1.0,1.02,1.05),smoothstep(-0.2,0.02,R.y));
 env=mix(env,vec3(0.78,0.84,0.95),smoothstep(0.05,0.55,R.y));
 float fres=min(0.045+0.955*pow(1.0-ndv,5.0),0.45)*glossy;
 color=color*(1.0-fres)+env*fres*0.75;
 color*=0.8;
 vec3 fogLinear=pow(max(uFogColor,vec3(0.0)),vec3(2.2));
 color=mix(color,fogLinear,vFog);
 float lum=dot(color,vec3(0.2126,0.7152,0.0722));
 color*=clamp(lum*(2.51*lum+0.03)/(lum*(2.43*lum+0.59)+0.14),0.0,1.0)/max(lum,0.0001);
 float shade=1.0-clamp(ndl*1.6,0.0,1.0);
 color=max(mix(vec3(dot(color,vec3(0.2126,0.7152,0.0722))),color,1.0+0.3*shade),0.0);
 float over=max(max(color.r,max(color.g,color.b))-1.0,0.0);
 color=mix(color,vec3(1.0),clamp(over*0.6,0.0,1.0));
 gl_FragColor=vec4(pow(clamp(color,0.0,1.0),vec3(1.0/2.2)),1.0);
}`;
function buildProgram(fragmentSource) {
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) || "Unknown shader link error");
  return p;
}
function buildProgramFromSources(vertexSource, fragmentSource) {
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) || "Unknown shader link error");
  return p;
}
const shadowVS = `
precision mediump float;
attribute vec3 aShadowPosition;
attribute float aShadowAlpha;
uniform mat4 uShadowViewProj;
varying float vShadowAlpha;
void main(){gl_Position=uShadowViewProj*vec4(aShadowPosition,1.0);vShadowAlpha=aShadowAlpha;}
`;
const shadowFS = `
precision mediump float;
varying float vShadowAlpha;
void main(){gl_FragColor=vec4(.035,.055,.045,vShadowAlpha);}
`;
let shadowProgram = null;
try {
  shadowProgram = buildProgramFromSources(shadowVS, shadowFS);
} catch (shadowError) {
  console.warn(
    "Soft projected shadows are unavailable on this WebGL implementation.",
    shadowError,
  );
}
let advancedProgram = null,
  simpleProgram = null,
  activeProgram = null,
  activeLighting = "simple",
  loc = null;
try {
  advancedProgram = buildProgram(fs);
} catch (primaryError) {
  console.warn("Advanced PBR shader unavailable; using simple glossy lighting.", primaryError);
}
try {
  simpleProgram = buildProgram(fallbackFs);
} catch (simpleError) {
  if (!advancedProgram) throw simpleError;
  console.warn("Simple lighting shader unavailable; using PBR for both modes.", simpleError);
  simpleProgram = advancedProgram;
}
function locationsFor(p) {
  return {
    pos: gl.getAttribLocation(p, "aPosition"),
    norm: gl.getAttribLocation(p, "aNormal"),
    color: gl.getAttribLocation(p, "aColor"),
    material: gl.getAttribLocation(p, "aMaterial"),
    vp: gl.getUniformLocation(p, "uViewProj"),
    model: gl.getUniformLocation(p, "uModel"),
    camera: gl.getUniformLocation(p, "uCamera"),
    fog: gl.getUniformLocation(p, "uFogColor"),
    sunDir: gl.getUniformLocation(p, "uSunDirection"),
    sunColor: gl.getUniformLocation(p, "uSunColor"),
    sky: gl.getUniformLocation(p, "uSkyAmbient"),
    ground: gl.getUniformLocation(p, "uGroundAmbient"),
  };
}
const fogColor = [0.61, 0.76, 0.81];
// T-029 toy daylight. A strong warm sun against a softer sky fill gives each face of a block a
// clearly different shade (about 3:1 lit to shaded), which is what makes simple shapes read as
// solid plastic toys. The old sun was barely brighter than the ambient light, so faces looked flat.
const TOY_LIGHT = {
  sunDirection: [-0.45, 0.82, 0.36], // unchanged: shadows.js projects with the same direction
  sunColor: [2.9, 2.68, 2.3],
  skyAmbient: [0.58, 0.68, 0.84],
  groundAmbient: [0.34, 0.36, 0.28],
};
function activateLighting(mode, notify = false) {
  const useAdvanced = mode === "advanced" && !!advancedProgram;
  activeLighting = useAdvanced ? "advanced" : "simple";
  activeProgram = useAdvanced ? advancedProgram : simpleProgram;
  gl.useProgram(activeProgram);
  loc = locationsFor(activeProgram);
  gl.uniform3fv(loc.fog, fogColor);
  gl.uniform3fv(loc.sunDir, normalize(TOY_LIGHT.sunDirection));
  gl.uniform3fv(loc.sunColor, TOY_LIGHT.sunColor);
  gl.uniform3fv(loc.sky, TOY_LIGHT.skyAmbient);
  gl.uniform3fv(loc.ground, TOY_LIGHT.groundAmbient);
  const toggle = $("lightingToggle");
  toggle.dataset.mode = activeLighting;
  if (!advancedProgram) {
    toggle.textContent = "ADVANCED LIGHTING UNAVAILABLE";
    toggle.setAttribute("aria-label", "Advanced PBR lighting is unavailable; simple lighting is active.");
    toggle.disabled = true;
    toggle.title = "This GPU/browser could not compile the advanced PBR shader.";
  } else if (simpleProgram === advancedProgram) {
    toggle.textContent = "ADVANCED LIGHTING: ON";
    toggle.setAttribute("aria-label", "Advanced PBR lighting is active. Simple comparison lighting is unavailable.");
    toggle.disabled = true;
    toggle.title = "Advanced PBR is active; the simple comparison shader was unavailable.";
  } else {
    toggle.disabled = false;
    toggle.textContent = activeLighting === "advanced" ? "ADVANCED LIGHTING: ON" : "ADVANCED LIGHTING: OFF";
    toggle.setAttribute("aria-label", activeLighting === "advanced"
      ? "Advanced PBR lighting is on. Switch to simple lighting."
      : "Advanced PBR lighting is off. Switch to advanced lighting.");
    toggle.title = "Choose the glossy lighting style before starting the game.";
  }
  if (notify)
    say(
      activeLighting === "advanced"
        ? "Advanced PBR lighting enabled."
        : "Simple glossy lighting enabled.",
      1400,
    );
}
activateLighting(advancedProgram ? "advanced" : "simple");
$("lightingToggle").addEventListener("click", () =>
  activateLighting(activeLighting === "advanced" ? "simple" : "advanced", true),
);
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);
gl.disable(gl.CULL_FACE);
gl.clearColor(...fogColor, 1);
function matMul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2),
    nf = 1 / (near - far);
  const o = new Float32Array(16);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) * nf;
  o[11] = -1;
  o[14] = 2 * far * near * nf;
  return o;
}
function lookAt(eye, target, up) {
  const z = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]),
    x = normalize(cross(up, z)),
    y = cross(z, x);
  return new Float32Array([
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -dot(x, eye),
    -dot(y, eye),
    -dot(z, eye),
    1,
  ]);
}
function modelMatrix(x, y, z, yaw, scale = 1, pitch = 0, roll = 0) {
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch),
    cr = Math.cos(roll),
    sr = Math.sin(roll);
  // Yaw * local pitch * local roll lets the chassis visibly dive, squat and lean on suspension.
  const m00 = cy * cr + sy * sp * sr,
    m01 = -cy * sr + sy * sp * cr,
    m02 = sy * cp;
  const m10 = cp * sr,
    m11 = cp * cr,
    m12 = -sp;
  const m20 = -sy * cr + cy * sp * sr,
    m21 = sy * sr + cy * sp * cr,
    m22 = cy * cp;
  return new Float32Array([
    m00 * scale,
    m10 * scale,
    m20 * scale,
    0,
    m01 * scale,
    m11 * scale,
    m21 * scale,
    0,
    m02 * scale,
    m12 * scale,
    m22 * scale,
    0,
    x,
    y,
    z,
    1,
  ]);
}
function draw(mesh, model, vp, camera) {
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
  gl.enableVertexAttribArray(loc.pos);
  gl.enableVertexAttribArray(loc.norm);
  gl.enableVertexAttribArray(loc.color);
  gl.enableVertexAttribArray(loc.material);
  gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 48, 0);
  gl.vertexAttribPointer(loc.norm, 3, gl.FLOAT, false, 48, 12);
  gl.vertexAttribPointer(loc.color, 3, gl.FLOAT, false, 48, 24);
  gl.vertexAttribPointer(loc.material, 3, gl.FLOAT, false, 48, 36);
  gl.uniformMatrix4fv(loc.model, false, model);
  if (mesh.indexBuffer) {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  } else {
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }
}
function translationMatrix(x, y, z) {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}
function rotationXMatrix(a) {
  const c = Math.cos(a),
    s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}
function rotationYMatrix(a) {
  const c = Math.cos(a),
    s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}
function wheelPartMatrix(root, wheel, spin, steer) {
  const p = wheel.pivot;
  // The wheel mesh is centered on its GLB node pivot. Steering occurs first,
  // then the tire rolls around its local axle (X axis).
  return matMul(
    matMul(
      matMul(root, translationMatrix(p[0], p[1], p[2])),
      rotationYMatrix(wheel.steer ? steer : 0),
    ),
    rotationXMatrix(spin),
  );
}
function drawVehicleVisual(visual, root, spin, steer, vp, camera) {
  draw(visual.body, root, vp, camera);
  for (const wheel of visual.wheels) {
    const wm = wheelPartMatrix(root, wheel, spin, steer);
    draw(wheel.mesh, wm, vp, camera);
  }
}
