import * as THREE from "three";

// Units are meters. +y is up. The front wall of each house is the plane
// z = 0, and the street is in the +z direction. Seen from the street, +x is
// to the right; seen from the doorbell camera, +x is on the left.

export type Vec3 = [number, number, number];

export const mat = (color: number, roughness = 0.85, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

// Shared materials. Each house makes its own wall colors with mat().
export const M = {
  lawn: mat(0x5e8a3a, 1),
  foundation: mat(0x8c8478),
  trim: mat(0xf2f0ea, 0.6),
  roof: mat(0x55565c),
  brass: mat(0xc9a23a, 0.3, 0.8),
  glass: mat(0x2f3e4f, 0.15, 0.3),
  deck: mat(0x8a6a4a, 0.8),
  rug: mat(0x4a3b2a, 1),
  pot: mat(0xb5653d, 0.9),
  leaf: new THREE.MeshStandardMaterial({ color: 0x3d6b2f, roughness: 1, flatShading: true }),
  bark: mat(0x5a4330, 1),
  concrete: mat(0xb8b4ac, 0.95),
  asphalt: mat(0x3b3d40, 0.95),
  paint: mat(0xd9b83a, 0.7),
  device: mat(0x1c1c1e, 0.4),
  iron: mat(0x1e1f22, 0.5, 0.6),
};

export function box(parent: THREE.Object3D, size: Vec3, pos: Vec3, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...pos);
  parent.add(mesh);
  return mesh;
}

export function blob(parent: THREE.Object3D, radius: number, pos: Vec3, material = M.leaf) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), material);
  mesh.position.set(...pos);
  parent.add(mesh);
  return mesh;
}

// A gable roof centered on its footprint. The ridge runs along x or z.
export function gableRoof(
  parent: THREE.Object3D,
  width: number,
  depth: number,
  height: number,
  pos: Vec3,
  ridge: "x" | "z" = "x",
) {
  const overhang = 0.3;
  const span = ridge === "x" ? depth : width;
  const length = (ridge === "x" ? width : depth) + 2 * overhang;
  const shape = new THREE.Shape([
    new THREE.Vector2(-span / 2 - overhang, 0),
    new THREE.Vector2(span / 2 + overhang, 0),
    new THREE.Vector2(0, height),
  ]);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  geometry.translate(0, 0, -length / 2);
  if (ridge === "x") geometry.rotateY(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, M.roof);
  mesh.position.set(...pos);
  parent.add(mesh);
}

// A plain detached house with a gable roof, for neighbors.
export function simpleHouse(
  parent: THREE.Object3D,
  width: number,
  height: number,
  depth: number,
  x: number,
  z: number,
  color: number,
) {
  box(parent, [width, height, depth], [x, height / 2, z], mat(color));
  gableRoof(parent, width, depth, 2.4, [x, height, z]);
}

// A level railing between two points (x, z) on a floor at height floorY.
export function railing(
  parent: THREE.Object3D,
  from: [number, number],
  to: [number, number],
  floorY: number,
  material = M.trim,
) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  const group = new THREE.Group();
  group.position.set((from[0] + to[0]) / 2, floorY, (from[1] + to[1]) / 2);
  group.rotation.y = Math.atan2(dx, dz);
  box(group, [0.07, 0.05, length], [0, 0.9, 0], material);
  box(group, [0.05, 0.04, length], [0, 0.1, 0], material);
  const count = Math.floor(length / 0.14);
  for (let i = 1; i < count; i++) {
    box(group, [0.035, 0.8, 0.035], [0, 0.5, -length / 2 + (i * length) / count], material);
  }
  parent.add(group);
}

// A flat walk between two points (x, z) on the ground.
export function path(parent: THREE.Object3D, from: [number, number], to: [number, number], width: number) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const mesh = box(parent, [width, 0.02, Math.hypot(dx, dz) + width], [(from[0] + to[0]) / 2, 0.01, (from[1] + to[1]) / 2], M.concrete);
  mesh.rotation.y = Math.atan2(dx, dz);
}

// A straight bar between two 3D points, for sloped stair rails.
export function bar(parent: THREE.Object3D, a: Vec3, b: Vec3, size: number, material: THREE.Material) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, start.distanceTo(end)), material);
  mesh.position.addVectors(start, end).multiplyScalar(0.5);
  mesh.lookAt(end);
  parent.add(mesh);
}

// Solid steps from a landing at (x, z, height) down to the ground, in the
// direction dir ([0, 1] is toward the street). Returns the run length.
export function stairs(
  parent: THREE.Object3D,
  o: {
    x: number;
    z: number;
    height: number;
    dir: [number, number];
    width: number;
    risers: number;
    tread: number;
    material: THREE.Material;
  },
) {
  const rise = o.height / o.risers;
  for (let i = 1; i < o.risers; i++) {
    const h = o.height - i * rise;
    const along = (i - 0.5) * o.tread;
    const size: Vec3 = o.dir[0] !== 0 ? [o.tread, h, o.width] : [o.width, h, o.tread];
    box(parent, size, [o.x + o.dir[0] * along, h / 2, o.z + o.dir[1] * along], o.material);
  }
  return o.tread * (o.risers - 1);
}

export function doorUnit(parent: THREE.Object3D, x: number, floorY: number, color: number, width = 0.95, height = 2.1) {
  box(parent, [width + 0.2, height + 0.15, 0.04], [x, floorY + (height + 0.15) / 2, 0.02], M.trim);
  box(parent, [width, height, 0.06], [x, floorY + height / 2, 0.03], mat(color, 0.5));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), M.brass);
  knob.position.set(x + width * 0.38, floorY + 1.0, 0.08);
  parent.add(knob);
}

export function windowUnit(parent: THREE.Object3D, x: number, y: number, width: number, height: number) {
  box(parent, [width + 0.2, height + 0.2, 0.04], [x, y, 0.02], M.trim);
  box(parent, [width, height, 0.05], [x, y, 0.03], M.glass);
}

export function doorbellDevice(parent: THREE.Object3D, pos: THREE.Vector3) {
  box(parent, [0.065, 0.135, 0.03], pos.toArray(), M.device);
}

export function planter(parent: THREE.Object3D, x: number, floorY: number, z: number) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.4, 20), M.pot);
  pot.position.set(x, floorY + 0.2, z);
  parent.add(pot);
  blob(parent, 0.28, [x, floorY + 0.55, z]);
}

export function tree(parent: THREE.Object3D, x: number, z: number) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 2.4, 10), M.bark);
  trunk.position.set(x, 1.2, z);
  parent.add(trunk);
  blob(parent, 1.8, [x, 3.6, z]);
  blob(parent, 1.2, [x + 0.9, 3.1, z + 0.4]);
}

export function mailbox(parent: THREE.Object3D, x: number, z: number) {
  box(parent, [0.1, 1.05, 0.1], [x, 0.525, z], M.bark);
  box(parent, [0.22, 0.25, 0.5], [x, 1.15, z], M.device);
}
