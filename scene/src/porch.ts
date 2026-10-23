import * as THREE from "three";

// Units are meters. +y is up. The front wall of the house is the plane z = 0,
// and the street is in the +z direction.
const PORCH_TOP = 0.45;
const WALL_TOP = 3.85;

// The doorbell sits right of the door, about 1.2 m above the porch floor.
const DOORBELL = new THREE.Vector3(0.72, PORCH_TOP + 1.22, 0.015);
const DOORBELL_TARGET = new THREE.Vector3(0, 1.0, 10);

const mat = (color: number, roughness = 0.85, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

const M = {
  lawn: mat(0x5e8a3a, 1),
  siding: mat(0xd8d2c4),
  foundation: mat(0x8c8478),
  trim: mat(0xf2f0ea, 0.6),
  roof: mat(0x55565c),
  door: mat(0x6b2d2d, 0.5),
  brass: mat(0xc9a23a, 0.3, 0.8),
  glass: mat(0x2f3e4f, 0.15, 0.3),
  deck: mat(0x8a6a4a, 0.8),
  mat: mat(0x4a3b2a, 1),
  pot: mat(0xb5653d, 0.9),
  leaf: new THREE.MeshStandardMaterial({ color: 0x3d6b2f, roughness: 1, flatShading: true }),
  bark: mat(0x5a4330, 1),
  concrete: mat(0xb8b4ac, 0.95),
  asphalt: mat(0x3b3d40, 0.95),
  paint: mat(0xd9b83a, 0.7),
  device: mat(0x1c1c1e, 0.4),
};

type Vec3 = [number, number, number];

function box(parent: THREE.Object3D, size: Vec3, pos: Vec3, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...pos);
  parent.add(mesh);
  return mesh;
}

function blob(parent: THREE.Object3D, radius: number, pos: Vec3, material = M.leaf) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), material);
  mesh.position.set(...pos);
  parent.add(mesh);
  return mesh;
}

// A gable roof with the ridge along x, centered on its footprint.
function gableRoof(parent: THREE.Object3D, width: number, depth: number, height: number, pos: Vec3) {
  const overhang = 0.3;
  const shape = new THREE.Shape([
    new THREE.Vector2(-depth / 2 - overhang, 0),
    new THREE.Vector2(depth / 2 + overhang, 0),
    new THREE.Vector2(0, height),
  ]);
  const length = width + 2 * overhang;
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  geometry.translate(0, 0, -length / 2);
  geometry.rotateY(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, M.roof);
  mesh.position.set(...pos);
  parent.add(mesh);
}

function house(parent: THREE.Object3D, width: number, height: number, depth: number, x: number, z: number, color: number) {
  box(parent, [width, height, depth], [x, height / 2, z], mat(color));
  gableRoof(parent, width, depth, 2.4, [x, height, z]);
}

// A porch railing between two points on the porch floor (x, z).
function railing(parent: THREE.Object3D, from: [number, number], to: [number, number]) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  const group = new THREE.Group();
  group.position.set((from[0] + to[0]) / 2, PORCH_TOP, (from[1] + to[1]) / 2);
  group.rotation.y = Math.atan2(dx, dz);
  box(group, [0.07, 0.05, length], [0, 0.9, 0], M.trim);
  box(group, [0.05, 0.04, length], [0, 0.1, 0], M.trim);
  const count = Math.floor(length / 0.14);
  for (let i = 1; i < count; i++) {
    box(group, [0.035, 0.8, 0.035], [0, 0.5, -length / 2 + (i * length) / count], M.trim);
  }
  parent.add(group);
}

function buildHouse(parent: THREE.Object3D) {
  box(parent, [12, WALL_TOP, 9], [0, WALL_TOP / 2, -4.5], M.siding);
  box(parent, [12.05, PORCH_TOP, 9.05], [0, PORCH_TOP / 2, -4.5], M.foundation);
  gableRoof(parent, 12, 9, 2.6, [0, WALL_TOP, -4.5]);

  // Door with trim and knob.
  box(parent, [1.15, 2.25, 0.04], [0, PORCH_TOP + 1.125, 0.02], M.trim);
  box(parent, [0.95, 2.1, 0.06], [0, PORCH_TOP + 1.05, 0.03], M.door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), M.brass);
  knob.position.set(0.36, PORCH_TOP + 1.0, 0.08);
  parent.add(knob);

  // Windows with trim.
  for (const x of [-4.4, -1.8, 1.8, 4.4]) {
    box(parent, [1.25, 1.45, 0.04], [x, PORCH_TOP + 1.5, 0.02], M.trim);
    box(parent, [1.05, 1.25, 0.05], [x, PORCH_TOP + 1.5, 0.03], M.glass);
  }

  // The doorbell device. The camera sits on its front face.
  box(parent, [0.065, 0.135, 0.03], DOORBELL.toArray(), M.device);
}

