"use strict";
// =============================================================================
// src/vehicles.js
// Vehicle asset loading, toy models, vehicle() factory, player car, semi + trailer, district traffic routes.
// Reads window.FREE_ROAM_VEHICLE_ASSETS (set by the boot script in index.html).
// =============================================================================

// Imported stylized vehicle assets (Grab3D Cozy Vehicles models, CC0 1.0).
// Geometry lives in assets/vehicle_meshes.bin and is loaded once by the HTML bootstrap.
// Keeping binary model data outside game.js avoids a multi-megabyte base64 HTML payload.
const VEHICLE_ASSET_DATA = window.FREE_ROAM_VEHICLE_ASSETS;
if (!VEHICLE_ASSET_DATA || !VEHICLE_ASSET_DATA.meta || !VEHICLE_ASSET_DATA.buffer)
  throw new Error(
    "Vehicle model files were not loaded. Start the game with run_game.py or the provided launcher.",
  );
const VEHICLE_GEOMETRY_BUFFER = VEHICLE_ASSET_DATA.buffer;
function createIndexedVehicleMesh(desc, tint = [1, 1, 1]) {
  const sourceVertices = new Float32Array(
    VEHICLE_GEOMETRY_BUFFER,
    desc.vertexByteOffset,
    desc.vertexCount * 12,
  );
  let vertices = sourceVertices;
  if (tint[0] !== 1 || tint[1] !== 1 || tint[2] !== 1) {
    vertices = new Float32Array(sourceVertices);
    for (let i = 0; i < vertices.length; i += 12) {
      vertices[i + 6] = clamp(vertices[i + 6] * tint[0], 0, 1);
      vertices[i + 7] = clamp(vertices[i + 7] * tint[1], 0, 1);
      vertices[i + 8] = clamp(vertices[i + 8] * tint[2], 0, 1);
    }
  }
  const indices = new Uint16Array(VEHICLE_GEOMETRY_BUFFER, desc.indexByteOffset, desc.indexCount);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  return {
    buffer,
    indexBuffer,
    count: indices.length,
    indexed: true,
    vertexCount: vertices.length / 12,
  };
}
function createVehicleVisual(key, tint = [1, 1, 1]) {
  const spec = VEHICLE_ASSET_DATA.meta[key];
  return {
    body: createIndexedVehicleMesh(spec.body, tint),
    wheels: spec.wheels.map((w) => ({
      label: w.label,
      steer: w.steer,
      pivot: w.pivot,
      radius: w.radius,
      mesh: createIndexedVehicleMesh(w.mesh),
    })),
  };
}
const compactAsset = createVehicleVisual("compact");
const pickupAsset = createVehicleVisual("pickup");
const semiAsset = createVehicleVisual("semi");
const trailerAsset = createVehicleVisual("trailer");
const models = {
  compact: compactAsset,
  pickup: pickupAsset,
  semi: semiAsset,
  // Traffic shares the compact wheel buffers; only its body color is varied.
  trafficA: {
    body: createIndexedVehicleMesh(VEHICLE_ASSET_DATA.meta.compact.body, [1.08, 0.88, 0.82]),
    wheels: compactAsset.wheels,
  },
  trafficB: {
    body: createIndexedVehicleMesh(VEHICLE_ASSET_DATA.meta.compact.body, [0.78, 0.93, 1.12]),
    wheels: compactAsset.wheels,
  },
  trafficC: {
    body: createIndexedVehicleMesh(VEHICLE_ASSET_DATA.meta.compact.body, [1.12, 0.91, 0.7]),
    wheels: compactAsset.wheels,
  },
};
const trailerModel = trailerAsset;
const crateModel = (() => {
  const b = new MeshBuilder();
  b.useMaterial(0.9, 0, 5);
  b.box(-0.52, 0, -0.52, 0.52, 1.02, 0.52, [0.5, 0.32, 0.17]);
  b.box(-0.55, 0.42, -0.56, 0.55, 0.53, 0.56, [0.34, 0.22, 0.12]);
  b.box(-0.53, 0.05, -0.55, 0.53, 0.14, 0.55, [0.37, 0.25, 0.14]);
  return b.finish();
})();
const barrelModel = (() => {
  const b = new MeshBuilder();
  b.useMaterial(0.38, 0.48, 6);
  b.cylinderY(0, 0, 0, 0.43, 1.05, [0.55, 0.23, 0.12], 14);
  b.cylinderY(0, 0.08, 0, 0.445, 0.07, [0.24, 0.26, 0.27], 14);
  b.cylinderY(0, 0.89, 0, 0.445, 0.07, [0.24, 0.26, 0.27], 14);
  return b.finish();
})();
const personModel = (() => {
  const b = new MeshBuilder();
  b.useMaterial(0.82, 0, 6);
  b.box(-0.28, 0, -0.2, 0.28, 1.0, 0.2, [0.22, 0.28, 0.62]);
  b.box(-0.24, 0.98, -0.22, 0.24, 1.45, 0.22, [0.78, 0.58, 0.42]);
  return b.finish();
})();
const debrisModels = {
  crate: (() => {
    const b = new MeshBuilder();
    b.useMaterial(0.22, 0, 0);
    b.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, [0.63, 0.39, 0.19]);
    return b.finish();
  })(),
  barrel: (() => {
    const b = new MeshBuilder();
    b.useMaterial(0.19, 0, 0);
    b.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, [0.91, 0.34, 0.13]);
    return b.finish();
  })(),
};
const debris = [];

