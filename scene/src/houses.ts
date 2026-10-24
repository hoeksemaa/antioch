// Three.js (browser): the five houses. Each builder gives its doorbell
// position, its delivery route, and its drop spot.

import * as THREE from "three";
import {
  M,
  bar,
  blob,
  box,
  doorUnit,
  doorbellDevice,
  gableRoof,
  mailbox,
  mat,
  path,
  planter,
  railing,
  stairs,
  tree,
  wall,
  windowUnit,
} from "./parts";
import { buildStreet, type StreetLamp } from "./street";

export interface HouseView {
  doorbell: THREE.Vector3; // center of the doorbell device
  target: THREE.Vector3; // the point the doorbell camera looks at
  eye: THREE.Vector3; // overview camera start position
  focus: THREE.Vector3; // overview orbit target
  route: THREE.Vector3[]; // delivery walk from the sidewalk; y is the floor height
  drop: THREE.Vector3; // where the package is set down (bottom center)
  lamp: THREE.Vector3; // porch lantern beside the door, on the wall
  streetLamps: StreetLamp[];
  lane: number; // z of the near street lane's center
  bins: [number, number, number][]; // wheelie bin spots: x, z, turn (rad)
  car: [number, number, number]; // parked car: x, z, heading (rad; 0 faces +z)
}