function buildPorch(parent: THREE.Object3D) {
  box(parent, [5.2, PORCH_TOP, 2.6], [0, PORCH_TOP / 2, 1.3], M.deck);
  box(parent, [1.8, 0.3, 0.32], [0, 0.15, 2.76], M.deck);
  box(parent, [1.8, 0.15, 0.32], [0, 0.075, 3.08], M.deck);
  box(parent, [0.9, 0.015, 0.55], [0, PORCH_TOP + 0.0075, 0.45], M.mat);

  // Posts and porch roof.
  for (const x of [-2.45, 2.45]) {
    box(parent, [0.15, 2.7, 0.15], [x, PORCH_TOP + 1.35, 2.45], M.trim);
  }
  box(parent, [5.6, 0.15, 2.9], [0, PORCH_TOP + 2.775, 1.35], M.trim);

  railing(parent, [-2.45, 0.1], [-2.45, 2.45]);
  railing(parent, [2.45, 0.1], [2.45, 2.45]);
  railing(parent, [-2.45, 2.45], [-0.95, 2.45]);
  railing(parent, [0.95, 2.45], [2.45, 2.45]);

  // Planters on either side of the steps.
  for (const x of [-1.9, 1.9]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.4, 20), M.pot);
    pot.position.set(x, PORCH_TOP + 0.2, 2.15);
    parent.add(pot);
    blob(parent, 0.28, [x, PORCH_TOP + 0.55, 2.15]);
  }
}

function buildYard(parent: THREE.Object3D) {
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(120, 90), M.lawn);
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, 0, 5);
  parent.add(lawn);

  // Front walk, sidewalk, curb, and street.
  box(parent, [1.3, 0.02, 6.76], [0, 0.01, 6.62], M.concrete);
  box(parent, [120, 0.03, 1.6], [0, 0.015, 10.8], M.concrete);
  box(parent, [120, 0.15, 0.15], [0, 0.075, 12.45], M.concrete);
  box(parent, [120, 0.01, 8], [0, 0.005, 16.6], M.asphalt);
  for (let x = -58; x < 60; x += 4) {
    box(parent, [2, 0.012, 0.12], [x, 0.006, 16.6], M.paint);
  }
  box(parent, [120, 0.15, 0.15], [0, 0.075, 20.75], M.concrete);
  box(parent, [120, 0.03, 1.6], [0, 0.015, 22.4], M.concrete);

  // Bushes along the house front.
  for (const x of [-4.8, -3.6, 3.6, 4.8]) {
    blob(parent, 0.55, [x, 0.4, 0.6]);
  }

  // Trees.
  for (const [x, z] of [[-7, 7], [8, 8.5]]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 2.4, 10), M.bark);
    trunk.position.set(x, 1.2, z);
    parent.add(trunk);
    blob(parent, 1.8, [x, 3.6, z]);
    blob(parent, 1.2, [x + 0.9, 3.1, z + 0.4]);
  }

  // Mailbox by the sidewalk.
  box(parent, [0.1, 1.05, 0.1], [1.6, 0.525, 9.7], M.bark);
  box(parent, [0.22, 0.25, 0.5], [1.6, 1.15, 9.7], M.device);

  // Neighbors on this side and across the street.
  house(parent, 10, 4.2, 9, -19, -4.5, 0xc9cfd6);
  house(parent, 10, 4.2, 9, 19, -4.5, 0xd6c9b8);
  house(parent, 9, 4.6, 8, -14, 29, 0xb8c4b0);
  house(parent, 9, 4.6, 8, 0, 29, 0xe0d7c3);
  house(parent, 9, 4.6, 8, 14, 29, 0xc4b3a6);
}

function addLights(scene: THREE.Scene) {
  scene.background = new THREE.Color(0xa9c9e8);
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x7a7466, 1.4));

  const sun = new THREE.DirectionalLight(0xfff4e0, 2.8);
  sun.position.set(-12, 18, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 70 });
  scene.add(sun);
}

export function buildScene(scene: THREE.Scene) {
  buildHouse(scene);
  buildPorch(scene);
  buildYard(scene);
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  addLights(scene);
}

// A wide 16:9 camera on the front face of the doorbell. Real doorbells use a
// fisheye lens; this is a plain perspective camera for now.
export function doorbellCamera() {
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 120);
  camera.position.set(DOORBELL.x, DOORBELL.y, DOORBELL.z + 0.02);
  camera.lookAt(DOORBELL_TARGET);
  camera.updateMatrixWorld();
  return camera;
}