const vehicles = [];
function vehicle(id, type, name, x, z, yaw, opts = {}) {
  const maxSpeed =
    opts.topSpeedMph !== undefined
      ? opts.topSpeedMph * MPH_TO_MS
      : opts.maxSpeed !== undefined
        ? opts.maxSpeed
        : 20 * MPH_TO_MS;
  const baseAccel = opts.accel ?? 6;
  const v = {
    id,
    type,
    name,
    x,
    z,
    yaw,
    vx: 0,
    vz: 0,
    y: driveSurfaceH(x, z) + 0.04,
    vy: 0,
    grounded: true,
    surfaceSlope: 0,
    model: models[type],
    width: opts.width || 1.9,
    length: opts.length || 4.3,
    mass: opts.mass || 1200,
    accel: baseAccel,
    baseAccel,
    accelerationLevel: 0,
    maxSpeed,
    baseMaxSpeed: maxSpeed,
    topSpeedLevel: 0,
    impactLevel: 0,
    impactMultiplier: 1,
    boostTime: 0,
    boostCooldown: 0,
    steerRate: opts.steerRate || 1.8,
    yawRate: 0,
    brakeDecel: opts.brakeDecel ?? (type === "semi" ? 5.4 : type === "pickup" ? 9.5 : 12.5),
    lateralGrip: opts.lateralGrip ?? (type === "semi" ? 2.0 : type === "pickup" ? 3.6 : 4.4),
    wheelSpin: 0,
    wheelSteerAngle: 0,
    suspensionOffset: 0,
    suspensionVelocity: 0,
    pitch: 0,
    roll: 0,
    pitchVelocity: 0,
    rollVelocity: 0,
    previousSurfaceY: driveSurfaceH(x, z) + 0.04,
    longAccel: 0,
    lateralAccel: 0,
    ai: !!opts.ai,
    parked: !!opts.parked,
    route: opts.route || null,
    routeDir: opts.routeDir || 1,
    routeIndex: opts.routeIndex ?? -1,
    routeS: opts.routeS ?? 0,
    routeLane: opts.routeLane ?? 0,
    trafficNodeXIndex: opts.trafficNodeXIndex ?? -1,
    trafficNodeZIndex: opts.trafficNodeZIndex ?? -1,
    trafficHeading: opts.trafficHeading ?? 0,
    trafficLane: opts.trafficLane ?? -1.8,
    trafficSeed: opts.trafficSeed ?? 0,
    trafficLeg: null,
    trafficProgress: 0,
    trafficExitOffset: 0,
    trafficTurnCount: 0,
    trafficDecisionCount: 0,
    trafficVisitedNodeCount: 0,
    trafficRegionMask: 0,
    trafficMinNodeX: 0,
    trafficMaxNodeX: 0,
    trafficMinNodeZ: 0,
    trafficMaxNodeZ: 0,
    trafficStartEdgeKey: "",
    routeLaneX: x,
    routeLaneZ: z,
    aiKnockTime: 0,
    interactRadius: opts.interactRadius || 5,
    airTime: 0,
  };
  vehicles.push(v);
  return v;
}
const playerCar = vehicle("starter", "compact", "Mint Compact", 5, 15, 0, {
  width: 1.9,
  length: 4.2,
  mass: 1050,
  accel: 5.8,
  topSpeedMph: 20,
  steerRate: 2.15,
});
vehicle("pickup", "pickup", "Sage Pickup", 14, 17, -0.18, {
  width: 2,
  length: 5,
  mass: 1750,
  accel: 4.8,
  topSpeedMph: 20,
  steerRate: 1.7,
  parked: true,
});
const semiVehicle = vehicle("semi", "semi", "Blue Semi Truck", -12, 16, Math.PI, {
  width: 2.5,
  length: 5.0,
  mass: 5600,
  accel: 2.8,
  topSpeedMph: 20,
  steerRate: 0.82,
  brakeDecel: 5.2,
  lateralGrip: 1.85,
  parked: true,
  interactRadius: 8,
});
// The trailer is its own heavy body. Its front coupler is constrained to the tractor's fifth wheel.
{
  const f = [Math.sin(semiVehicle.yaw), Math.cos(semiVehicle.yaw)];
  semiVehicle.trailer = {
    x: semiVehicle.x - f[0] * 6.35,
    z: semiVehicle.z - f[1] * 6.35,
    yaw: semiVehicle.yaw,
    vx: 0,
    vz: 0,
    y: driveSurfaceH(semiVehicle.x - f[0] * 6.35, semiVehicle.z - f[1] * 6.35) + 0.04,
    width: 2.35,
    length: 8.5,
    mass: 3800,
    yawRate: 0,
    wheelSpin: 0,
    maxArticulation: Math.PI * 0.34,
    model: trailerModel,
  };
}
// Traffic uses four fixed district circuits aligned to the existing inner street grid.
// Each route rounds its corners inside the intersection footprint. Three persistent cars
// share each circuit, using both directions and the two opposing lanes. No spawning or
// despawning occurs; collisions can still knock cars away and the soft AI spring guides
// them back toward their route.
// Traffic now navigates the complete street grid instead of following closed district loops.
// The street grid is a simple 8x8 intersection lattice. Cars follow lane-aware legs between
// intersections and make a seeded straight/left/right decision at each one.
const TRAFFIC_LANE_OFFSET = -1.8;
const TRAFFIC_TURN_RADIUS = 5.7;
const TRAFFIC_TURN_HANDLE = 3.5;
const TRAFFIC_CURVE_STEPS = 12;
const TRAFFIC_HEADINGS = [
  { dx: 0, dz: 1, yaw: 0 }, // north / +Z
  { dx: 1, dz: 0, yaw: Math.PI / 2 }, // east / +X
  { dx: 0, dz: -1, yaw: Math.PI }, // south / -Z
  { dx: -1, dz: 0, yaw: -Math.PI / 2 }, // west / -X
];

