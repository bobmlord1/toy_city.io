(() => {
'use strict';
const canvas = document.getElementById('game');
const gl = canvas.getContext('webgl', {antialias:true, alpha:false, powerPreference:'high-performance'}) || canvas.getContext('experimental-webgl', {antialias:true, alpha:false});
if (!gl) {
  document.getElementById('startcard').innerHTML = '<h1>3D graphics unavailable</h1><p>This browser could not start WebGL. Try opening this file in a current version of Safari, Chrome, Firefox or Edge with hardware acceleration enabled.</p>';
  return;
}
const $ = id => document.getElementById(id);
let started = false;
let engineReady = false;
function showFatalError(title, detail) {
  started = false;
  const cover = $('startcover');
  const card = $('startcard');
  cover.style.display = 'flex';
  card.replaceChildren();
  const heading = document.createElement('h1');
  heading.textContent = title;
  const message = document.createElement('p');
  message.textContent = detail || 'The browser could not initialize the 3D game.';
  const advice = document.createElement('p');
  advice.className = 'small';
  advice.textContent = 'Try a current desktop browser with hardware acceleration and WebGL enabled. Reload this file after changing browser settings.';
  card.append(heading, message, advice);
}
window.addEventListener('error', event => {
  showFatalError('The game could not start', event.message || 'A graphics or JavaScript initialization error occurred.');
});
window.addEventListener('unhandledrejection', event => {
  showFatalError('The game could not start', String(event.reason || 'An unexpected startup error occurred.'));
});
$('startbtn').addEventListener('click', () => {
  if (!engineReady) {
    say('The 3D world is still initializing. Please wait a moment.');
    return;
  }
  $('startcover').style.display = 'none';
  started = true;
  canvas.focus();
  say('Your car is ready. Explore wherever you like!', 2600);
});
const vehicleNameEl = $('vehicleName'), speedEl = $('speed'), hintEl = $('hint'), messageEl = $('message');
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const lerp = (a,b,t) => a+(b-a)*t;
const hypot = Math.hypot;
const V3 = (x=0,y=0,z=0) => [x,y,z];
const normalize = v => { const l=Math.hypot(v[0],v[1],v[2])||1; return [v[0]/l,v[1]/l,v[2]/l]; };
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}

// A tiny mesh builder keeps every visual asset inside this one HTML file.
class MeshBuilder {
  constructor(){ this.data=[]; this.material=[.27,.015,0]; }
  useMaterial(roughness=.35,metallic=0,texture=0){
    // This world is a molded-plastic toy set: glossy dielectric surfaces, not gritty photorealistic materials.
    const toyRoughness=clamp(.15+clamp(roughness,0,1)*.19,.17,.36);
    const toyMetallic=clamp(metallic,0,.3)*.12;
    this.material=[toyRoughness,toyMetallic,0];
  }
  tri(a,b,c,color,na=null,nb=null,nc=null){
    const n = normalize(cross([b[0]-a[0],b[1]-a[1],b[2]-a[2]],[c[0]-a[0],c[1]-a[1],c[2]-a[2]]));
    const m=this.material;
    for (const [p,norm] of [[a,na||n],[b,nb||n],[c,nc||n]]) this.data.push(p[0],p[1],p[2],norm[0],norm[1],norm[2],color[0],color[1],color[2],m[0],m[1],m[2]);
  }
  quad(a,b,c,d,color,normal=null){ this.tri(a,b,c,color,normal,normal,normal); this.tri(a,c,d,color,normal,normal,normal); }
  box(x0,y0,z0,x1,y1,z1,color){
    const a=[x0,y0,z0],b=[x1,y0,z0],c=[x1,y1,z0],d=[x0,y1,z0];
    const e=[x0,y0,z1],f=[x1,y0,z1],g=[x1,y1,z1],h=[x0,y1,z1];
    this.quad(e,f,g,h,color,[0,0,1]); this.quad(b,a,d,c,color,[0,0,-1]);
    this.quad(f,b,c,g,color,[1,0,0]); this.quad(a,e,h,d,color,[-1,0,0]);
    this.quad(h,g,c,d,color,[0,1,0]); this.quad(a,b,f,e,color,[0,-1,0]);
  }
  cylinderY(cx,cy,cz,r,h,color,segments=12){
    for(let i=0;i<segments;i++){
      const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
      const p0=[cx+Math.cos(a)*r,cy,cz+Math.sin(a)*r],p1=[cx+Math.cos(b)*r,cy,cz+Math.sin(b)*r];
      const q0=[p0[0],cy+h,p0[2]],q1=[p1[0],cy+h,p1[2]];
      this.tri(p0,p1,q1,color); this.tri(p0,q1,q0,color);
      this.tri([cx,cy,cz],p1,p0,color); this.tri([cx,cy+h,cz],q0,q1,color);
    }
  }
  cylinderX(cx,cy,cz,r,len,color,segments=10){
    const x0=cx-len/2,x1=cx+len/2;
    for(let i=0;i<segments;i++){
      const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
      const p0=[x0,cy+Math.cos(a)*r,cz+Math.sin(a)*r],p1=[x0,cy+Math.cos(b)*r,cz+Math.sin(b)*r];
      const q0=[x1,p0[1],p0[2]],q1=[x1,p1[1],p1[2]];
      this.tri(p0,p1,q1,color); this.tri(p0,q1,q0,color);
      this.tri([x0,cy,cz],p0,p1,[.12,.14,.16]); this.tri([x1,cy,cz],q1,q0,[.12,.14,.16]);
    }
  }
  cone(cx,cy,cz,r,h,color,segments=8){
    const tip=[cx,cy+h,cz];
    for(let i=0;i<segments;i++){
      const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
      this.tri([cx+Math.cos(a)*r,cy,cz+Math.sin(a)*r],[cx+Math.cos(b)*r,cy,cz+Math.sin(b)*r],tip,color);
    }
  }
  finish(){ const data=new Float32Array(this.data); const buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW); return {buffer,count:data.length/12}; }
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
vec3 fresnelSchlick(float cosTheta,vec3 f0){return f0+(1.0-f0)*pow(1.0-cosTheta,5.0);}
float distributionGGX(vec3 N,vec3 H,float roughness){float a=roughness*roughness;float a2=a*a;float nDotH=max(dot(N,H),0.0);float n2=nDotH*nDotH;float d=n2*(a2-1.0)+1.0;return a2/max(PI*d*d,0.001);}
float geometrySchlickGGX(float nDotV,float roughness){float r=roughness+1.0;float k=(r*r)/8.0;return nDotV/max(nDotV*(1.0-k)+k,0.001);}
void main(){
 vec3 N=normalize(vNormal),V=normalize(uCamera-vWorld),L=normalize(uSunDirection),H=normalize(V+L);
 float roughness=clamp(vMaterial.x,0.14,0.58),metallic=clamp(vMaterial.y,0.0,0.12);
 // Flat, saturated vertex colors are intentional: every object should read as molded toy plastic.
 vec3 base=pow(max(vColor,vec3(0.0)),vec3(2.2));
 float nDotL=max(dot(N,L),0.0),nDotV=max(dot(N,V),0.001),vDotH=max(dot(V,H),0.0);
 vec3 F0=mix(vec3(0.045),base,metallic),F=fresnelSchlick(vDotH,F0);
 float D=distributionGGX(N,H,roughness),G=geometrySchlickGGX(nDotV,roughness)*geometrySchlickGGX(nDotL,roughness);
 vec3 sunSpec=(D*G*F)/max(4.0*nDotV*nDotL,0.001);
 vec3 sunDiffuse=(1.0-F)*(1.0-metallic)*base/PI;
 vec3 directSun=(sunDiffuse+sunSpec*2.15)*uSunColor*nDotL;
 // A broad studio-style fill source creates readable glossy highlights on the toy surfaces.
 vec3 fillL=normalize(vec3(-0.58,0.62,-0.53)),fillH=normalize(V+fillL);
 float fillNdotL=max(dot(N,fillL),0.0),fillNdotH=max(dot(N,fillH),0.0);
 vec3 fillF=fresnelSchlick(max(dot(V,fillH),0.0),F0);
 float fillD=distributionGGX(N,fillH,roughness*1.18);
 float fillG=geometrySchlickGGX(nDotV,roughness*1.18)*geometrySchlickGGX(fillNdotL,roughness*1.18);
 vec3 fillSpec=(fillD*fillG*fillF)/max(4.0*nDotV*max(fillNdotL,0.001),0.001);
 vec3 fillDiffuse=(1.0-fillF)*(1.0-metallic)*base/PI;
 vec3 directFill=(fillDiffuse*vec3(.18,.22,.30)+fillSpec*vec3(.85,.92,1.0)*1.25)*fillNdotL;
 // Hemispherical ambient light and a ground bounce approximate diffuse global illumination.
 float hemi=clamp(N.y*0.5+0.5,0.0,1.0);
 vec3 ambient=mix(uGroundAmbient,uSkyAmbient,hemi);
 float groundBounce=0.16*(1.0-hemi)*clamp(1.0-vWorld.y/20.0,0.0,1.0);
 vec3 indirectDiffuse=base*(1.0-metallic)*(ambient*0.78+uGroundAmbient*groundBounce);
 vec3 environmentTint=mix(uGroundAmbient,uSkyAmbient,0.72);
 vec3 indirectSpecular=F0*environmentTint*(1.15-roughness*0.75);
 vec3 color=directSun+directFill+indirectDiffuse+indirectSpecular;
 vec3 fogLinear=pow(max(uFogColor,vec3(0.0)),vec3(2.2));
 color=mix(color,fogLinear,vFog);
 color=color/(color+vec3(0.52));
 color=pow(max(color,vec3(0.0)),vec3(1.0/2.2));
 gl_FragColor=vec4(color,1.0);
}`;
function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Unknown shader compilation error');return s;}
const fallbackFs = `
precision mediump float;
uniform vec3 uFogColor; uniform vec3 uSunDirection; uniform vec3 uSunColor;
uniform vec3 uSkyAmbient; uniform vec3 uGroundAmbient; uniform mediump vec3 uCamera;
varying vec3 vColor; varying vec3 vNormal; varying vec3 vWorld; varying vec3 vMaterial; varying float vFog;
void main(){
 vec3 N=normalize(vNormal),V=normalize(uCamera-vWorld),L=normalize(uSunDirection);
 float roughness=clamp(vMaterial.x,0.14,0.65),metallic=clamp(vMaterial.y,0.0,0.12);
 vec3 base=pow(max(vColor,vec3(0.0)),vec3(2.2));
 float ndl=max(dot(N,L),0.0),hemi=clamp(N.y*0.5+0.5,0.0,1.0);
 vec3 ambient=mix(uGroundAmbient,uSkyAmbient,hemi);
 vec3 H=normalize(L+V);float shine=pow(max(dot(N,H),0.0),mix(105.0,22.0,roughness));
 vec3 f0=mix(vec3(0.045),base,metallic);
 vec3 color=base*(ambient*.85+uSunColor*ndl*.58)*(1.0-metallic*.65)+f0*shine*ndl*1.5;
 vec3 fogLinear=pow(max(uFogColor,vec3(0.0)),vec3(2.2));
 color=mix(color,fogLinear,vFog);color=color/(color+vec3(.58));
 gl_FragColor=vec4(pow(max(color,vec3(0.0)),vec3(1.0/2.2)),1.0);
}`;
function buildProgram(fragmentSource){
 const p=gl.createProgram();
 gl.attachShader(p,shader(gl.VERTEX_SHADER,vs));
 gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fragmentSource));
 gl.linkProgram(p);
 if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'Unknown shader link error');
 return p;
}
function buildProgramFromSources(vertexSource,fragmentSource){
 const p=gl.createProgram();
 gl.attachShader(p,shader(gl.VERTEX_SHADER,vertexSource));
 gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fragmentSource));
 gl.linkProgram(p);
 if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'Unknown shader link error');
 return p;
}
const shadowVS=`
precision mediump float;
attribute vec3 aShadowPosition;
attribute float aShadowAlpha;
uniform mat4 uShadowViewProj;
varying float vShadowAlpha;
void main(){gl_Position=uShadowViewProj*vec4(aShadowPosition,1.0);vShadowAlpha=aShadowAlpha;}
`;
const shadowFS=`
precision mediump float;
varying float vShadowAlpha;
void main(){gl_FragColor=vec4(.035,.055,.045,vShadowAlpha);}
`;
let shadowProgram=null;
try{shadowProgram=buildProgramFromSources(shadowVS,shadowFS);}
catch(shadowError){console.warn('Soft projected shadows are unavailable on this WebGL implementation.',shadowError);}
let advancedProgram=null,simpleProgram=null,activeProgram=null,activeLighting='simple',loc=null;
try { advancedProgram=buildProgram(fs); }
catch(primaryError) { console.warn('Advanced PBR shader unavailable; using simple glossy lighting.',primaryError); }
try { simpleProgram=buildProgram(fallbackFs); }
catch(simpleError) {
  if(!advancedProgram) throw simpleError;
  console.warn('Simple lighting shader unavailable; using PBR for both modes.',simpleError);
  simpleProgram=advancedProgram;
}
function locationsFor(p){return {pos:gl.getAttribLocation(p,'aPosition'),norm:gl.getAttribLocation(p,'aNormal'),color:gl.getAttribLocation(p,'aColor'),material:gl.getAttribLocation(p,'aMaterial'),vp:gl.getUniformLocation(p,'uViewProj'),model:gl.getUniformLocation(p,'uModel'),camera:gl.getUniformLocation(p,'uCamera'),fog:gl.getUniformLocation(p,'uFogColor'),sunDir:gl.getUniformLocation(p,'uSunDirection'),sunColor:gl.getUniformLocation(p,'uSunColor'),sky:gl.getUniformLocation(p,'uSkyAmbient'),ground:gl.getUniformLocation(p,'uGroundAmbient')};}
const fogColor=[0.61,0.76,0.81];
function activateLighting(mode,notify=false){
  const useAdvanced=mode==='advanced'&&!!advancedProgram;
  activeLighting=useAdvanced?'advanced':'simple';
  activeProgram=useAdvanced?advancedProgram:simpleProgram;
  gl.useProgram(activeProgram);
  loc=locationsFor(activeProgram);
  gl.uniform3fv(loc.fog,fogColor);
  gl.uniform3fv(loc.sunDir,normalize([-.45,.82,.36]));
  gl.uniform3fv(loc.sunColor,[1.85,1.7,1.48]);
  gl.uniform3fv(loc.sky,[.56,.67,.82]);
  gl.uniform3fv(loc.ground,[.30,.34,.25]);
  const toggle=$('lightingToggle');
  toggle.dataset.mode=activeLighting;
  if(!advancedProgram){toggle.textContent='SIMPLE LIGHTING · PBR UNAVAILABLE';toggle.disabled=true;toggle.title='This GPU/browser could not compile the advanced PBR shader.';}
  else if(simpleProgram===advancedProgram){toggle.textContent='ADVANCED PBR: ON';toggle.disabled=true;toggle.title='Advanced PBR is active; the simple comparison shader was unavailable.';}
  else {toggle.disabled=false;toggle.textContent=activeLighting==='advanced'?'ADVANCED PBR: ON · SWITCH':'ADVANCED PBR: OFF · SWITCH';toggle.title='Click to switch between advanced PBR and simple glossy lighting.';}
  if(notify)say(activeLighting==='advanced'?'Advanced PBR lighting enabled.':'Simple glossy lighting enabled.',1400);
}
activateLighting(advancedProgram?'advanced':'simple');
$('lightingToggle').addEventListener('click',()=>activateLighting(activeLighting==='advanced'?'simple':'advanced',true));
gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
gl.clearColor(...fogColor,1);
function matMul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}
function perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),nf=1/(near-far);const o=new Float32Array(16);o[0]=f/aspect;o[5]=f;o[10]=(far+near)*nf;o[11]=-1;o[14]=2*far*near*nf;return o;}
function lookAt(eye,target,up){const z=normalize([eye[0]-target[0],eye[1]-target[1],eye[2]-target[2]]),x=normalize(cross(up,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
function modelMatrix(x,y,z,yaw,scale=1,pitch=0,roll=0){
 const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
 // Yaw * local pitch * local roll lets the chassis visibly dive, squat and lean on suspension.
 const m00=cy*cr+sy*sp*sr,m01=-cy*sr+sy*sp*cr,m02=sy*cp;
 const m10=cp*sr,m11=cp*cr,m12=-sp;
 const m20=-sy*cr+cy*sp*sr,m21=sy*sr+cy*sp*cr,m22=cy*cp;
 return new Float32Array([m00*scale,m10*scale,m20*scale,0,m01*scale,m11*scale,m21*scale,0,m02*scale,m12*scale,m22*scale,0,x,y,z,1]);
}
function draw(mesh,model,vp,camera){gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.enableVertexAttribArray(loc.pos);gl.enableVertexAttribArray(loc.norm);gl.enableVertexAttribArray(loc.color);gl.enableVertexAttribArray(loc.material);gl.vertexAttribPointer(loc.pos,3,gl.FLOAT,false,48,0);gl.vertexAttribPointer(loc.norm,3,gl.FLOAT,false,48,12);gl.vertexAttribPointer(loc.color,3,gl.FLOAT,false,48,24);gl.vertexAttribPointer(loc.material,3,gl.FLOAT,false,48,36);gl.uniformMatrix4fv(loc.model,false,model);if(mesh.indexBuffer){gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.indexBuffer);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_SHORT,0);}else{gl.drawArrays(gl.TRIANGLES,0,mesh.count);}}
function translationMatrix(x,y,z){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]);}
function rotationXMatrix(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);}
function rotationYMatrix(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);}
function wheelPartMatrix(root,wheel,spin,steer){
 const p=wheel.pivot;
 // The wheel mesh is centered on its GLB node pivot. Steering occurs first,
 // then the tire rolls around its local axle (X axis).
 return matMul(matMul(matMul(root,translationMatrix(p[0],p[1],p[2])),rotationYMatrix(wheel.steer?steer:0)),rotationXMatrix(spin));
}
function drawVehicleVisual(visual,root,spin,steer,vp,camera){
 draw(visual.body,root,vp,camera);
 for(const wheel of visual.wheels){
  const wm=wheelPartMatrix(root,wheel,spin,steer);
  draw(wheel.mesh,wm,vp,camera);
 }
}


// The rolling landscape has several broad hills and low, driveable valleys.
const MPH_PER_MS=2.2369362920544;
const MPH_TO_MS=1/MPH_PER_MS;
// The tuning feature is a molded tabletop ramp on a deliberately flat terrain pad.
// Its surface is separate from terrainH(), so the surrounding landscape stays level.
const upgradeRamp={id:'upgrade',x:32,halfWidth:5.2,startZ:20,crestZ:26,flatEndZ:40,endZ:46,rise:1.25,flatY:0};
// Extra stunt ramps are toy props with matching drive-surface profiles. Keep their
// footprints clear of buildings and trees when adding new scenery.
const stuntRamps=[
 {id:'west-stunt',x:-78,halfWidth:4.6,startZ:-126,crestZ:-120,flatEndZ:-114,endZ:-108,rise:1.85,color:[.98,.36,.12]},
 {id:'east-stunt',x:78,halfWidth:4.8,startZ:-32,crestZ:-26,flatEndZ:-20,endZ:-14,rise:2.15,color:[.13,.72,.77]},
 {id:'north-stunt',x:-74,halfWidth:4.5,startZ:76,crestZ:82,flatEndZ:88,endZ:94,rise:1.75,color:[.75,.36,.92]}
];
const allRamps=[upgradeRamp,...stuntRamps];
function baseTerrainH(x,z){
  const hills = 4.1*Math.exp(-((x-48)*(x-48)+(z-45)*(z-45))/1000)
              + 3.2*Math.exp(-((x+55)*(x+55)+(z+42)*(z+42))/850)
              + 2.2*Math.exp(-((x-40)*(x-40)+(z+58)*(z+58))/700);
  return 0.55*Math.sin(x*.052)*Math.cos(z*.047)+0.72*Math.sin(z*.071)+0.42*Math.cos(x*.09+z*.025)+hills;
}
const smooth01=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
upgradeRamp.flatY=baseTerrainH(upgradeRamp.x,(upgradeRamp.startZ+upgradeRamp.endZ)*.5);
function terrainH(x,z){
  const base=baseTerrainH(x,z);
  // Flatten a generous central patch and blend its perimeter smoothly into the hills.
  const innerX=upgradeRamp.halfWidth+3.0,outerX=innerX+5.0;
  const innerZ=upgradeRamp.startZ-4.0;
  const farInnerZ=upgradeRamp.endZ+4.0;
  const wx=1-smooth01((Math.abs(x-upgradeRamp.x)-innerX)/(outerX-innerX));
  const wz=1-smooth01((Math.max(innerZ-z,z-farInnerZ)-0)/(5.0));
  const blend=wx*wz;
  return lerp(base,upgradeRamp.flatY,blend);
}
function profileForRamp(r,x,z){
  if(Math.abs(x-r.x)>r.halfWidth || z<=r.startZ || z>=r.endZ)return 0;
  if(z<r.crestZ)return r.rise*(z-r.startZ)/(r.crestZ-r.startZ);
  if(z<r.flatEndZ)return r.rise;
  return r.rise*(r.endZ-z)/(r.endZ-r.flatEndZ);
}
function rampProfile(x,z){
  let height=0;
  for(const r of allRamps)height=Math.max(height,profileForRamp(r,x,z));
  return height;
}
function driveSurfaceH(x,z){return terrainH(x,z)+rampProfile(x,z);}
function isOnUpgradeRamp(x,z){return Math.abs(x-upgradeRamp.x)<=upgradeRamp.halfWidth && z>=upgradeRamp.startZ && z<=upgradeRamp.endZ;}
function isNearAnyRamp(x,z,margin=1.5){return allRamps.some(r=>Math.abs(x-r.x)<r.halfWidth+margin&&z>r.startZ-margin&&z<r.endZ+margin);}
function terrainNormal(x,z){const e=.5;const dx=(terrainH(x+e,z)-terrainH(x-e,z))/(2*e),dz=(terrainH(x,z+e)-terrainH(x,z-e))/(2*e);return normalize([-dx,1,-dz]);}
const worldB=new MeshBuilder();
worldB.useMaterial(.97,0,1); // varied grass and soil
// Terrain grid.
const WORLD_HALF=440, WORLD_SIZE=880;
const N=336, step=WORLD_SIZE/N, start=-WORLD_HALF;
for(let iz=0;iz<N;iz++)for(let ix=0;ix<N;ix++){
 const x0=start+ix*step,x1=x0+step,z0=start+iz*step,z1=z0+step;
 const p00=[x0,terrainH(x0,z0),z0],p10=[x1,terrainH(x1,z0),z0],p11=[x1,terrainH(x1,z1),z1],p01=[x0,terrainH(x0,z1),z1];
 const avg=(p00[1]+p10[1]+p11[1]+p01[1])/4;
 let col=avg>3.2?[.34,.48,.29]:avg>1.6?[.31,.53,.31]:[.36,.57,.34];
 const n00=terrainNormal(x0,z0),n10=terrainNormal(x1,z0),n11=terrainNormal(x1,z1),n01=terrainNormal(x0,z1);
 worldB.tri(p00,p01,p11,col,n00,n01,n11); worldB.tri(p00,p11,p10,col,n00,n11,n10);
}
// Road and sidewalk surfaces are independent of the terrain mesh. Each asphalt
// cross-section samples terrain at both edges, eliminating terrain clipping.
const roadB=new MeshBuilder(),sidewalkB=new MeshBuilder();
function roadQuad(a,b,c,d,col){roadB.quad(a,b,c,d,col,[0,1,0]);}
const streetLines=[];
for(let n=-3.5;n<=3.5001;n+=1)streetLines.push(n*110);
roadB.useMaterial(.93,.015,2);
function addNorthSouthRoad(x,zA,zB,width){
 const seg=2;
 for(let z=zA;z<zB;z+=seg){const zn=Math.min(z+seg,zB),xl=x-width/2,xr=x+width/2;
  roadQuad([xl,terrainH(xl,z)+.26,z],[xl,terrainH(xl,zn)+.26,zn],[xr,terrainH(xr,zn)+.26,zn],[xr,terrainH(xr,z)+.26,z],[.18,.22,.23]);
 }
 for(let z=zA;z<zB;z+=10){const zn=Math.min(z+4,zB),y0=terrainH(x,z)+.33,y1=terrainH(x,zn)+.33;roadQuad([x-.12,y0,z],[x-.12,y1,zn],[x+.12,y1,zn],[x+.12,y0,z],[.85,.82,.64]);}
}
function addEastWestRoad(z,xA,xB,width){
 const seg=2;
 for(let x=xA;x<xB;x+=seg){const xn=Math.min(x+seg,xB),zn=z-width/2,zp=z+width/2;
  roadQuad([x,terrainH(x,zn)+.26,zn],[xn,terrainH(xn,zn)+.26,zn],[xn,terrainH(xn,zp)+.26,zp],[x,terrainH(x,zp)+.26,zp],[.18,.22,.23]);
 }
 for(let x=xA;x<xB;x+=10){const xn=Math.min(x+4,xB),y0=terrainH(x,z)+.33,y1=terrainH(xn,z)+.33;roadQuad([x,y0,z-.12],[xn,y1,z-.12],[xn,y1,z+.12],[x,y0,z+.12],[.85,.82,.64]);}
}
// Sidewalks are raised only slightly, with small gaps at intersections for clean crossings.
sidewalkB.useMaterial(.86,0,3);
function sidewalkStrip(vertical,line,side,a,b){
 for(let t=a;t<b;t+=2){const tn=Math.min(t+2,b),inner=line+side*4.95,outer=line+side*7.8;
  if(vertical)sidewalkB.quad([inner,terrainH(inner,t)+.34,t],[inner,terrainH(inner,tn)+.34,tn],[outer,terrainH(outer,tn)+.34,tn],[outer,terrainH(outer,t)+.34,t],[.57,.59,.57],[0,1,0]);
  else sidewalkB.quad([t,terrainH(t,inner)+.34,inner],[tn,terrainH(tn,inner)+.34,inner],[tn,terrainH(tn,outer)+.34,outer],[t,terrainH(t,outer)+.34,outer],[.57,.59,.57],[0,1,0]);
 }
}
for(const line of streetLines)for(const side of [-1,1]){
 let cursor=-440;
 for(const crossLine of streetLines){const gs=crossLine-9,ge=crossLine+9;if(gs>cursor)sidewalkStrip(true,line,side,cursor,gs);cursor=Math.max(cursor,ge);}
 if(cursor<440)sidewalkStrip(true,line,side,cursor,440);
 cursor=-440;
 for(const crossLine of streetLines){const gs=crossLine-9,ge=crossLine+9;if(gs>cursor)sidewalkStrip(false,line,side,cursor,gs);cursor=Math.max(cursor,ge);}
 if(cursor<440)sidewalkStrip(false,line,side,cursor,440);
}
const sidewalkMesh=sidewalkB.finish();
for(const x of streetLines)addNorthSouthRoad(x,-440,440,10);
for(const z of streetLines)addEastWestRoad(z,-440,440,10);
const roadMesh=roadB.finish();
// A compact yard apron, with painted parking lines.
worldB.useMaterial(.91,0,3); // worn concrete
worldB.box(-29,terrainH(-29,15)+.12,5,-5,terrainH(-29,15)+.22,27,[.34,.36,.34]);
for(let x=-24;x<-7;x+=5){const y=terrainH(x,15)+.25;worldB.box(x-.08,y,7,x+.08,y+.01,24,[.82,.82,.72]);}
// A toy-blue tabletop ramp: shallow up-slope, flat upgrade deck, shallow down-slope.
// The terrain underneath remains flat; driveSurfaceH() supplies the matching contact profile.
worldB.useMaterial(.22,.025,0);
{
 const r=upgradeRamp,left=r.x-r.halfWidth,right=r.x+r.halfWidth;
 const sections=[[r.startZ,r.crestZ],[r.crestZ,r.flatEndZ],[r.flatEndZ,r.endZ]];
 for(const [z0,z1] of sections){
  const p0=rampProfile(r.x,z0+.001),p1=rampProfile(r.x,z1-.001);
  const slope=(p1-p0)/(z1-z0),normal=normalize([0,1,-slope]);
  const y0=terrainH(r.x,z0)+rampProfile(r.x,z0)+.08;
  const y1=terrainH(r.x,z1)+rampProfile(r.x,z1)+.08;
  // Top surface and thick blue side cheeks make the ramp read as a separate toy prop.
  worldB.quad([left,y0,z0],[left,y1,z1],[right,y1,z1],[right,y0,z0],[.12,.43,.70],normal);
  const bottom0=terrainH(r.x,z0)+.015,bottom1=terrainH(r.x,z1)+.015;
  worldB.quad([left,bottom0,z0],[left,bottom1,z1],[left,y1,z1],[left,y0,z0],[.075,.27,.48],[-1,0,0]);
  worldB.quad([right,bottom0,z0],[right,y1,z0],[right,y1,z1],[right,bottom1,z1],[.075,.27,.48],[1,0,0]);
 }
 // Bright yellow edge blocks remain a clear visual guide to the upgrade platform.
 worldB.useMaterial(.18,0,0);
 for(const side of [-1,1]){
  for(let z=r.startZ+1.2;z<r.endZ-0.4;z+=2.8){
   const x=r.x+side*(r.halfWidth-.18),y=terrainH(x,z)+rampProfile(x,z)+.09;
   worldB.box(x-.14,y,z-.34,x+.14,y+.16,z+.34,[.99,.73,.12]);
  }
 }
 // The gold tuning pad is centered on the flat middle section, not on either slope.
 const px0=r.x-3.85,px1=r.x+3.85,pz0=31.2,pz1=37.2;
 const py=(x,z)=>terrainH(x,z)+rampProfile(x,z)+.16;
 worldB.quad([px0,py(px0,pz0),pz0],[px0,py(px0,pz1),pz1],[px1,py(px1,pz1),pz1],[px1,py(px1,pz0),pz0],[.98,.75,.16],[0,1,0]);
 worldB.useMaterial(.15,0,0);
 for(let z=32.0;z<36.8;z+=1.25){const y=terrainH(r.x,z)+rampProfile(r.x,z)+.19;worldB.box(r.x-3.25,y,z-.10,r.x+3.25,y+.025,z+.10,[1.0,.94,.58]);}
}
// Three smaller stunt ramps use contrasting glossy plastic colors. Their ramps sit
// directly on the terrain and their contact heights come from the same profile above.
for(const r of stuntRamps){
 const left=r.x-r.halfWidth,right=r.x+r.halfWidth;
 const sections=[[r.startZ,r.crestZ],[r.crestZ,r.flatEndZ],[r.flatEndZ,r.endZ]];
 worldB.useMaterial(.2,.015,0);
 for(const [z0,z1] of sections){
  const y0=terrainH(r.x,z0)+profileForRamp(r,r.x,z0+.001)+.075;
  const y1=terrainH(r.x,z1)+profileForRamp(r,r.x,z1-.001)+.075;
  const slope=(y1-y0)/(z1-z0),normal=normalize([0,1,-slope]);
  worldB.quad([left,y0,z0],[left,y1,z1],[right,y1,z1],[right,y0,z0],r.color,normal);
  const b0=terrainH(r.x,z0)+.015,b1=terrainH(r.x,z1)+.015;
  worldB.quad([left,b0,z0],[left,b1,z1],[left,y1,z1],[left,y0,z0],[.12,.19,.27],[-1,0,0]);
  worldB.quad([right,b0,z0],[right,y0,z0],[right,y1,z1],[right,b1,z1],[.12,.19,.27],[1,0,0]);
 }
 worldB.useMaterial(.17,0,0);
 for(const side of [-1,1])for(let z=r.startZ+1;z<r.endZ-.3;z+=2.8){
  const x=r.x+side*(r.halfWidth-.16),y=driveSurfaceH(x,z)+.085;
  worldB.box(x-.13,y,z-.30,x+.13,y+.15,z+.30,[.99,.77,.16]);
 }
}

const buildingColliders=[];
const staticShadowCasters=[];
function addBuilding(x,z,w,d,h,color,roof=[.27,.30,.31],kind='house'){
 if(streetLines.some(line=>Math.abs(x-line)<w/2+8.5||Math.abs(z-line)<d/2+8.5))return; // never place a building in a street or sidewalk corridor
 if(isNearAnyRamp(x,z,Math.max(w,d)*.5+1.5))return; // keep landmark and procedural buildings clear of ramp runouts
 const newHW=w/2+.62,newHL=d/2+.62;
 if(buildingColliders.some(b=>b.kind==='building'&&Math.abs(x-b.x)<newHW+b.hw+2.2&&Math.abs(z-b.z)<newHL+b.hl+2.2))return; // avoid overlapping building footprints
 const base=terrainH(x,z),buriedBase=base-28,wallH=Math.max(8.5,h*1.52),wallTop=base+wallH;
 // IMPORTANT: extend the building mass 28 world units below the local ground.
 // Terrain height varies across each footprint; a deep foundation prevents visible hovering.
 // Square walls and a separate, slightly raised roof cap keep the top perfectly flat.
 worldB.useMaterial(.34,.015,3);
 worldB.box(x-w/2,buriedBase,z-d/2,x+w/2,wallTop,z+d/2,color);
 worldB.useMaterial(.23,.02,4);
 worldB.box(x-w/2-.58,wallTop+.055,z-d/2-.58,x+w/2+.58,wallTop+.62,z+d/2+.58,roof);
 // Four molded roof studs make the buildings read like oversized construction toys.
 worldB.useMaterial(.19,0,6);
 const studColor=[Math.min(1,roof[0]*1.18+.08),Math.min(1,roof[1]*1.18+.08),Math.min(1,roof[2]*1.18+.08)];
 for(const sx of [-w*.34,w*.34])for(const sz of [-d*.34,d*.34])worldB.cylinderY(x+sx,wallTop+.62,z+sz,.19,.13,studColor,12);
 // Repeated glossy window blocks make the taller buildings feel deliberately designed.
 worldB.useMaterial(.17,.015,6);
 const front=z+d/2+.045;
 const rows=[];for(let level=2.0;level<wallH-1.35;level+=3.05)rows.push(level);
 const columns=w>13?4:2;
 for(const level of rows){
   for(let c=0;c<columns;c++){
     const wx=x+(c-(columns-1)/2)*(w/(columns+0.7));
     const ww=Math.min(1.25,w/(columns+1.4));
     worldB.box(wx-ww/2,base+level,front,wx+ww/2,base+level+1.05,front+.075,[.13,.56,.76]);
   }
 }
 // A chunky contrasting entrance sits at ground level.
 worldB.useMaterial(.24,.01,6);
 worldB.box(x-.52,base,z+d/2+.045,x+.52,base+2.1,z+d/2+.13,[.96,.68,.24]);
 buildingColliders.push({id:'building-'+buildingColliders.length,x,z,hw:w/2+.62,hl:d/2+.62,yaw:0,bottomY:buriedBase,topY:wallTop+.62,kind:'building'});
 staticShadowCasters.push({x,z,hw:w/2,hl:d/2,yaw:0,height:wallH+.65,alpha:.32});
}
addBuilding(-34,31,18,19,7,[.96,.53,.22],[.18,.33,.62],'warehouse');
addBuilding(-20,37,9,9,4.2,[.98,.79,.27],[.74,.25,.13]);
addBuilding(26,7,9,8,4.8,[.18,.70,.86],[.08,.30,.76]);
addBuilding(39,-2,8,9,4.5,[.94,.39,.54],[.52,.12,.25]);
addBuilding(28,-37,11,10,5,[.43,.78,.38],[.18,.43,.17]);
addBuilding(78,13,12,11,5.5,[.72,.55,.94],[.28,.18,.58]);
addBuilding(-75,-28,12,10,4.7,[.97,.61,.32],[.68,.24,.12]);
// Expanded 4x4 city districts. The original central district remains intact; the
// surrounding 15 chunks receive deterministic clusters of buildings with varied
// footprints and heights. Buildings sit in street blocks, never on the road grid.
{
 const palette=[
  [[.96,.53,.22],[.18,.33,.62]],[[.18,.70,.86],[.08,.30,.76]],
  [[.94,.39,.54],[.52,.12,.25]],[[.43,.78,.38],[.18,.43,.17]],
  [[.72,.55,.94],[.28,.18,.58]],[[.97,.75,.32],[.64,.25,.12]],
  [[.40,.68,.82],[.16,.30,.48]],[[.92,.62,.36],[.55,.24,.12]]
 ];
 let seed=73421;
 const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 for(let bx=-3;bx<=3;bx++)for(let bz=-3;bz<=3;bz++){
  // Leave the original center chunk's hand-authored landmark cluster undisturbed.
  if(bx===0&&bz===0)continue;
  const cx=bx*110,cz=bz*110;
  const count=1+(rand()>.36?1:0)+(rand()>.78?1:0);
  for(let j=0;j<count;j++){
   const w=9+rand()*15,d=9+rand()*15;
   const x=cx+(rand()-.5)*48,z=cz+(rand()-.5)*48;
   const heightRoll=rand();
   const h=heightRoll<.22?20+rand()*17:heightRoll<.62?10+rand()*11:4.5+rand()*5.5;
   const pair=palette[Math.floor(rand()*palette.length)];
   addBuilding(x,z,w,d,h,pair[0],pair[1],h>19?'tower':'city-block');
  }
 }
}
// Trees, rocks and roadside details. Scatter them through the expanded districts,
// while preserving clearance around streets, buildings and stunt ramps.
worldB.useMaterial(.96,0,5);
{
 let seed=918273;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<420;i++){
  const x=-425+rand()*850,z=-425+rand()*850,r=.65+rand()*.42;
  const onStreet=streetLines.some(s=>Math.abs(x-s)<9.5||Math.abs(z-s)<9.5);
  const nearBuilding=buildingColliders.some(b=>Math.abs(x-b.x)<b.hw+r+2&&Math.abs(z-b.z)<b.hl+r+2);
  if(onStreet||nearBuilding||isNearAnyRamp(x,z,2))continue;
  const y=terrainH(x,z);
  worldB.useMaterial(.28,0,5);
  worldB.box(x-.17,y,z-.17,x+.17,y+1.5,z+.17,[.48,.25,.09]);
  worldB.useMaterial(.24,0,7);
  worldB.box(x-r*.82,y+1.08,z-r*.82,x+r*.82,y+2.25,z+r*.82,[.10,.61,.17]);
  worldB.box(x-r*.62,y+2.05,z-r*.62,x+r*.62,y+3.18,z+r*.62,[.14,.69,.20]);
  worldB.box(x-r*.40,y+2.98,z-r*.40,x+r*.40,y+3.92,z+r*.40,[.21,.76,.24]);
  worldB.cylinderY(x,y+3.92,z,r*.20,.11,[.35,.84,.29],10);
 }
}
worldB.useMaterial(.94,0,3);
{
 let seed=123987;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<220;i++){
  const x=-428+rand()*856,z=-428+rand()*856;
  const nearBuilding=buildingColliders.some(b=>Math.abs(x-b.x)<b.hw+2&&Math.abs(z-b.z)<b.hl+2);
  const onStreet=streetLines.some(s=>Math.abs(x-s)<9.5||Math.abs(z-s)<9.5);
  if(nearBuilding||onStreet||isNearAnyRamp(x,z,2))continue;
  const y=terrainH(x,z);
  worldB.box(x-.42,y,z-.34,x+.42,y+.45,z+.34,[.48,.52,.49]);
  staticShadowCasters.push({x,z,hw:.45,hl:.38,yaw:0,height:.5,alpha:.16});
  buildingColliders.push({id:'rock-'+i,x,z,hw:.42,hl:.34,yaw:0,kind:'rock'});
 }
}
// Street lamps along the crossroad.
worldB.useMaterial(.34,.72,6);
for(let z=-86;z<=86;z+=22){const y=terrainH(6,z);worldB.box(5.8,y, z-.08,6.05,y+4.4,z+.08,[.22,.25,.26]);worldB.box(5.85,y+4.2,z-.8,7.2,y+4.38,z+.08,[.28,.3,.3]);worldB.box(6.7,y+4.1,z-.76,7.25,y+4.45,z-.18,[.92,.83,.52]);}
const worldMesh=worldB.finish();

// Stylized projected shadows: a compact WebGL1-friendly shadow pass. Each caster's
// bottom footprint and sun-shifted top footprint form a soft-edged-looking dark polygon
// on the ground. This is not a full depth shadow map, but it gives trees, buildings and
// moving vehicles readable directional shadows without requiring WebGL2.
function convexHull2D(points){
 const pts=points.slice().sort((a,b)=>a.x-b.x||a.z-b.z);
 if(pts.length<=3)return pts;
 const cross2=(o,a,b)=>(a.x-o.x)*(b.z-o.z)-(a.z-o.z)*(b.x-o.x);
 const lower=[];for(const p of pts){while(lower.length>=2&&cross2(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
 const upper=[];for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(upper.length>=2&&cross2(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
 lower.pop();upper.pop();return lower.concat(upper);
}
const staticShadowVertices=[];
const shadowSun=normalize([-.45,.82,.36]);
function appendShadowCaster(out,caster){
 const c=Math.cos(caster.yaw||0),si=Math.sin(caster.yaw||0);
 const corners=[];
 for(const [lx,lz] of [[-caster.hw,-caster.hl],[caster.hw,-caster.hl],[caster.hw,caster.hl],[-caster.hw,caster.hl]]){
  const ox=lx*c+lz*si,oz=-lx*si+lz*c;
  corners.push({x:caster.x+ox,z:caster.z+oz});
  const sx=-shadowSun[0]/Math.max(.25,shadowSun[1])*caster.height;
  const sz=-shadowSun[2]/Math.max(.25,shadowSun[1])*caster.height;
  corners.push({x:caster.x+ox+sx,z:caster.z+oz+sz});
 }
 const hull=convexHull2D(corners);
 if(hull.length<3)return;
 const first=hull[0];
 for(let i=1;i<hull.length-1;i++){
  for(const p of [first,hull[i],hull[i+1]])out.push(p.x,(caster.useDriveSurface?driveSurfaceH(p.x,p.z):terrainH(p.x,p.z))+.245,p.z,caster.alpha??.28);
 }
}
for(const caster of staticShadowCasters)appendShadowCaster(staticShadowVertices,caster);
const staticShadowBuffer=gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER,staticShadowBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(staticShadowVertices),gl.STATIC_DRAW);
const dynamicShadowBuffer=gl.createBuffer();
function appendVehicleShadow(out,v){
 const semi=v.type==='semi';
 appendShadowCaster(out,{x:v.x,z:v.z,hw:v.width*.56,hl:v.length*.56,yaw:v.yaw,height:semi?3.2:2.25,alpha:.32,useDriveSurface:true});
}
function drawShadows(vp){
 if(!shadowProgram)return;
 const dynamic=[];
 for(const v of vehicles){
  appendVehicleShadow(dynamic,v);
  if(v.trailer)appendShadowCaster(dynamic,{x:v.trailer.x,z:v.trailer.z,hw:v.trailer.width*.56,hl:v.trailer.length*.55,yaw:v.trailer.yaw,height:2.9,alpha:.30,useDriveSurface:true});
 }
 for(let i=0;i<props.length;i++){const p=props[i];appendShadowCaster(dynamic,{x:p.x,z:p.z,hw:p.radius*.88,hl:p.radius*.88,yaw:p.yaw,height:p.type==='barrel'?1.1:1.0,alpha:.23,useDriveSurface:true});}
 if(onFoot)appendShadowCaster(dynamic,{x:player.x,z:player.z,hw:.3,hl:.3,yaw:player.yaw,height:1.5,alpha:.24});
 gl.useProgram(shadowProgram);
 const pos=gl.getAttribLocation(shadowProgram,'aShadowPosition'),alpha=gl.getAttribLocation(shadowProgram,'aShadowAlpha'),shadowVP=gl.getUniformLocation(shadowProgram,'uShadowViewProj');
 gl.uniformMatrix4fv(shadowVP,false,vp);
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 function drawShadowBuffer(buffer,count){if(!count)return;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(pos);gl.enableVertexAttribArray(alpha);gl.vertexAttribPointer(pos,3,gl.FLOAT,false,16,0);gl.vertexAttribPointer(alpha,1,gl.FLOAT,false,16,12);gl.drawArrays(gl.TRIANGLES,0,count);}
 drawShadowBuffer(staticShadowBuffer,staticShadowVertices.length/4);
 if(dynamic.length){gl.bindBuffer(gl.ARRAY_BUFFER,dynamicShadowBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(dynamic),gl.DYNAMIC_DRAW);drawShadowBuffer(dynamicShadowBuffer,dynamic.length/4);}
 gl.depthMask(true);gl.disable(gl.BLEND);gl.useProgram(activeProgram);
}

// Imported stylized vehicle assets (Grab3D Cozy Vehicles models, CC0 1.0).
// Geometry lives in assets/vehicle_meshes.bin and is loaded once by the HTML bootstrap.
// Keeping binary model data outside game.js avoids a multi-megabyte base64 HTML payload.
const VEHICLE_ASSET_DATA=window.FREE_ROAM_VEHICLE_ASSETS;
if(!VEHICLE_ASSET_DATA||!VEHICLE_ASSET_DATA.meta||!VEHICLE_ASSET_DATA.buffer)throw new Error('Vehicle model files were not loaded. Start the game with run_game.py or the provided launcher.');
const VEHICLE_GEOMETRY_BUFFER=VEHICLE_ASSET_DATA.buffer;
function createIndexedVehicleMesh(desc,tint=[1,1,1]){
 const sourceVertices=new Float32Array(VEHICLE_GEOMETRY_BUFFER,desc.vertexByteOffset,desc.vertexCount*12);
 let vertices=sourceVertices;
 if(tint[0]!==1||tint[1]!==1||tint[2]!==1){
  vertices=new Float32Array(sourceVertices);
  for(let i=0;i<vertices.length;i+=12){vertices[i+6]=clamp(vertices[i+6]*tint[0],0,1);vertices[i+7]=clamp(vertices[i+7]*tint[1],0,1);vertices[i+8]=clamp(vertices[i+8]*tint[2],0,1);}
 }
 const indices=new Uint16Array(VEHICLE_GEOMETRY_BUFFER,desc.indexByteOffset,desc.indexCount);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
 const indexBuffer=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
 return {buffer,indexBuffer,count:indices.length,indexed:true,vertexCount:vertices.length/12};
}
function createVehicleVisual(key,tint=[1,1,1]){
 const spec=VEHICLE_ASSET_DATA.meta[key];
 return {body:createIndexedVehicleMesh(spec.body,tint),wheels:spec.wheels.map(w=>({label:w.label,steer:w.steer,pivot:w.pivot,radius:w.radius,mesh:createIndexedVehicleMesh(w.mesh)}))};
}
const compactAsset=createVehicleVisual('compact');
const pickupAsset=createVehicleVisual('pickup');
const semiAsset=createVehicleVisual('semi');
const trailerAsset=createVehicleVisual('trailer');
const models={
 compact:compactAsset,
 pickup:pickupAsset,
 semi:semiAsset,
 // Traffic shares the compact wheel buffers; only its body color is varied.
 trafficA:{body:createIndexedVehicleMesh(VEHICLE_ASSET_DATA.meta.compact.body,[1.08,.88,.82]),wheels:compactAsset.wheels},
 trafficB:{body:createIndexedVehicleMesh(VEHICLE_ASSET_DATA.meta.compact.body,[.78,.93,1.12]),wheels:compactAsset.wheels},
 trafficC:{body:createIndexedVehicleMesh(VEHICLE_ASSET_DATA.meta.compact.body,[1.12,.91,.70]),wheels:compactAsset.wheels}
};
const trailerModel=trailerAsset;
const crateModel=(()=>{const b=new MeshBuilder();b.useMaterial(.9,0,5);b.box(-.52,0,-.52,.52,1.02,.52,[.50,.32,.17]);b.box(-.55,.42,-.56,.55,.53,.56,[.34,.22,.12]);b.box(-.53,.05,-.55,.53,.14,.55,[.37,.25,.14]);return b.finish();})();
const barrelModel=(()=>{const b=new MeshBuilder();b.useMaterial(.38,.48,6);b.cylinderY(0,0,0,.43,1.05,[.55,.23,.12],14);b.cylinderY(0,.08,0,.445,.07,[.24,.26,.27],14);b.cylinderY(0,.89,0,.445,.07,[.24,.26,.27],14);return b.finish();})();
const personModel=(()=>{const b=new MeshBuilder();b.useMaterial(.82,0,6);b.box(-.28,0,-.2,.28,1.0,.2,[.22,.28,.62]);b.box(-.24,.98,-.22,.24,1.45,.22,[.78,.58,.42]);return b.finish();})();
const debrisModels={
 crate:(()=>{const b=new MeshBuilder();b.useMaterial(.22,0,0);b.box(-.5,-.5,-.5,.5,.5,.5,[.63,.39,.19]);return b.finish();})(),
 barrel:(()=>{const b=new MeshBuilder();b.useMaterial(.19,0,0);b.box(-.5,-.5,-.5,.5,.5,.5,[.91,.34,.13]);return b.finish();})()
};
const debris=[];

const vehicles=[];
function vehicle(id,type,name,x,z,yaw,opts={}){
 const maxSpeed=opts.topSpeedMph!==undefined?opts.topSpeedMph*MPH_TO_MS:(opts.maxSpeed!==undefined?opts.maxSpeed:20*MPH_TO_MS);
 const baseAccel=opts.accel??6;
 const v={id,type,name,x,z,yaw,vx:0,vz:0,y:driveSurfaceH(x,z)+.04,vy:0,grounded:true,surfaceSlope:0,model:models[type],width:opts.width||1.9,length:opts.length||4.3,mass:opts.mass||1200,
  accel:baseAccel,baseAccel,accelerationLevel:0,maxSpeed,baseMaxSpeed:maxSpeed,topSpeedLevel:0,
  impactLevel:0,impactMultiplier:1,boostTime:0,boostCooldown:0,
  steerRate:opts.steerRate||1.8,yawRate:0,brakeDecel:opts.brakeDecel??(type==='semi'?5.4:type==='pickup'?9.5:12.5),lateralGrip:opts.lateralGrip??(type==='semi'?2.0:type==='pickup'?3.6:4.4),
  wheelSpin:0,wheelSteerAngle:0,suspensionOffset:0,suspensionVelocity:0,pitch:0,roll:0,pitchVelocity:0,rollVelocity:0,previousSurfaceY:driveSurfaceH(x,z)+.04,longAccel:0,lateralAccel:0,
  ai:!!opts.ai,parked:!!opts.parked,route:opts.route||null,routeDir:opts.routeDir||1,routeLaneX:x,routeLaneZ:z,aiKnockTime:0,interactRadius:opts.interactRadius||5,airTime:0};
 vehicles.push(v);return v;
}
const playerCar=vehicle('starter','compact','Mint Compact',5,15,0,{width:1.9,length:4.2,mass:1050,accel:5.8,topSpeedMph:20,steerRate:2.15});
vehicle('pickup','pickup','Sage Pickup',14,17,-.18,{width:2,length:5,mass:1750,accel:4.8,topSpeedMph:20,steerRate:1.7,parked:true});
const semiVehicle=vehicle('semi','semi','Blue Semi Truck',-12,16,Math.PI,{width:2.5,length:5.0,mass:5600,accel:2.8,topSpeedMph:20,steerRate:.82,brakeDecel:5.2,lateralGrip:1.85,parked:true,interactRadius:8});
// The trailer is its own heavy body. Its front coupler is constrained to the tractor's fifth wheel.
{
 const f=[Math.sin(semiVehicle.yaw),Math.cos(semiVehicle.yaw)];
 semiVehicle.trailer={x:semiVehicle.x-f[0]*6.35,z:semiVehicle.z-f[1]*6.35,yaw:semiVehicle.yaw,vx:0,vz:0,y:driveSurfaceH(semiVehicle.x-f[0]*6.35,semiVehicle.z-f[1]*6.35)+.04,
  width:2.35,length:8.5,mass:3800,yawRate:0,wheelSpin:0,maxArticulation:Math.PI*0.34,model:trailerModel};
}
// A fixed fleet of traffic cars follows one continuous, rounded rectangular circuit
// around the full city. Vehicles are never spawned or despawned; collisions can push
// them off their lane and their steering gradually guides them back.
const LOOP_HALF=385, LOOP_SIDE=LOOP_HALF*2, LOOP_LENGTH=LOOP_SIDE*4;
function loopPoint(distance){
 let s=((distance%LOOP_LENGTH)+LOOP_LENGTH)%LOOP_LENGTH;
 if(s<LOOP_SIDE)return {x:-LOOP_HALF+s,z:-LOOP_HALF,yaw:Math.PI/2};
 s-=LOOP_SIDE;if(s<LOOP_SIDE)return {x:LOOP_HALF,z:-LOOP_HALF+s,yaw:0};
 s-=LOOP_SIDE;if(s<LOOP_SIDE)return {x:LOOP_HALF-s,z:LOOP_HALF,yaw:-Math.PI/2};
 s-=LOOP_SIDE;return {x:-LOOP_HALF,z:LOOP_HALF-s,yaw:Math.PI};
}
const trafficFleet=[];
for(let i=0;i<12;i++){
 const p=loopPoint(i*LOOP_LENGTH/12+7);
 const v=vehicle('traffic-loop-'+i,['trafficA','trafficB','trafficC'][i%3],
  ['Town Car','Green Car','Orange Car'][i%3],p.x,p.z,p.yaw,
  {width:1.8,length:4.2,mass:1000,accel:0,maxSpeed:10.5+(i%4)*.75,steerRate:0,ai:true,route:'loop'});
 v.loopS=i*LOOP_LENGTH/12+7;v.loopLane=(i%2===0?-1:1)*1.8;trafficFleet.push(v);
}
const props=[];
function addProp(type,x,z){if(isNearAnyRamp(x,z,.8)||streetLines.some(s=>Math.abs(x-s)<9.5||Math.abs(z-s)<9.5))return;props.push({type,x,z,y:driveSurfaceH(x,z),vx:0,vz:0,yaw:(x*z)%1,roll:0,mass:type==='barrel'?16:34,radius:type==='barrel'?.48:.72,hp:type==='barrel'?6.0:8.5,broken:false});}
for(let i=0;i<9;i++)addProp(i%2?'crate':'barrel',-27+(i%3)*2.0,9+Math.floor(i/3)*3.0);
for(let i=0;i<8;i++)addProp(i%3?'barrel':'crate',-4+(i%4)*1.8,32+Math.floor(i/4)*2.1);
for(let i=0;i<8;i++)addProp(i%2?'crate':'barrel',22+(i%4)*1.8,34+Math.floor(i/4)*2.2);
// Some loose road cones are just chunky movable props.
for(let i=0;i<5;i++)addProp('barrel',-5+i*2.4,-13.5);

let controlled=playerCar;
let onFoot=false;
let player={x:6.7,z:15.5,yaw:0};
let cameraMode=0;
const keys={};
const touch={left:false,right:false,gas:false,brake:false};
let lastTime=0, messageUntil=0, lastHint='';
let cash=0;
const upgradeCosts=[100,160,240,340,470,620,800,1000];
const accelerationUpgradeCosts=[120,190,280,400,550,720,920,1150];
const impactUpgradeCosts=[160,250,370,520,710,940,1220,1550];
let previousCrashContacts=new Set(), currentCrashContacts=null;
function nextUpgradeCost(v,tier='speed'){
 const level=tier==='acceleration'?v.accelerationLevel:tier==='impact'?v.impactLevel:v.topSpeedLevel;
 const table=tier==='acceleration'?accelerationUpgradeCosts:tier==='impact'?impactUpgradeCosts:upgradeCosts;
 return table[level]??(table[table.length-1]+(level-table.length+1)*(tier==='acceleration'?300:tier==='impact'?420:260));
}
function updateCashUI(){$('cash').textContent='CASH  $'+cash.toLocaleString('en-US');}
function registerCrashReward(key,impact){
 if(!currentCrashContacts)return;
 currentCrashContacts.add(key);
 if(previousCrashContacts.has(key)||onFoot||!controlled||impact<2.25)return;
 const payout=clamp(Math.round(impact*7.5),12,70);
 cash+=payout;updateCashUI();say('CRASH BONUS  +$'+payout,1150);
}
function atUpgradePad(){
 if(onFoot||!controlled)return false;
 const r=upgradeRamp;
 return Math.abs(controlled.x-r.x)<3.55 && controlled.z>32.0 && controlled.z<37.8;
}
function refreshUpgradePanel(){
 const panel=$('upgradePanel'),speedButton=$('upgradeButton'),accelButton=$('accelerationButton'),impactButton=$('impactButton');
 const near=!onFoot&&controlled&&Math.abs(controlled.x-upgradeRamp.x)<6.3&&controlled.z>28.5&&controlled.z<41.5;
 if(!near){panel.classList.remove('show');return;}
 panel.classList.add('show');
 const onPad=atUpgradePad(),speed=Math.hypot(controlled.vx,controlled.vz);
 const currentMph=Math.round(controlled.maxSpeed*MPH_PER_MS),nextMph=currentMph+5;
 const speedCost=nextUpgradeCost(controlled,'speed'),accelCost=nextUpgradeCost(controlled,'acceleration'),impactCost=nextUpgradeCost(controlled,'impact');
 const nextAccel=controlled.accel*1.15;
 $('upgradeTitle').textContent=controlled.name+' · Top Speed';
 $('upgradeDetails').textContent=onPad?`Current: ${currentMph} MPH  →  Next: ${nextMph} MPH. Upgrades belong to this vehicle.`:`Drive onto the gold pad in the flat middle of the blue ramp. Current top speed: ${currentMph} MPH.`;
 if(!onPad){speedButton.disabled=true;speedButton.textContent='DRIVE ONTO THE GOLD PAD';}
 else if(speed>1.2){speedButton.disabled=true;speedButton.textContent='STOP TO UPGRADE';}
 else if(cash<speedCost){speedButton.disabled=true;speedButton.textContent=`TOP SPEED +5 MPH · $${speedCost} (NEED $${speedCost-cash})`;}
 else {speedButton.disabled=false;speedButton.textContent=`UPGRADE TOP SPEED +5 MPH · $${speedCost}`;}
 $('accelerationDetails').textContent=onPad?`Current acceleration: ${controlled.accel.toFixed(1)} m/s²  →  ${nextAccel.toFixed(1)} m/s² (+15%).`:`Second tier: improve throttle response and acceleration by 15% per level.`;
 if(!onPad){accelButton.disabled=true;accelButton.textContent='DRIVE ONTO THE GOLD PAD';}
 else if(speed>1.2){accelButton.disabled=true;accelButton.textContent='STOP TO UPGRADE';}
 else if(cash<accelCost){accelButton.disabled=true;accelButton.textContent=`ACCELERATION +15% · $${accelCost} (NEED $${accelCost-cash})`;}
 else {accelButton.disabled=false;accelButton.textContent=`UPGRADE ACCELERATION +15% · $${accelCost}`;}
 $('impactDetails').textContent=onPad?`Current impact power: ×${controlled.impactMultiplier.toFixed(2)}. Each level improves collision force and prop damage by 20%.`:`Third tier: stronger ramming impacts and more effective destruction of toy props.`;
 if(!onPad){impactButton.disabled=true;impactButton.textContent='DRIVE ONTO THE GOLD PAD';}
 else if(speed>1.2){impactButton.disabled=true;impactButton.textContent='STOP TO UPGRADE';}
 else if(cash<impactCost){impactButton.disabled=true;impactButton.textContent=`IMPACT POWER +20% · $${impactCost} (NEED $${impactCost-cash})`; }
 else {impactButton.disabled=false;impactButton.textContent=`UPGRADE IMPACT POWER +20% · $${impactCost}`;}
}
function purchaseTopSpeedUpgrade(){
 if(!atUpgradePad()){say('Drive onto the gold tuning pad in the flat middle of the ramp.');return;}
 if(Math.hypot(controlled.vx,controlled.vz)>1.2){say('Come to a complete stop before tuning.');return;}
 const cost=nextUpgradeCost(controlled,'speed');
 if(cash<cost){say('Not enough cash yet. Use the ramps and crash into props, traffic or buildings to earn more.');return;}
 cash-=cost;controlled.topSpeedLevel++;controlled.maxSpeed+=5*MPH_TO_MS;updateCashUI();
 say(`${controlled.name} upgraded to ${Math.round(controlled.maxSpeed*MPH_PER_MS)} MPH!`,1900);refreshUpgradePanel();
}
function purchaseAccelerationUpgrade(){
 if(!atUpgradePad()){say('Drive onto the gold tuning pad in the flat middle of the ramp.');return;}
 if(Math.hypot(controlled.vx,controlled.vz)>1.2){say('Come to a complete stop before tuning.');return;}
 const cost=nextUpgradeCost(controlled,'acceleration');
 if(cash<cost){say('Not enough cash yet. Try the stunt ramps for airtime bonuses.');return;}
 cash-=cost;controlled.accelerationLevel++;controlled.accel=controlled.baseAccel*Math.pow(1.15,controlled.accelerationLevel);updateCashUI();
 say(`${controlled.name} acceleration upgraded by 15%!`,1900);refreshUpgradePanel();
}
$('upgradeButton').addEventListener('click',purchaseTopSpeedUpgrade);
$('accelerationButton').addEventListener('click',purchaseAccelerationUpgrade);
function purchaseImpactUpgrade(){
 if(!atUpgradePad()){say('Drive onto the gold tuning pad in the flat middle of the ramp.');return;}
 if(Math.hypot(controlled.vx,controlled.vz)>1.2){say('Come to a complete stop before tuning.');return;}
 const cost=nextUpgradeCost(controlled,'impact');
 if(cash<cost){say('Not enough cash yet. Smash crates and barrels or earn airtime bonuses.');return;}
 cash-=cost;controlled.impactLevel++;controlled.impactMultiplier=Math.pow(1.20,controlled.impactLevel);updateCashUI();
 say(`${controlled.name} impact power upgraded to ×${controlled.impactMultiplier.toFixed(2)}!`,1900);refreshUpgradePanel();
}
$('impactButton').addEventListener('click',purchaseImpactUpgrade);
updateCashUI();
function say(text,duration=2200){messageEl.textContent=text;messageEl.classList.add('show');messageUntil=performance.now()+duration;}
function currentSpeed(){if(onFoot)return 0;return Math.hypot(controlled.vx,controlled.vz)*MPH_PER_MS;}
function vehicleForward(v){return [Math.sin(v.yaw),Math.cos(v.yaw)];}
function vehicleAxes(v){return {right:[Math.cos(v.yaw),-Math.sin(v.yaw)],forward:[Math.sin(v.yaw),Math.cos(v.yaw)]};}
function footprint(v){return {x:v.x,z:v.z,offset:0};}
function nearestVehicle(px,pz){let best=null,bestD=1e9;for(const v of vehicles){if(v.ai)continue;const f=footprint(v);const d=Math.hypot(px-f.x,pz-f.z);const allowance=v.type==='semi'?8:5.4;if(d<allowance&&d<bestD){best=v;bestD=d;}}return best;}
function interact(){
 if(!onFoot){const sp=Math.hypot(controlled.vx,controlled.vz);if(sp>2.4 || controlled.grounded===false){say('Wait until the vehicle lands before getting out.');return;}
  const f=vehicleForward(controlled),side=controlled.width/2+1.15;player.x=controlled.x+Math.cos(controlled.yaw)*side;player.z=controlled.z-Math.sin(controlled.yaw)*side;player.yaw=controlled.yaw;player.y=driveSurfaceH(player.x,player.z);controlled.parked=true;controlled.vx*=.15;controlled.vz*=.15;onFoot=true;say('On foot. Walk up to another vehicle and press E.');
 } else {
  const v=nearestVehicle(player.x,player.z);
  if(!v){say('Walk closer to a parked vehicle to get in.');return;}
  controlled=v;controlled.ai=false;controlled.parked=false;onFoot=false;
  if(Math.hypot(controlled.vx,controlled.vz)<.5){controlled.vx=0;controlled.vz=0;}
  say('Driving: '+controlled.name+'.');
 }
}
function pressed(name){return !!keys[name] || !!touch[name];}
// STEERING CONVENTION — DO NOT REVERSE THESE SIGNS:
// A / Left-arrow / left touch button must steer LEFT on screen; D / Right-arrow / right touch button must steer RIGHT.
// This camera looks along +Z with a right-handed view basis, so positive yaw is LEFT on screen.
// Keep A = +1 and D = -1 here; updateVehicle() and updateFoot() both use this shared mapping.
function steeringInput(){
 const steerLeft=pressed('a')||pressed('arrowleft')||pressed('left');
 const steerRight=pressed('d')||pressed('arrowright')||pressed('right');
 return (steerLeft?1:0)-(steerRight?1:0);
}
// SHIFT BOOST: edge-triggered so holding Shift cannot retrigger it.
// Boost is intentionally brief, with a cooldown, and does not permanently alter upgrades.
function activateBoost(){
 if(onFoot||!controlled||controlled.parked)return;
 if(controlled.boostCooldown>0){say(`Boost recharging: ${controlled.boostCooldown.toFixed(1)}s`,700);return;}
 controlled.boostTime=1.15;controlled.boostCooldown=4.0;say('TURBO BOOST!',850);
}
window.addEventListener('keydown',e=>{
 const k=e.key.toLowerCase();
 if(['arrowup','arrowdown','arrowleft','arrowright',' ','w','a','s','d','e','c','shift'].includes(k))e.preventDefault();
 keys[k]=true;
 if(k==='e'&&!e.repeat)interact();
 if(k==='shift'&&!e.repeat)activateBoost();
 if(k==='c'&&!e.repeat){cameraMode=(cameraMode+1)%3;say(['Chase camera','Closer camera','Wide camera'][cameraMode],1000);}
});
window.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;for(const k in touch)touch[k]=false;});
document.querySelectorAll('[data-control]').forEach(btn=>{
 const k=btn.dataset.control;
 const down=e=>{e.preventDefault();touch[k]=true;btn.classList.add('active');try{btn.setPointerCapture(e.pointerId);}catch(_){}};
 const up=e=>{e.preventDefault();touch[k]=false;btn.classList.remove('active');};
 btn.addEventListener('pointerdown',down);btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);btn.addEventListener('lostpointercapture',up);
});
$('interact').addEventListener('pointerdown',e=>{e.preventDefault();interact();});

function obbInfo(v){const c=footprint(v),axes=vehicleAxes(v);return {x:c.x,z:c.z,hw:v.width/2,hl:v.length/2,rx:axes.right[0],rz:axes.right[1],fx:axes.forward[0],fz:axes.forward[1]};}
function satOBB(a,b){
 const dx=b.x-a.x,dz=b.z-a.z;let min=1e9,nx=0,nz=0;
 const axes=[[a.rx,a.rz],[a.fx,a.fz],[b.rx,b.rz],[b.fx,b.fz]];
 for(const ax of axes){const dist=Math.abs(dx*ax[0]+dz*ax[1]);const ra=a.hw*Math.abs(a.rx*ax[0]+a.rz*ax[1])+a.hl*Math.abs(a.fx*ax[0]+a.fz*ax[1]);const rb=b.hw*Math.abs(b.rx*ax[0]+b.rz*ax[1])+b.hl*Math.abs(b.fx*ax[0]+b.fz*ax[1]);const overlap=ra+rb-dist;if(overlap<=0)return null;if(overlap<min){min=overlap;const sign=(dx*ax[0]+dz*ax[1])>=0?1:-1;nx=ax[0]*sign;nz=ax[1]*sign;}}
 return {overlap:min,nx,nz};
}
function resolveVehicleBuilding(v,box){
 if(box.topY!==undefined && Number.isFinite(v.y) && v.y>box.topY+.2)return;
 const a=obbInfo(v),b={x:box.x,z:box.z,hw:box.hw,hl:box.hl,rx:1,rz:0,fx:0,fz:1};
 const hit=satOBB(a,b);if(!hit)return;
 const vn=v.vx*hit.nx+v.vz*hit.nz;
 if(v===controlled&&vn>0)registerCrashReward('building:'+v.id+':'+box.id,vn);
 v.x-=hit.nx*(hit.overlap+.025);v.z-=hit.nz*(hit.overlap+.025);
 if(vn>0){v.vx-=hit.nx*vn*1.28;v.vz-=hit.nz*vn*1.28;v.suspensionVelocity-=Math.min(vn*.035,.24);v.pitchVelocity+=Math.sign(vn)*.12;}
}
function spawnPropDebris(p,kind,impact){
 const count=clamp(Math.round(7+impact*.45),7,13);
 for(let i=0;i<count;i++){
  const a=Math.random()*Math.PI*2,side=.8+Math.random()*3.8;
  debris.push({model:debrisModels[kind]||debrisModels.crate,x:p.x+(Math.random()-.5)*.5,y:p.y+.45+Math.random()*.65,z:p.z+(Math.random()-.5)*.5,
   vx:p.vx+Math.cos(a)*side,vz:p.vz+Math.sin(a)*side,vy:2.0+Math.random()*3.6,yaw:Math.random()*Math.PI*2,spin:(Math.random()-.5)*9,scale:.10+Math.random()*.16,life:1.5+Math.random()*1.1});
 }
}
function damageProp(p,impact,rammer){
 if(!p||p.broken||impact<3.0)return false;
 const multiplier=rammer&&rammer===controlled?(rammer.impactMultiplier||1):1;
 p.hp-=Math.max(0,impact-2.35)*.52*multiplier;
 if(p.hp<=0){
  p.broken=true;spawnPropDebris(p,p.type,impact);
  if(rammer===controlled){cash+=18;updateCashUI();say(`SMASHED ${p.type.toUpperCase()}  +$18`,1150);}
  return true;
 }
 return false;
}
function resolveVehicleProp(v,p,propIndex){
 if(!p||p.broken)return;
 if(v.grounded===false && Number.isFinite(v.y) && v.y>p.y+1.35)return;
 const a=obbInfo(v),dx=p.x-a.x,dz=p.z-a.z;
 const lx=dx*a.rx+dz*a.rz,lz=dx*a.fx+dz*a.fz;
 const cx=clamp(lx,-a.hw,a.hw),cz=clamp(lz,-a.hl,a.hl);
 const wx=a.x+a.rx*cx+a.fx*cz,wz=a.z+a.rz*cx+a.fz*cz;
 let nx=p.x-wx,nz=p.z-wz,d=Math.hypot(nx,nz);const min=p.radius;
 if(d<min){if(d<.001){nx=1;nz=0;d=1;}else{nx/=d;nz/=d;}const overlap=min-d;p.x+=nx*overlap;p.z+=nz*overlap;
  const rel=(p.vx-v.vx)*nx+(p.vz-v.vz)*nz;
  const impact=Math.max(0,-rel);
  if(v===controlled)registerCrashReward('prop:'+v.id+':'+propIndex,impact);
  damageProp(p,impact,v);
  const ramPower=v===controlled?(v.impactMultiplier||1):1;
  const kick=clamp((impact*1.25+1.5)*ramPower,1.5,24);
  p.vx+=nx*kick;p.vz+=nz*kick;v.vx-=nx*Math.min(impact*.12,2);v.vz-=nz*Math.min(impact*.12,2);p.roll+=kick*.07;
 }
}
function addCollisionBodyReaction(v,impact,nx,nz){
 v.suspensionVelocity-=Math.min(impact*.026,.30);
 const side=nx*Math.cos(v.yaw)-nz*Math.sin(v.yaw);
 const fore=nx*Math.sin(v.yaw)+nz*Math.cos(v.yaw);
 v.rollVelocity+=clamp(-side*impact*.006,-.16,.16);
 v.pitchVelocity+=clamp(fore*impact*.004,-.12,.12);
}
function resolveVehiclePair(a,b){
 const hit=satOBB(obbInfo(a),obbInfo(b));if(!hit)return;
 const {nx,nz,overlap}=hit;const ia=1/a.mass,ib=1/b.mass,total=ia+ib;
 a.x-=nx*(overlap+.02)*(ia/total);a.z-=nz*(overlap+.02)*(ia/total);
 b.x+=nx*(overlap+.02)*(ib/total);b.z+=nz*(overlap+.02)*(ib/total);
 const rel=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz;
 if(rel<0){
  const impact=-rel;if(a===controlled||b===controlled)registerCrashReward('vehicle-pair:'+ [a.id,b.id].sort().join(':'),impact);
  const ramPower=a===controlled?(a.impactMultiplier||1):b===controlled?(b.impactMultiplier||1):1;
  const j=-(1.35*rel)*ramPower/total;a.vx-=j*ia*nx;a.vz-=j*ia*nz;b.vx+=j*ib*nx;b.vz+=j*ib*nz;
  addCollisionBodyReaction(a,impact,nx,nz);addCollisionBodyReaction(b,impact,-nx,-nz);
  if(a.ai)a.aiKnockTime=Math.max(a.aiKnockTime,2.0);
  if(b.ai)b.aiKnockTime=Math.max(b.aiKnockTime,2.0);
  if(Math.abs(rel)>3){if(a.parked)a.parked=false;if(b.parked)b.parked=false;}
 }
}
function wrapAngle(a){while(a>Math.PI)a-=Math.PI*2;while(a< -Math.PI)a+=Math.PI*2;return a;}
function trailerObb(t){
 const c=Math.cos(t.yaw),s=Math.sin(t.yaw);
 return {x:t.x,z:t.z,hw:t.width/2,hl:t.length/2,rx:c,rz:-s,fx:s,fz:c};
}
function updateSemiTrailer(semi,dt){
 const t=semi.trailer;if(!t)return;
 const f=vehicleForward(semi),right=[Math.cos(semi.yaw),-Math.sin(semi.yaw)];
 const hitchOffset=1.62; // matched to the imported semi model's kingpin pivot
 // The fifth-wheel anchor is on the tractor's rear. Its velocity includes the
 // small rotational component from the tractor turning around its center.
 const hitchX=semi.x-f[0]*hitchOffset,hitchZ=semi.z-f[1]*hitchOffset;
 const hitchVx=semi.vx-right[0]*hitchOffset*semi.yawRate;
 const hitchVz=semi.vz-right[1]*hitchOffset*semi.yawRate;
 const articulation=wrapAngle(semi.yaw-t.yaw);
 const tractorForwardSpeed=semi.vx*f[0]+semi.vz*f[1];
 // Bicycle-style trailer kinematics: the tractor's heading difference pulls the
 // trailer into line while moving forward; reversing naturally makes jack-knifing
 // more likely, which is why the mechanical articulation stop matters.
 const kinematicYawRate=(tractorForwardSpeed/t.length)*Math.sin(articulation);
 t.yawRate=lerp(t.yawRate,kinematicYawRate,clamp(dt*5.5,0,1));
 t.yaw=wrapAngle(t.yaw+t.yawRate*dt);
 // Fifth-wheel stops prevent jack-knifing beyond the mechanical articulation limit.
 const maxAngle=t.maxArticulation||Math.PI*.34;
 const newArticulation=wrapAngle(t.yaw-semi.yaw);
 if(Math.abs(newArticulation)>maxAngle){
  const limited=Math.sign(newArticulation)*maxAngle;
  t.yaw=wrapAngle(semi.yaw+limited);
  const relativeYawRate=t.yawRate-semi.yawRate;
  if(Math.sign(limited)*relativeYawRate>0)t.yawRate=semi.yawRate;
 }
 // The trailer coupler is constrained exactly to the fifth-wheel. Unlike the old
 // spring link, this cannot stretch, drift away or float off behind the tractor.
 const tf=vehicleForward({yaw:t.yaw}),tr=[Math.cos(t.yaw),-Math.sin(t.yaw)],half=t.length*.5;
 t.x=hitchX-tf[0]*half;t.z=hitchZ-tf[1]*half;
 // Rigid hitch kinematics give the trailer center velocity from the coupler velocity.
 t.vx=hitchVx-tr[0]*half*t.yawRate;
 t.vz=hitchVz-tr[1]*half*t.yawRate;
 const trailerForwardSpeed=t.vx*tf[0]+t.vz*tf[1],trailerWheelRadius=Math.max(.16,t.model?.wheels?.[0]?.radius||.374);
 t.wheelSpin=(t.wheelSpin||0)-trailerForwardSpeed*dt/trailerWheelRadius;
 t.y=driveSurfaceH(t.x,t.z)+.04;
}

function resolveTrailerBuilding(semi,box){
 const t=semi.trailer;if(!t||t.y>box.topY+.2)return;
 const hit=satOBB(trailerObb(t),{x:box.x,z:box.z,hw:box.hw,hl:box.hl,rx:1,rz:0,fx:0,fz:1});
 if(!hit)return;
 const vn=t.vx*hit.nx+t.vz*hit.nz;
 t.x-=hit.nx*(hit.overlap+.025);t.z-=hit.nz*(hit.overlap+.025);
 if(vn>0){if(semi===controlled)registerCrashReward('trailer-building:'+box.id,vn);t.vx-=hit.nx*vn*1.18;t.vz-=hit.nz*vn*1.18;semi.vx-=hit.nx*vn*.085;semi.vz-=hit.nz*vn*.085;semi.yawRate+=clamp((hit.nx*semi.vz-hit.nz*semi.vx)*.000025,-.08,.08);}
}
function resolveTrailerVehicle(semi,other){
 const t=semi.trailer;if(!t)return;
 const hit=satOBB(trailerObb(t),obbInfo(other));if(!hit)return;
 const {nx,nz,overlap}=hit,ia=1/t.mass,ib=1/other.mass,total=ia+ib;
 t.x-=nx*(overlap+.025)*(ia/total);t.z-=nz*(overlap+.025)*(ia/total);
 other.x+=nx*(overlap+.025)*(ib/total);other.z+=nz*(overlap+.025)*(ib/total);
 const rel=(other.vx-t.vx)*nx+(other.vz-t.vz)*nz;
 if(rel<0){
  const impact=-rel;
  if(semi===controlled||other===controlled)registerCrashReward('trailer-vehicle:'+ [semi.id,other.id].sort().join(':'),impact);
  const ramPower=semi===controlled?(semi.impactMultiplier||1):other===controlled?(other.impactMultiplier||1):1;
  const impulse=-(1.28*rel)*ramPower/total;
  t.vx-=impulse*ia*nx;t.vz-=impulse*ia*nz;other.vx+=impulse*ib*nx;other.vz+=impulse*ib*nz;
  semi.vx-=impulse*ia*nx*.48;semi.vz-=impulse*ia*nz*.48;
  addCollisionBodyReaction(other,impact,-nx,-nz);
  if(other.ai)other.aiKnockTime=Math.max(other.aiKnockTime,2.3);
  if(other.parked)other.parked=false;
 }
}
function resolveTrailerProp(semi,p,index){
 const t=semi.trailer;if(!t||!p||p.broken)return;
 const a=trailerObb(t),dx=p.x-a.x,dz=p.z-a.z;
 const lx=dx*a.rx+dz*a.rz,lz=dx*a.fx+dz*a.fz;
 const cx=clamp(lx,-a.hw,a.hw),cz=clamp(lz,-a.hl,a.hl);
 const wx=a.x+a.rx*cx+a.fx*cz,wz=a.z+a.rz*cx+a.fz*cz;
 let nx=p.x-wx,nz=p.z-wz,d=Math.hypot(nx,nz);
 if(d>=p.radius)return;
 if(d<.001){nx=1;nz=0;d=1;}else{nx/=d;nz/=d;}
 const overlap=p.radius-d;p.x+=nx*overlap;p.z+=nz*overlap;
 const rel=(p.vx-t.vx)*nx+(p.vz-t.vz)*nz,impact=Math.max(0,-rel);
 if(semi===controlled)registerCrashReward('trailer-prop:'+index,impact);
 damageProp(p,impact,semi);
 const ramPower=semi===controlled?(semi.impactMultiplier||1):1;
 const kick=clamp((impact*1.15+1.0)*ramPower,1.0,20);p.vx+=nx*kick;p.vz+=nz*kick;semi.vx-=nx*Math.min(impact*.07,2.8);semi.vz-=nz*Math.min(impact*.07,2.8);
}

function updateVehicleSuspension(v,dt){
 const surface=driveSurfaceH(v.x,v.z)+.04;
 const surfaceRate=clamp((surface-(v.previousSurfaceY??surface))/Math.max(dt,.001),-8,8);
 v.previousSurfaceY=surface;
 // A damped vertical spring reacts to terrain height changes and hard landings.
 v.suspensionVelocity+=(-surfaceRate*.10-v.suspensionOffset*54-v.suspensionVelocity*10.5)*dt;
 v.suspensionOffset=clamp(v.suspensionOffset+v.suspensionVelocity*dt,-.30,.17);
 const f=vehicleForward(v),halfWheelbase=v.type==='semi'?1.9:1.25;
 const front=driveSurfaceH(v.x+f[0]*halfWheelbase,v.z+f[1]*halfWheelbase);
 const rear=driveSurfaceH(v.x-f[0]*halfWheelbase,v.z-f[1]*halfWheelbase);
 let targetPitch=-Math.atan2(front-rear,halfWheelbase*2)-clamp(v.longAccel||0,-12,12)*.009;
 if(v.grounded===false)targetPitch+=clamp(-(v.vy||0)*.035,-.16,.16);
 const right=[Math.cos(v.yaw),-Math.sin(v.yaw)],halfTrack=v.type==='semi'?1.05:.78;
 const leftH=driveSurfaceH(v.x-right[0]*halfTrack,v.z-right[1]*halfTrack),rightH=driveSurfaceH(v.x+right[0]*halfTrack,v.z+right[1]*halfTrack);
 const targetRoll=clamp(-Math.atan2(rightH-leftH,halfTrack*2)-clamp(v.lateralAccel||0,-12,12)*.008,-.20,.20);
 v.pitchVelocity+=((targetPitch-v.pitch)*25-v.pitchVelocity*8.5)*dt;
 v.rollVelocity+=((targetRoll-v.roll)*22-v.rollVelocity*8.0)*dt;
 v.pitch=clamp(v.pitch+v.pitchVelocity*dt,-.32,.32);
 v.roll=clamp(v.roll+v.rollVelocity*dt,-.27,.27);
}
function awardAirTime(v,seconds){
 if(v!==controlled||seconds<.48)return;
 const payout=clamp(Math.round(seconds*24),12,110);
 cash+=payout;updateCashUI();say(`AIR TIME BONUS  +$${payout} · ${seconds.toFixed(1)}s`,1700);
}
function updateVehicleWheelAnimation(v,dt,steerInput=0){
 const f=vehicleForward(v),longitudinalSpeed=v.vx*f[0]+v.vz*f[1];
 const radius=Math.max(.16,v.model?.wheels?.[0]?.radius||.34);
 // Forward travel along local +Z rotates the imported tires around local +X negatively.
 v.wheelSpin=(v.wheelSpin||0)-longitudinalSpeed*dt/radius;
 const maxSteer=v.type==='semi'?.29:.48;
 const target=clamp(steerInput,-1,1)*maxSteer;
 v.wheelSteerAngle=lerp(v.wheelSteerAngle||0,target,1-Math.exp(-dt*13));
}
function updateVehicle(v,dt){
 if(v.boostCooldown>0)v.boostCooldown=Math.max(0,v.boostCooldown-dt);
 const boostActive=v===controlled&&!onFoot&&v.boostTime>0;
 if(v.boostTime>0)v.boostTime=Math.max(0,v.boostTime-dt);
 if(v.ai){
  // Traffic follows a route through a soft spring, not a hard position reset. Impacts can
  // shove it well off its lane; it drifts back over time instead of snapping into place.
  const recovery=v.aiKnockTime>0?.22:1.0;
  v.aiKnockTime=Math.max(0,v.aiKnockTime-dt);
  const targetSpeed=v.maxSpeed*(v.routeDir||1);
  if(v.route==='loop'){
   v.loopS=(v.loopS+v.maxSpeed*dt)%LOOP_LENGTH;
   const here=loopPoint(v.loopS),look=loopPoint(v.loopS+Math.max(8,v.maxSpeed*1.25));
   const routeRight=[Math.cos(look.yaw),-Math.sin(look.yaw)];
   const targetX=look.x+routeRight[0]*v.loopLane;
   const targetZ=look.z+routeRight[1]*v.loopLane;
   const desiredYaw=Math.atan2(targetX-v.x,targetZ-v.z);
   let yawError=((desiredYaw-v.yaw+Math.PI*3)%(Math.PI*2))-Math.PI;
   const steeringLimit=clamp(yawError,-1.55*dt,1.55*dt);
   v.yaw+=steeringLimit;v.yawRate=dt>0?steeringLimit/dt:0;v.aiWheelSteer=clamp(yawError*.42,-.48,.48);
   const f=vehicleForward(v),right=[Math.cos(v.yaw),-Math.sin(v.yaw)];
   const desiredForward=v.maxSpeed;
   const currentForward=v.vx*f[0]+v.vz*f[1],currentSide=v.vx*right[0]+v.vz*right[1];
   const laneErrorX=targetX-v.x,laneErrorZ=targetZ-v.z;
   const sideCorrection=clamp((laneErrorX*right[0]+laneErrorZ*right[1])*0.8,-4.5,4.5)*recovery;
   const nextForward=lerp(currentForward,desiredForward,1-Math.exp(-dt*1.8));
   const nextSide=lerp(currentSide,sideCorrection,1-Math.exp(-dt*2.0));
   v.vx=f[0]*nextForward+right[0]*nextSide;
   v.vz=f[1]*nextForward+right[1]*nextSide;
   v.x+=v.vx*dt;v.z+=v.vz*dt;
   v.yaw=Math.atan2(v.vx,v.vz);
  } else if(v.route==='z'){
   const laneError=v.routeLaneX-v.x;
   const lateralAccel=clamp(laneError*2.3-v.vx*1.65,-6,6)*recovery;
   v.vx+=lateralAccel*dt;
   v.vz+=clamp(targetSpeed-v.vz,-3.2*dt,3.2*dt);
   v.x+=v.vx*dt;v.z+=v.vz*dt;
   v.yaw=Math.atan2(v.vx,v.vz);
   if(v.z>112){v.z=-112;v.vz=Math.max(1,v.maxSpeed*.65);}
   if(v.z< -112){v.z=112;v.vz=-Math.max(1,v.maxSpeed*.65);}
  } else {
   const laneError=v.routeLaneZ-v.z;
   const lateralAccel=clamp(laneError*2.3-v.vz*1.65,-6,6)*recovery;
   v.vz+=lateralAccel*dt;
   v.vx+=clamp(targetSpeed-v.vx,-3.2*dt,3.2*dt);
   v.x+=v.vx*dt;v.z+=v.vz*dt;
   v.yaw=Math.atan2(v.vx,v.vz);
   if(v.x>112){v.x=-112;v.vx=Math.max(1,v.maxSpeed*.65);}
   if(v.x< -112){v.x=112;v.vx=-Math.max(1,v.maxSpeed*.65);}
  }
  v.y=driveSurfaceH(v.x,v.z)+.04;v.grounded=true;v.vy=0;
  v.longAccel=0;v.lateralAccel=0;updateVehicleSuspension(v,dt);updateVehicleWheelAnimation(v,dt,v.aiWheelSteer||0);return;
 }
 const oldX=v.x,oldZ=v.z,oldYaw=v.yaw;let wheelSteeringInput=0;
 if(v===controlled&&!onFoot){
  const f=vehicleForward(v),previousForwardSpeed=v.vx*f[0]+v.vz*f[1];
  const forwardInput=(pressed('w')||pressed('arrowup')||pressed('gas')?1:0);
  const brakeInput=(pressed('s')||pressed('arrowdown')||pressed('brake')?1:0);
  const steerInput=steeringInput(),hand=pressed(' '),throttle=forwardInput;wheelSteeringInput=steerInput;
  if(throttle){const airTraction=v.grounded===false?.20:1;const boostMultiplier=boostActive?2.25:1;v.vx+=f[0]*v.accel*boostMultiplier*throttle*dt*airTraction;v.vz+=f[1]*v.accel*boostMultiplier*throttle*dt*airTraction;}
  if(brakeInput){
   const speed=v.vx*f[0]+v.vz*f[1];
   if(speed>1.0){const amount=Math.min(speed,v.brakeDecel*dt);v.vx-=f[0]*amount;v.vz-=f[1]*amount;}
   else {v.vx-=f[0]*v.accel*.48*dt;v.vz-=f[1]*v.accel*.48*dt;}
  }
  const speed=v.vx*f[0]+v.vz*f[1],steerFactor=clamp(Math.abs(speed)/4.0,.14,1.25);
  const desiredYawRate=steerInput*v.steerRate*steerFactor*(speed>=-.2?1:-1);
  const steeringResponse=v.type==='semi'?2.4:v.mass>1450?4.2:7.5;
  v.yawRate=lerp(v.yawRate,desiredYawRate,1-Math.exp(-steeringResponse*dt));
  v.yaw+=v.yawRate*dt;
  const nf=vehicleForward(v),nr=[Math.cos(v.yaw),-Math.sin(v.yaw)];
  let forwardSpeed=v.vx*nf[0]+v.vz*nf[1],sideSpeed=v.vx*nr[0]+v.vz*nr[1];
  sideSpeed*=Math.exp(-(hand?8.0:v.lateralGrip)*dt);
  forwardSpeed*=Math.exp(-(hand?3.4:(throttle||brakeInput?0.24:0.68))*dt);
  const boostTopSpeed=boostActive?v.maxSpeed*1.16:v.maxSpeed;
  forwardSpeed=clamp(forwardSpeed,-v.maxSpeed*.36,boostTopSpeed);
  v.vx=nf[0]*forwardSpeed+nr[0]*sideSpeed;v.vz=nf[1]*forwardSpeed+nr[1]*sideSpeed;
  v.longAccel=(forwardSpeed-previousForwardSpeed)/Math.max(dt,.001);
  v.lateralAccel=(sideSpeed-(v.previousSideSpeed||0))/Math.max(dt,.001);v.previousSideSpeed=sideSpeed;
 } else if(v.parked){v.vx*=Math.exp(-3*dt);v.vz*=Math.exp(-3*dt);v.yawRate*=Math.exp(-5*dt);v.longAccel=0;v.lateralAccel=0;}
 else {v.vx*=Math.exp(-.8*dt);v.vz*=Math.exp(-.8*dt);v.yawRate*=Math.exp(-3*dt);v.longAccel=0;v.lateralAccel=0;}
 v.x+=v.vx*dt;v.z+=v.vz*dt;
 if(v.x< -436||v.x>436){v.x=clamp(v.x,-436,436);v.vx*=-.35;}
 if(v.z< -436||v.z>436){v.z=clamp(v.z,-436,436);v.vz*=-.35;}
 for(const box of buildingColliders)resolveVehicleBuilding(v,box);
 for(let i=0;i<props.length;i++)resolveVehicleProp(v,props[i],i);

 let landed=false,landingImpact=0;
 // Only the currently driven vehicle gets the full jump arc. Other vehicles stay grounded.
 if(v===controlled&&!onFoot){
  const dx=v.x-oldX,dz=v.z-oldZ,travel=Math.hypot(dx,dz),surface=driveSurfaceH(v.x,v.z)+.04;
  if(v.grounded!==false){
   v.y=surface;v.vy=0;
   const horizontalSpeed=Math.hypot(v.vx,v.vz);
   for(const r of allRamps){
    const inside=Math.abs(v.x-r.x)<=r.halfWidth;
    const crossedNear=dz>0&&oldZ<r.crestZ&&v.z>=r.crestZ;
    const crossedFar=dz<0&&oldZ>r.flatEndZ&&v.z<=r.flatEndZ;
    if(inside&&travel>.002&&horizontalSpeed>2.5&&(crossedNear||crossedFar)){
     const slope=r.rise/(crossedNear?(r.crestZ-r.startZ):(r.endZ-r.flatEndZ));
     v.vy=clamp(Math.max(3.5,slope*horizontalSpeed*1.65),3.5,8.8);
     v.grounded=false;v.airTime=0;v.lastRampLaunch=performance.now();say('RAMP JUMP! Stay in the air to earn a bonus.',1100);break;
    }
   }
  } else {
   v.y+=v.vy*dt;v.vy-=15.5*dt;
   if(v.y<=surface){
    landingImpact=Math.max(0,-v.vy);v.y=surface;v.vy=0;v.grounded=true;landed=true;
    v.suspensionVelocity-=Math.min(landingImpact*.17,.8);
    v.pitchVelocity+=clamp(-landingImpact*.025,-.22,.22);
    say('Nice landing!',650);
   } else v.airTime=(v.airTime||0)+dt;
  }
  if(landed){awardAirTime(v,v.airTime||0);v.airTime=0;}
  v.surfaceSlope=0;
 } else {
  v.y=driveSurfaceH(v.x,v.z)+.04;v.vy=0;v.grounded=true;v.surfaceSlope=0;
 }
 updateVehicleSuspension(v,dt);updateVehicleWheelAnimation(v,dt,wheelSteeringInput);
}

function updateFoot(dt){
 const turn=steeringInput();
 player.yaw+=turn*2.35*dt;
 const f=[Math.sin(player.yaw),Math.cos(player.yaw)];let move=(pressed('w')||pressed('arrowup')?1:0)-(pressed('s')||pressed('arrowdown')?1:0);
 player.x+=f[0]*move*6.2*dt;player.z+=f[1]*move*6.2*dt;
 player.x=clamp(player.x,-106,106);player.z=clamp(player.z,-106,106);
 // Keep the on-foot character out of buildings.
 for(const box of buildingColliders){const dx=player.x-box.x,dz=player.z-box.z,cx=clamp(dx,-box.hw,box.hw),cz=clamp(dz,-box.hl,box.hl);let nx=dx-cx,nz=dz-cz,d=Math.hypot(nx,nz);if(d<.65){if(d<.001){nx=1;nz=0;d=1;}player.x+=nx/d*(.65-d);player.z+=nz/d*(.65-d);}}
 for(const p of props){const dx=player.x-p.x,dz=player.z-p.z,d=Math.hypot(dx,dz);if(d<p.radius+.45){const n=d||1;player.x+=(dx/n||1)*.04;player.z+=(dz/n||0)*.04;}}
 player.y=driveSurfaceH(player.x,player.z);
}
function updateProps(dt){
 for(const p of props){if(p.broken)continue;p.x+=p.vx*dt;p.z+=p.vz*dt;p.vx*=Math.exp(-2.35*dt);p.vz*=Math.exp(-2.35*dt);p.y=driveSurfaceH(p.x,p.z);p.yaw+=p.roll*dt;p.roll*=Math.exp(-2.0*dt);
  for(const box of buildingColliders){const dx=p.x-box.x,dz=p.z-box.z,cx=clamp(dx,-box.hw,box.hw),cz=clamp(dz,-box.hl,box.hl),nx=dx-cx,nz=dz-cz,d=Math.hypot(nx,nz);if(d<p.radius){const n=d||1;p.x+=(nx/n||1)*(p.radius-d);p.z+=(nz/n||0)*(p.radius-d);p.vx*=.35;p.vz*=.35;}}
 }
 for(let i=props.length-1;i>=0;i--)if(props[i].broken)props.splice(i,1);
}
function updateDebris(dt){
 for(const d of debris){d.life-=dt;d.vy-=10.5*dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.z+=d.vz*dt;d.yaw+=d.spin*dt;const floor=terrainH(d.x,d.z)+.06;if(d.y<floor){d.y=floor;d.vy=Math.abs(d.vy)*.28;d.vx*=.72;d.vz*=.72;d.spin*=.65;}}
 for(let i=debris.length-1;i>=0;i--)if(debris[i].life<=0)debris.splice(i,1);
 if(debris.length>180)debris.splice(0,debris.length-180);
}
function updatePhysics(dt){
 currentCrashContacts=new Set();
 if(onFoot)updateFoot(dt);
 for(const v of vehicles)updateVehicle(v,dt);
 // Semi-trailers update as separate heavy bodies, then collide with buildings, traffic and props.
 for(const semi of vehicles)if(semi.trailer){
  updateSemiTrailer(semi,dt);
  for(const box of buildingColliders)resolveTrailerBuilding(semi,box);
  for(const other of vehicles)if(other!==semi)resolveTrailerVehicle(semi,other);
  for(let i=0;i<props.length;i++)resolveTrailerProp(semi,props[i],i);
 }
 // Tractor and traffic collisions use mass-weighted impulses. AI vehicles recover gradually.
 for(let i=0;i<vehicles.length;i++)for(let j=i+1;j<vehicles.length;j++)resolveVehiclePair(vehicles[i],vehicles[j]);
 updateProps(dt);updateDebris(dt);
 previousCrashContacts=currentCrashContacts;
 currentCrashContacts=null;
}

let camera={x:0,y:8,z:-12};
function updateCamera(dt){
 let target,desired;
 if(onFoot){const f=[Math.sin(player.yaw),Math.cos(player.yaw)];target=[player.x,player.y+1.25,player.z];desired=[player.x-f[0]*7,player.y+3.5,player.z-f[1]*7];}
 else {const f=vehicleForward(controlled);const h=Number.isFinite(controlled.y)?controlled.y:driveSurfaceH(controlled.x,controlled.z)+.04;target=[controlled.x,h+(controlled.type==='semi'?2.2:1.2),controlled.z];const back=cameraMode===1?6.5:cameraMode===2?14:10.5;const lift=cameraMode===1?3.0:cameraMode===2?7.4:5.2;desired=[controlled.x-f[0]*back,h+lift,controlled.z-f[1]*back];}
 const smooth=1-Math.exp(-Math.max(dt,.001)*3.5);camera.x=lerp(camera.x,desired[0],smooth);camera.y=lerp(camera.y,desired[1],smooth);camera.z=lerp(camera.z,desired[2],smooth);
 return {target,desired};
}
function drawWorld(dt){
 const w=canvas.clientWidth,h=canvas.clientHeight;const dpr=Math.min(window.devicePixelRatio||1,1.65);
 if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr)){canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);gl.viewport(0,0,canvas.width,canvas.height);}
 gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 const c=updateCamera(dt),target=c.target;const view=lookAt([camera.x,camera.y,camera.z],target,[0,1,0]);const proj=perspective(58*Math.PI/180,canvas.width/canvas.height,.1,1400);const vp=matMul(proj,view);
 gl.uniformMatrix4fv(loc.vp,false,vp);gl.uniform3fv(loc.camera,[camera.x,camera.y,camera.z]);
 draw(worldMesh,modelMatrix(0,0,0,0),vp,[camera.x,camera.y,camera.z]);
 // Render the independent sidewalk and asphalt layers above the rolling terrain.
 draw(sidewalkMesh,modelMatrix(0,0,0,0),vp,[camera.x,camera.y,camera.z]);
 draw(roadMesh,modelMatrix(0,0,0,0),vp,[camera.x,camera.y,camera.z]);
 drawShadows(vp);
 // Props are individually movable and have simple momentum.
 for(const p of props){if(p.broken)continue;const mesh=p.type==='barrel'?barrelModel:crateModel;draw(mesh,modelMatrix(p.x,p.y,p.z,p.yaw),vp,[camera.x,camera.y,camera.z]);}
 for(const d of debris){const shrink=clamp(d.life/.35,.35,1);draw(d.model,modelMatrix(d.x,d.y,d.z,d.yaw,d.scale*shrink),vp,[camera.x,camera.y,camera.z]);}
 // Vehicles: chassis pitch/roll are visualized by the suspension model.
 for(const v of vehicles){
  const y=(Number.isFinite(v.y)?v.y:driveSurfaceH(v.x,v.z)+.04)+(v.suspensionOffset||0);
  const vehicleRoot=modelMatrix(v.x,y,v.z,v.yaw,1,v.pitch||0,v.roll||0);
  drawVehicleVisual(v.model,vehicleRoot,v.wheelSpin||0,v.wheelSteerAngle||0,vp,[camera.x,camera.y,camera.z]);
  if(v.trailer){const t=v.trailer,trailerRoot=modelMatrix(t.x,t.y,t.z,t.yaw);drawVehicleVisual(t.model,trailerRoot,t.wheelSpin||0,0,vp,[camera.x,camera.y,camera.z]);}
 }
 // Small on-foot character, built from primitive boxes.
 if(onFoot){draw(personModel,modelMatrix(player.x,player.y,player.z,player.yaw),vp,[camera.x,camera.y,camera.z]);}
}
function updateUI(){
 const boostEl=$('boostStatus');
 if(onFoot){boostEl.textContent='BOOST · IN VEHICLE';boostEl.style.color='#a8efff';vehicleNameEl.textContent='On Foot';speedEl.innerHTML='WALK <small>MODE</small>';}
 else {vehicleNameEl.textContent=controlled.name;speedEl.innerHTML=Math.round(currentSpeed())+' <small>MPH</small>';if(controlled.boostTime>0){boostEl.textContent='BOOST ACTIVE · '+controlled.boostTime.toFixed(1)+'s';boostEl.style.color='#ffe17c';}else if(controlled.boostCooldown>0){boostEl.textContent='BOOST RECHARGE · '+controlled.boostCooldown.toFixed(1)+'s';boostEl.style.color='#c4d0d5';}else{boostEl.textContent='BOOST READY · SHIFT';boostEl.style.color='#a8efff';}}
 let hint='Explore a glossy, brick-built toy town with rolling hills and an industrial yard.';
 if(onFoot){const v=nearestVehicle(player.x,player.z);hint=v?'Press E to get into the '+v.name+'.':'Walk up to a vehicle and press E to drive it.';}
 else if(atUpgradePad()){hint='Tuning pad: stop to buy top-speed, acceleration or impact upgrades.';}
 else {hint='Shift: turbo boost  ·  E: exit vehicle  ·  C: camera  ·  Crashes, broken props and airtime earn cash.';}
 if(hint!==lastHint){hintEl.textContent=hint;lastHint=hint;}
 refreshUpgradePanel();
 if(performance.now()>messageUntil)messageEl.classList.remove('show');
}
function drawMap(){
 const c=$('map'),ctx=c.getContext('2d'),W=c.width,H=c.height;ctx.clearRect(0,0,W,H);
 ctx.fillStyle='#263d37';ctx.fillRect(0,0,W,H);
 // minimap covers the full 4x4 city footprint.
 const px=x=>(x+440)/880*W,py=z=>(440-z)/880*H;
 ctx.strokeStyle='#899494';ctx.lineWidth=3;ctx.beginPath();
 for(const s of streetLines){ctx.moveTo(px(s),py(-440));ctx.lineTo(px(s),py(440));ctx.moveTo(px(-440),py(s));ctx.lineTo(px(440),py(s));}
 ctx.stroke();
 ctx.strokeStyle='#e5dca9';ctx.lineWidth=.7;ctx.setLineDash([3,4]);ctx.beginPath();
 for(const s of streetLines){ctx.moveTo(px(s),py(-440));ctx.lineTo(px(s),py(440));ctx.moveTo(px(-440),py(s));ctx.lineTo(px(440),py(s));}
 ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle='#b9a98b';for(const b of buildingColliders)if(!b.kind||b.kind==='building')ctx.fillRect(px(b.x-b.hw),py(b.z+b.hl),(b.hw*2/880)*W,(b.hl*2/880)*H);
 ctx.fillStyle='#f4cf59';ctx.fillRect(px(upgradeRamp.x)-7,py(34.2)-7,14,14);ctx.strokeStyle='#fff2b5';ctx.lineWidth=2;ctx.strokeRect(px(upgradeRamp.x)-7,py(34.2)-7,14,14);
 const rampMapColors=['#ff8b54','#54d4da','#cf8cff'];
 for(let i=0;i<stuntRamps.length;i++){const r=stuntRamps[i];ctx.fillStyle=rampMapColors[i%rampMapColors.length];ctx.fillRect(px(r.x)-5,py((r.startZ+r.endZ)/2)-5,10,10);}
 for(const v of vehicles){ctx.beginPath();ctx.arc(px(v.x),py(v.z),v.ai?4.5:6.2,0,Math.PI*2);ctx.fillStyle=v===controlled?'#fff37b':v.type==='semi'?'#f2bd3f':v.type==='pickup'?'#6fbaff':v.ai?'#e5eceb':'#e96c60';ctx.fill();}
 const p=onFoot?player:controlled;ctx.save();ctx.translate(px(p.x),py(p.z));ctx.rotate(-p.yaw);ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(-6,7);ctx.closePath();ctx.fill();ctx.restore();
 ctx.strokeStyle='rgba(255,255,255,.32)';ctx.lineWidth=3;ctx.strokeRect(1.5,1.5,W-3,H-3);
}
function frame(t){
 if(!started){requestAnimationFrame(frame);return;}
 try {
  const dt=Math.min(.04,(t-(lastTime||t))/1000||.016);lastTime=t;
  updatePhysics(dt);drawWorld(dt);updateUI();drawMap();
  requestAnimationFrame(frame);
 } catch (error) {
  showFatalError('The game stopped while running', error && error.message ? error.message : String(error));
 }
}
engineReady = true;
$('startbtn').disabled=false;$('startbtn').textContent='START DRIVING';
requestAnimationFrame(frame);
say('');
})();
