"use strict";
// =============================================================================
// src/vehicles.js
// Vehicle asset loading, toy models, vehicle() factory, player car, semi + trailer, traffic loop.
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
const TRAFFIC_CORNER_RADIUS = 4.2;
function createTrafficCircuit(id, minX, maxX, minZ, maxZ) {
  const radius = Math.min(TRAFFIC_CORNER_RADIUS, (maxX - minX) * 0.16, (maxZ - minZ) * 0.16);
  const arcLength = (Math.PI * radius) / 2;
  const segments = [
    { kind: "line", x: minX + radius, z: minZ, yaw: Math.PI / 2, length: maxX - minX - 2 * radius },
    { kind: "arc", cx: maxX - radius, cz: minZ + radius, startAngle: -Math.PI / 2, length: arcLength },
    { kind: "line", x: maxX, z: minZ + radius, yaw: 0, length: maxZ - minZ - 2 * radius },
    { kind: "arc", cx: maxX - radius, cz: maxZ - radius, startAngle: 0, length: arcLength },
    { kind: "line", x: maxX - radius, z: maxZ, yaw: -Math.PI / 2, length: maxX - minX - 2 * radius },
    { kind: "arc", cx: minX + radius, cz: maxZ - radius, startAngle: Math.PI / 2, length: arcLength },
    { kind: "line", x: minX, z: maxZ - radius, yaw: Math.PI, length: maxZ - minZ - 2 * radius },
    { kind: "arc", cx: minX + radius, cz: minZ + radius, startAngle: Math.PI, length: arcLength },
  ];
  return {
    id,
    minX,
    maxX,
    minZ,
    maxZ,
    radius,
    segments,
    length: segments.reduce((sum, segment) => sum + segment.length, 0),
  };
}
const trafficRoutes = [
  createTrafficCircuit("northwest", -275, -55, -275, -55),
  createTrafficCircuit("northeast", 55, 275, -275, -55),
  createTrafficCircuit("southwest", -275, -55, 55, 275),
  createTrafficCircuit("southeast", 55, 275, 55, 275),
];

function trafficRoutePoint(route, distance, direction = 1) {
  const dir = direction < 0 ? -1 : 1;
  let remaining = ((distance % route.length) + route.length) % route.length;
  if (dir < 0) remaining = (route.length - remaining) % route.length;
  let point = null;
  for (const segment of route.segments) {
    if (remaining > segment.length) {
      remaining -= segment.length;
      continue;
    }
    if (segment.kind === "line") {
      point = {
        x: segment.x + Math.sin(segment.yaw) * remaining,
        z: segment.z + Math.cos(segment.yaw) * remaining,
        yaw: segment.yaw,
      };
    } else {
      const angle = segment.startAngle + remaining / route.radius;
      point = {
        x: segment.cx + Math.cos(angle) * route.radius,
        z: segment.cz + Math.sin(angle) * route.radius,
        yaw: Math.atan2(-Math.sin(angle), Math.cos(angle)),
      };
    }
    break;
  }
  if (!point) point = { x: route.minX + route.radius, z: route.minZ, yaw: Math.PI / 2 };
  if (dir < 0) point.yaw = Math.atan2(Math.sin(point.yaw + Math.PI), Math.cos(point.yaw + Math.PI));
  return point;
}

function trafficLanePoint(route, distance, direction, laneOffset) {
  const point = trafficRoutePoint(route, distance, direction);
  const rightX = Math.cos(point.yaw);
  const rightZ = -Math.sin(point.yaw);
  return {
    x: point.x + rightX * laneOffset,
    z: point.z + rightZ * laneOffset,
    yaw: point.yaw,
  };
}

const trafficFleet = [];
for (let routeIndex = 0; routeIndex < trafficRoutes.length; routeIndex++) {
  const route = trafficRoutes[routeIndex];
  for (let slot = 0; slot < 3; slot++) {
    const direction = slot === 1 ? -1 : 1;
    const routeS = (route.length * slot) / 3 + 7;
    const lane = -1.8;
    const p = trafficLanePoint(route, routeS, direction, lane);
    const fleetIndex = routeIndex * 3 + slot;
    const v = vehicle(
      "traffic-" + route.id + "-" + slot,
      ["trafficA", "trafficB", "trafficC"][fleetIndex % 3],
      ["Town Car", "Green Car", "Orange Car"][fleetIndex % 3],
      p.x,
      p.z,
      p.yaw,
      {
        width: 1.8,
        length: 4.2,
        mass: 1000,
        accel: 0,
        maxSpeed: 10.5 + (fleetIndex % 4) * 0.75,
        steerRate: 0,
        ai: true,
        route: "district",
        routeDir: direction,
        routeIndex,
        routeS,
        routeLane: lane,
      },
    );
    trafficFleet.push(v);
  }
}