export interface House {
  id: string;
  name: string;
  build: (parent: THREE.Object3D) => HouseView;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// 1. A one-story house with a raised porch and front steps.
function raisedPorch(parent: THREE.Object3D): HouseView {
  const floor = 0.45;
  const wallTop = 3.85;
  box(parent, [12, wallTop, 9], [0, wallTop / 2, -4.5], wall(0xd8d2c4, "siding"));
  box(parent, [12.05, floor, 9.05], [0, floor / 2, -4.5], M.foundation);
  gableRoof(parent, 12, 9, 2.6, [0, wallTop, -4.5]);
  doorUnit(parent, 0, floor, 0x6b2d2d);
  for (const x of [-4.4, -1.8, 1.8, 4.4]) windowUnit(parent, x, floor + 1.5, 1.05, 1.25);

  box(parent, [5.2, floor, 2.6], [0, floor / 2, 1.3], M.deck);
  stairs(parent, { x: 0, z: 2.6, height: floor, dir: [0, 1], width: 1.8, risers: 3, tread: 0.32, material: M.deck });
  box(parent, [0.9, 0.015, 0.55], [0, floor + 0.0075, 0.45], M.rug);
  for (const x of [-2.45, 2.45]) box(parent, [0.15, 2.7, 0.15], [x, floor + 1.35, 2.45], M.trim);
  box(parent, [5.6, 0.15, 2.9], [0, floor + 2.775, 1.35], M.trim);
  railing(parent, [-2.45, 0.1], [-2.45, 2.45], floor);
  railing(parent, [2.45, 0.1], [2.45, 2.45], floor);
  railing(parent, [-2.45, 2.45], [-0.95, 2.45], floor);
  railing(parent, [0.95, 2.45], [2.45, 2.45], floor);
  for (const x of [-1.9, 1.9]) planter(parent, x, floor, 2.15);

  const sidewalk = 10;
  path(parent, [0, 3.84], [0, sidewalk - 0.6], 1.3);
  for (const x of [-4.8, -3.6, 3.6, 4.8]) blob(parent, 0.55, [x, 0.4, 0.6]);
  tree(parent, -7, 7);
  tree(parent, 8, 8.5);
  mailbox(parent, 1.6, 9.7);
  const street = buildStreet(parent, sidewalk, "suburb");

  // Right of the door (as seen from the street).
  const doorbell = v(0.72, floor + 1.22, 0.015);
  doorbellDevice(parent, doorbell);
  return {
    doorbell,
    target: v(0, 1.0, 10),
    eye: v(6, 5.5, 16),
    focus: v(0, 1.2, 3),
    route: [v(-12, 0, 10.8), v(0, 0, 10.8), v(0, 0, 3.4), v(0, floor, 2.6), v(0, floor, 2.2)],
    drop: v(0.25, floor, 1.65),
    lamp: v(-0.75, 0.45 + 1.95, 0.1),
    streetLamps: street.lamps,
    lane: street.lane,
    // At the curb, in front of the walk to the steps.
    bins: [[-2.0, 9.75, 0], [-2.75, 9.75, 0]],
    car: [-6, 13.65, Math.PI / 2],
  };
}

// One row house, 6 m wide, with a tall stoop on the right side of its front.
function rowHouse(parent: THREE.Object3D, cx: number, height: number, color: number, setback: number) {
  const floor = 1.7; // parlor floor, above the garden level
  const facade = wall(color, "brick", 0.9);
  const doorX = cx + 1.2;
  box(parent, [6, height, 14], [cx, height / 2, -7], facade);
  box(parent, [6.1, 0.45, 0.5], [cx, height - 0.25, 0.2], M.trim);
  box(parent, [6, 0.02, setback], [cx, 0.01, setback / 2], M.concrete);
  for (const x of [cx - 2.0, cx - 0.6]) {
    windowUnit(parent, x, 0.9, 0.9, 0.9);
    windowUnit(parent, x, floor + 1.4, 0.95, 2.0);
  }
  for (const y of [floor + 4.4, floor + 7.4]) {
    if (y + 1 > height - 0.5) continue;
    for (const x of [cx - 1.8, cx - 0.3, cx + 1.2]) windowUnit(parent, x, y, 0.95, 1.7);
  }
  doorUnit(parent, doorX, floor, 0x3a2418, 1.1, 2.5);

  // Stoop: a landing, then ten risers down to the front yard, with iron rails.
  const risers = 10;
  const tread = 0.28;
  const rise = floor / risers;
  box(parent, [2.4, floor, 1.4], [doorX, floor / 2, 0.7], facade);
  const run = stairs(parent, { x: doorX, z: 1.4, height: floor, dir: [0, 1], width: 2.4, risers, tread, material: facade });
  for (const side of [-1.15, 1.15]) {
    const x = doorX + side;
    railing(parent, [x, 0.05], [x, 1.4], floor, M.iron);
    bar(parent, [x, floor + 0.9, 1.4], [x, rise + 0.9, 1.4 + run], 0.05, M.iron);
    for (let i = 1; i < risers; i++) {
      box(parent, [0.025, 0.9, 0.025], [x, floor - i * rise + 0.45, 1.4 + (i - 0.5) * tread], M.iron);
    }
    box(parent, [0.07, rise + 1.0, 0.07], [x, (rise + 1.0) / 2, 1.4 + run], M.iron);
  }

  // Low iron fence at the sidewalk, open at the foot of the stoop.
  railing(parent, [cx - 3, setback - 0.1], [doorX - 1.2, setback - 0.1], 0, M.iron);
  railing(parent, [doorX + 1.2, setback - 0.1], [cx + 3, setback - 0.1], 0, M.iron);
}

// 2. A row of attached houses with tall stoops, close to the street.
function stoop(parent: THREE.Object3D): HouseView {
  const setback = 4.5;
  const row: [number, number, number][] = [
    [-12, 11.2, 0x8e4b3a],
    [-6, 12, 0xcbbfa8],
    [0, 11.5, 0x7a5444],
    [6, 10.8, 0x8a8580],
    [12, 11.8, 0x7a5444],
  ];
  for (const [x, height, color] of row) rowHouse(parent, x, height, color, setback);
  const street = buildStreet(parent, setback, "row");

  // On the left door trim (as seen from the street), at the top of the stoop:
  // about 2.9 m above the yard.
  const doorbell = v(0.62, 1.7 + 1.2, 0.055);
  doorbellDevice(parent, doorbell);
  return {
    doorbell,
    target: v(1.0, 0.6, 9),
    eye: v(8, 6.5, 17),
    focus: v(1, 2, 2),
    route: [v(-12, 0, 6.1), v(1.2, 0, 6.1), v(1.2, 0, 4.1), v(1.2, 1.7, 1.45), v(1.2, 1.7, 1.3)],
    drop: v(1.35, 1.7, 0.9),
    lamp: v(2.05, 1.7 + 2.1, 0.1),
    streetLamps: street.lamps,
    lane: street.lane,
    // In the front yard, beside the stoop.
    bins: [[-1.4, 3.6, 0], [-2.1, 3.6, 0]],
    car: [-4, 8.95, Math.PI / 2],
  };
}

// 3. A bungalow with a porch behind a solid knee wall. The steps are on the
// left end of the porch, so visitors arrive from the side.
function sideEntry(parent: THREE.Object3D): HouseView {
  const floor = 0.6;
  const wallTop = 3.4;
  const stone = wall(0x8f8a80, "stone", 0.95);
  box(parent, [11, wallTop, 10], [0, wallTop / 2, -5], wall(0x7d8f7a, "siding"));
  box(parent, [11.05, floor, 10.05], [0, floor / 2, -5], stone);
  gableRoof(parent, 11, 10, 3.0, [0, wallTop, -5], "z");
  doorUnit(parent, 0.9, floor, 0x8a5a2b);
  windowUnit(parent, -2.6, floor + 1.45, 1.6, 1.2);
  windowUnit(parent, 3.9, floor + 1.45, 1.2, 1.3);

  const left = -5.2;
  const right = 2.4;
  const depth = 3.0;
  const midX = (left + right) / 2;
  box(parent, [right - left, floor, depth], [midX, floor / 2, depth / 2], M.deck);

  // Knee walls, 0.75 m high, with an opening on the left end for the steps.
  const knee = 0.75;
  const t = 0.2;
  const wallY = floor + knee / 2;
  box(parent, [right - left, knee, t], [midX, wallY, depth - t / 2], stone);
  box(parent, [t, knee, depth - t], [right - t / 2, wallY, (depth - t) / 2], stone);
  box(parent, [t, knee, 0.8], [left + t / 2, wallY, 0.4], stone);
  box(parent, [t, knee, 0.6], [left + t / 2, wallY, 2.5], stone);

  // Tapered square columns on the knee wall, and the porch roof.
  for (const x of [left + 0.15, -1.4, right - 0.15]) {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 1.85, 4), M.trim);
    column.rotation.y = Math.PI / 4;
    column.position.set(x, floor + knee + 0.925, depth - t / 2);
    parent.add(column);
  }
  box(parent, [right - left + 0.6, 0.15, depth + 0.4], [midX, 3.275, depth / 2 + 0.05], M.trim);

  stairs(parent, { x: left, z: 1.5, height: floor, dir: [-1, 0], width: 1.4, risers: 4, tread: 0.3, material: stone });
  const sidewalk = 9;
  path(parent, [-6.7, 1.4], [-6.7, sidewalk - 0.6], 1.2);
  for (const x of [-4.2, -2.8, -0.2, 1.4]) blob(parent, 0.45, [x, 0.35, depth + 0.45]);
  tree(parent, 5, 6.5);
  const street = buildStreet(parent, sidewalk, "suburb");

  // Left of the door (as seen from the street), turned toward the side steps.
  const doorbell = v(0.18, floor + 1.4, 0.015);
  doorbellDevice(parent, doorbell);
  return {
    doorbell,
    target: v(-4.5, 0.9, 7.5),
    eye: v(-10, 5.5, 14),
    focus: v(-2, 1.2, 2.5),
    route: [v(-15, 0, 9.8), v(-6.7, 0, 9.8), v(-6.7, 0, 1.5), v(-6.25, 0, 1.5), v(left, floor, 1.5), v(-1.6, floor, 1.5)],
    drop: v(-1.0, floor, 1.5),
    lamp: v(1.7, 0.6 + 1.95, 0.1),
    streetLamps: street.lamps,
    lane: street.lane,
    // Beside the side walk, between it and the doorbell.
    bins: [[-5.7, 5.5, -Math.PI / 2], [-5.7, 6.2, -Math.PI / 2]],
    car: [-9, 12.65, Math.PI / 2],
  };
}