function trafficRandom(v) {
  v.trafficSeed = (Math.imul(v.trafficSeed, 1664525) + 1013904223) >>> 0;
  return v.trafficSeed / 4294967296;
}
function trafficGridPosition(xIndex, zIndex, heading, laneOffset, forwardOffset = 0) {
  const h = TRAFFIC_HEADINGS[heading];
  return {
    x: streetLines[xIndex] + h.dx * forwardOffset + h.dz * laneOffset,
    z: streetLines[zIndex] + h.dz * forwardOffset - h.dx * laneOffset,
  };
}
function trafficRegionBit(xIndex, zIndex) {
  const half = Math.floor(streetLines.length / 2);
  const east = xIndex >= half ? 1 : 0;
  const south = zIndex >= half ? 1 : 0;
  return 1 << (south * 2 + east);
}
function trafficChooseNextHeading(v, heading, nodeXIndex, nodeZIndex) {
  const options = [
    { heading, weight: 0.56 }, // continue straight
    { heading: (heading + 3) % 4, weight: 0.22 }, // turn left
    { heading: (heading + 1) % 4, weight: 0.22 }, // turn right
  ].filter((option) => {
    const h = TRAFFIC_HEADINGS[option.heading];
    const x = nodeXIndex + h.dx;
    const z = nodeZIndex + h.dz;
    return x >= 0 && x < streetLines.length && z >= 0 && z < streetLines.length;
  });
  if (!options.length) throw new Error("Traffic reached a grid node with no legal exit");
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let choice = trafficRandom(v) * total;
  for (const option of options) {
    choice -= option.weight;
    if (choice <= 0) return option.heading;
  }
  return options[options.length - 1].heading;
}
function trafficAddLegSample(samples, point) {
  const previous = samples[samples.length - 1];
  const distance = previous
    ? previous.distance + Math.hypot(point.x - previous.x, point.z - previous.z)
    : 0;
  samples.push({ x: point.x, z: point.z, distance });
}
function trafficBuildLeg(v) {
  const incoming = v.trafficHeading;
  const hIn = TRAFFIC_HEADINGS[incoming];
  const nextXIndex = v.trafficNodeXIndex + hIn.dx;
  const nextZIndex = v.trafficNodeZIndex + hIn.dz;
  if (
    nextXIndex < 0 ||
    nextXIndex >= streetLines.length ||
    nextZIndex < 0 ||
    nextZIndex >= streetLines.length
  ) {
    throw new Error("Traffic tried to plan a road segment outside the street grid");
  }

  const outgoing = trafficChooseNextHeading(v, incoming, nextXIndex, nextZIndex);
  const turned = outgoing !== incoming;
  const start = trafficGridPosition(
    v.trafficNodeXIndex,
    v.trafficNodeZIndex,
    incoming,
    v.trafficLane,
    v.trafficExitOffset,
  );
  const samples = [];
  trafficAddLegSample(samples, start);
  let lineEnd;
  let turnEnd = null;

  if (turned) {
    const approach = trafficGridPosition(
      nextXIndex,
      nextZIndex,
      incoming,
      v.trafficLane,
      -TRAFFIC_TURN_RADIUS,
    );
    lineEnd = approach;
    trafficAddLegSample(samples, approach);

    const outgoingPoint = trafficGridPosition(
      nextXIndex,
      nextZIndex,
      outgoing,
      v.trafficLane,
      TRAFFIC_TURN_RADIUS,
    );
    const c1 = {
      x: approach.x + hIn.dx * TRAFFIC_TURN_HANDLE,
      z: approach.z + hIn.dz * TRAFFIC_TURN_HANDLE,
    };
    const hOut = TRAFFIC_HEADINGS[outgoing];
    const c2 = {
      x: outgoingPoint.x - hOut.dx * TRAFFIC_TURN_HANDLE,
      z: outgoingPoint.z - hOut.dz * TRAFFIC_TURN_HANDLE,
    };
    for (let step = 1; step <= TRAFFIC_CURVE_STEPS; step++) {
      const t = step / TRAFFIC_CURVE_STEPS;
      const u = 1 - t;
      trafficAddLegSample(samples, {
        x:
          u * u * u * approach.x +
          3 * u * u * t * c1.x +
          3 * u * t * t * c2.x +
          t * t * t * outgoingPoint.x,
        z:
          u * u * u * approach.z +
          3 * u * u * t * c1.z +
          3 * u * t * t * c2.z +
          t * t * t * outgoingPoint.z,
      });
    }
    turnEnd = outgoingPoint;
  } else {
    lineEnd = trafficGridPosition(nextXIndex, nextZIndex, incoming, v.trafficLane);
    trafficAddLegSample(samples, lineEnd);
  }

  v.trafficDecisionCount++;
  return {
    samples,
    length: samples[samples.length - 1].distance,
    lineLength: Math.hypot(lineEnd.x - start.x, lineEnd.z - start.z),
    nextXIndex,
    nextZIndex,
    nextHeading: outgoing,
    exitOffset: turned ? TRAFFIC_TURN_RADIUS : 0,
    turn: turned,
    end: turned ? turnEnd : lineEnd,
  };
}
function trafficLegPoint(leg, distance) {
  const samples = leg.samples;
  if (distance <= 0) {
    const a = samples[0], b = samples[1] || samples[0];
    return { x: a.x, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
  }
  if (distance >= leg.length) {
    const p = leg.end;
    return { x: p.x, z: p.z, yaw: TRAFFIC_HEADINGS[leg.nextHeading].yaw };
  }
  let index = 1;
  while (index < samples.length && samples[index].distance < distance) index++;
  const a = samples[index - 1], b = samples[index];
  const span = Math.max(0.0001, b.distance - a.distance);
  const t = clamp((distance - a.distance) / span, 0, 1);
  return {
    x: lerp(a.x, b.x, t),
    z: lerp(a.z, b.z, t),
    yaw: Math.atan2(b.x - a.x, b.z - a.z),
  };
}

const trafficFleet = [];
const trafficStartEdges = [];
for (let z = 0; z < streetLines.length; z++)
  for (let x = 0; x < streetLines.length - 1; x++)
    trafficStartEdges.push({ x, z, heading: 1 }); // east-west street
for (let x = 0; x < streetLines.length; x++)
  for (let z = 0; z < streetLines.length - 1; z++)
    trafficStartEdges.push({ x, z, heading: 0 }); // north-south street

// Shuffle a fixed road-edge list with its own seed. This makes starts varied but repeatable.
let trafficLayoutSeed = 0x6d2b79f5;
function trafficLayoutRandom() {
  trafficLayoutSeed = (Math.imul(trafficLayoutSeed, 1664525) + 1013904223) >>> 0;
  return trafficLayoutSeed / 4294967296;
}
for (let i = trafficStartEdges.length - 1; i > 0; i--) {
  const j = Math.floor(trafficLayoutRandom() * (i + 1));
  [trafficStartEdges[i], trafficStartEdges[j]] = [trafficStartEdges[j], trafficStartEdges[i]];
}

for (let i = 0; i < 12; i++) {
  const edge = trafficStartEdges[i];
  let nodeXIndex = edge.x;
  let nodeZIndex = edge.z;
  let heading = edge.heading;
  if (trafficLayoutRandom() < 0.5) {
    const edgeDirection = TRAFFIC_HEADINGS[heading];
    nodeXIndex += edgeDirection.dx;
    nodeZIndex += edgeDirection.dz;
    heading = (heading + 2) % 4;
  }
  const lane = TRAFFIC_LANE_OFFSET;
  const seed = (0x51f15e5d ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  const p = trafficGridPosition(nodeXIndex, nodeZIndex, heading, lane);
  const fleetIndex = i;
  const v = vehicle(
    "traffic-grid-" + String(i + 1).padStart(2, "0"),
    ["trafficA", "trafficB", "trafficC"][fleetIndex % 3],
    ["Town Car", "Green Car", "Orange Car"][fleetIndex % 3],
    p.x,
    p.z,
    TRAFFIC_HEADINGS[heading].yaw,
    {
      width: 1.8,
      length: 4.2,
      mass: 1000,
      accel: 0,
      maxSpeed: 10.5 + (fleetIndex % 4) * 0.75,
      steerRate: 0,
      ai: true,
      route: "grid",
      trafficNodeXIndex: nodeXIndex,
      trafficNodeZIndex: nodeZIndex,
      trafficHeading: heading,
      trafficLane: lane,
      trafficSeed: seed,
    },
  );
  v.trafficStartEdgeKey = edge.x + "," + edge.z + "," + edge.heading;
  v.trafficStartXIndex = nodeXIndex;
  v.trafficStartZIndex = nodeZIndex;
  v.trafficStartHeading = heading;
  v.trafficMinNodeX = v.trafficMaxNodeX = nodeXIndex;
  v.trafficMinNodeZ = v.trafficMaxNodeZ = nodeZIndex;
  v.trafficVisitedNodeCount = 1;
  v.trafficRegionMask = trafficRegionBit(nodeXIndex, nodeZIndex);
  v.trafficStartRegionMask = v.trafficRegionMask;
  v.trafficExitOffset = 0;
  v.trafficLeg = trafficBuildLeg(v);
  v.trafficProgress = 12 + trafficRandom(v) * Math.min(48, v.trafficLeg.lineLength * 0.62);
  const initial = trafficLegPoint(v.trafficLeg, v.trafficProgress);
  v.x = initial.x;
  v.z = initial.z;
  v.yaw = initial.yaw;
  v.trafficStartX = v.x;
  v.trafficStartZ = v.z;
  v.y = driveSurfaceH(v.x, v.z) + 0.04;
  v.previousSurfaceY = v.y;
  trafficFleet.push(v);
}