// 4. A modern house with no porch: the door is at ground level, under a small
// canopy. Visitors come up the driveway and along a side walk.
function noPorch(parent: THREE.Object3D): HouseView {
  const floor = 0.15;
  const height = 3.0;
  const siding = wall(0x4a4f55, "siding", 0.8);
  box(parent, [9, height, 9], [-1.5, height / 2, -4.5], siding);
  box(parent, [6, height, 7], [6, height / 2, -3.5], siding);
  box(parent, [9.8, 0.25, 9.8], [-1.5, height + 0.125, -4.4], M.roof);
  box(parent, [6.6, 0.25, 7.8], [6, height + 0.125, -3.4], M.roof);

  // Garage door with panel lines.
  box(parent, [4.8, 2.3, 0.05], [6, 1.15, 0.025], mat(0xd9d6cf, 0.6));
  for (const y of [0.6, 1.15, 1.7]) box(parent, [4.8, 0.03, 0.02], [6, y, 0.06], M.foundation);

  // Wood panel beside the door, then the door, windows, pad, and canopy.
  box(parent, [1.4, height, 0.03], [-2.4, height / 2, 0.015], mat(0x9a6b43, 0.7));
  doorUnit(parent, -1.0, floor, 0x2b2522, 1.0, 2.4);
  windowUnit(parent, -4.4, 1.6, 2.4, 1.8);
  windowUnit(parent, 1.4, 1.6, 1.6, 1.8);
  box(parent, [1.8, floor, 1.2], [-1.0, floor / 2, 0.6], M.concrete);
  box(parent, [2.2, 0.12, 1.3], [-1.0, floor + 2.75, 0.65], M.roof);

  const sidewalk = 8;
  box(parent, [5, 0.02, sidewalk], [6, 0.01, sidewalk / 2], M.concrete);
  path(parent, [-1.4, 1.7], [3.4, 1.7], 1.0);
  for (const x of [-5.5, -5.0, -4.5, -4.0, -3.5]) blob(parent, 0.3, [x, 0.25, 0.5]);
  tree(parent, -7, 5.5);
  const street = buildStreet(parent, sidewalk, "suburb");

  // Right of the door (as seen from the street), lower than the others, turned
  // toward the driveway.
  const doorbell = v(-0.2, floor + 1.3, 0.015);
  doorbellDevice(parent, doorbell);
  return {
    doorbell,
    target: v(2.5, -1.0, 8),
    eye: v(9, 6, 15),
    focus: v(1, 1, 2),
    route: [v(18, 0, 8.8), v(6, 0, 8.8), v(6, 0, 1.7), v(-0.1, 0, 1.7)],
    drop: v(-0.6, 0.02, 1.7),
    lamp: v(-1.95, 0.15 + 2.0, 0.1),
    streetLamps: street.lamps,
    lane: street.lane,
    // Beside the driveway; the car is in the driveway and hides the approach.
    bins: [[3.0, 3.0, Math.PI / 2], [3.0, 3.7, Math.PI / 2]],
    car: [4.4, 5.2, 0],
  };
}

// 5. A two-story house set far back, with a small portico on two columns, a
// picket fence with a gate, and a walk that bends.
function portico(parent: THREE.Object3D): HouseView {
  const floor = 0.35;
  const wallTop = 6.2;
  const brick = wall(0x8e4b3a, "brick", 0.9);
  box(parent, [10, wallTop, 9], [0, wallTop / 2, -4.5], wall(0xe8dfb8, "siding"));
  box(parent, [10.05, floor, 9.05], [0, floor / 2, -4.5], brick);
  gableRoof(parent, 10, 9, 2.4, [0, wallTop, -4.5]);
  doorUnit(parent, 0, floor, 0x1f3a5f);
  for (const x of [-3, 3]) windowUnit(parent, x, floor + 1.5, 1.1, 1.4);
  for (const x of [-3, 0, 3]) windowUnit(parent, x, 4.6, 1.1, 1.3);

  // Brick landing with one step, and a small gable roof on two round columns.
  box(parent, [3.2, floor, 1.6], [0, floor / 2, 0.8], brick);
  stairs(parent, { x: 0, z: 1.6, height: floor, dir: [0, 1], width: 2.4, risers: 2, tread: 0.35, material: brick });
  for (const x of [-1.4, 1.4]) {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 2.55, 16), M.trim);
    column.position.set(x, floor + 1.275, 1.45);
    parent.add(column);
  }
  box(parent, [3.4, 0.15, 1.8], [0, floor + 2.625, 0.85], M.trim);
  gableRoof(parent, 3.1, 1.5, 0.8, [0, floor + 2.7, 0.85], "z");

  // The walk goes straight out, then bends to a gate in the fence.
  const sidewalk = 14;
  const gateX = 3.5;
  path(parent, [0, 2.0], [0, 5.7], 1.2);
  path(parent, [0, 6], [gateX, sidewalk - 0.6], 1.2);
  railing(parent, [-20, sidewalk - 0.3], [gateX - 0.7, sidewalk - 0.3], 0);
  railing(parent, [gateX + 0.7, sidewalk - 0.3], [20, sidewalk - 0.3], 0);

  // Clipped hedges along the front, and two trees.
  for (const x of [-3.6, 3.6]) box(parent, [3.2, 0.9, 0.9], [x, 0.45, 0.8], M.leaf);
  tree(parent, -6, 8);
  tree(parent, 7.5, 6);
  const street = buildStreet(parent, sidewalk, "suburb");

  // Left of the door (as seen from the street), mounted a bit higher.
  const doorbell = v(-0.75, floor + 1.35, 0.015);
  doorbellDevice(parent, doorbell);
  return {
    doorbell,
    target: v(gateX, -0.5, sidewalk),
    eye: v(9, 7.5, 21),
    focus: v(0.5, 1.5, 5),
    route: [v(15, 0, 14.8), v(gateX, 0, 14.8), v(gateX, 0, 13.4), v(0, 0, 6), v(0, 0, 2.05), v(0, floor, 1.6)],
    drop: v(0.45, floor, 1.15),
    lamp: v(0.85, 0.35 + 1.95, 0.1),
    streetLamps: street.lamps,
    lane: street.lane,
    // Inside the fence, near the gate.
    bins: [[5.0, 13.1, 0], [5.7, 13.1, 0]],
    car: [6, 17.65, -Math.PI / 2],
  };
}

export const HOUSES: House[] = [
  { id: "porch", name: "Raised porch", build: raisedPorch },
  { id: "stoop", name: "Stoop", build: stoop },
  { id: "side", name: "Side-entry porch", build: sideEntry },
  { id: "flush", name: "No porch", build: noPorch },
  { id: "portico", name: "Portico", build: portico },
];
