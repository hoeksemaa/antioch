// Three.js (browser): the delivery person and package, and the ground truth
// that the Python benchmark reads (phase, person box, distance).

import * as THREE from "three";
import { mat } from "./parts";

const SPEED = 1.4; // walking speed, m/s
const STRIDE = 1.4; // distance for one full gait cycle, m
const PAUSE = 0.5; // turn to face the drop spot, s
const PLACE = 1.6; // crouch, set the package down, stand up, s
const TURN = 0.8; // turn around to walk back, s
const GONE = 2.0; // time out of the scene before the loop starts again, s

const HIP = 0.935; // hip height when standing, m

// One package for every scene for now: 45 × 30 × 35 cm.
const BOX = new THREE.Vector3(0.45, 0.3, 0.35);
// Package center while carried, in the person's frame (+z is forward).
const CARRY = new THREE.Vector3(0, 1.12, 0.36);

const M = {
  skin: mat(0xc68e6a, 0.7),
  shirt: mat(0x4f6d7a, 0.9),
  pants: mat(0x2e3440, 0.9),
  cap: mat(0x2b2f36, 0.8),
  shoes: mat(0x1b1b1b, 0.7),
  cardboard: mat(0xb8875a, 0.95),
  tape: mat(0xd9c39a, 0.6),
};

function joint(parent: THREE.Object3D, x: number, y: number, z: number) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  parent.add(group);
  return group;
}

// A capsule that hangs down from its parent joint.
function limb(parent: THREE.Object3D, length: number, radius: number, material: THREE.Material) {
  const geometry = new THREE.CapsuleGeometry(radius, length - 2 * radius, 4, 12);
  geometry.translate(0, -length / 2, 0);
  parent.add(new THREE.Mesh(geometry, material));
}

interface Rig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  shoulders: THREE.Group[]; // [left, right]
  elbows: THREE.Group[];
  thighs: THREE.Group[];
  knees: THREE.Group[];
}

// A simple jointed person, about 1.78 m tall, facing +z, feet at y = 0.
function buildPerson(): Rig {
  const root = new THREE.Group();
  const hips = joint(root, 0, HIP, 0);
  const torso = joint(hips, 0, 0, 0);

  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 4, 12), M.shirt);
  chest.position.y = 0.33;
  chest.scale.z = 0.7;
  torso.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 14), M.skin);
  head.position.y = 0.74;
  torso.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.06, 20), M.cap);
  cap.position.y = 0.81;
  torso.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.015, 0.1), M.cap);
  brim.position.set(0, 0.785, 0.1);
  torso.add(brim);

  const rig: Rig = { root, hips, torso, shoulders: [], elbows: [], thighs: [], knees: [] };
  for (const side of [1, -1]) {
    const shoulder = joint(torso, 0.22 * side, 0.57, 0);
    limb(shoulder, 0.3, 0.05, M.shirt);
    const elbow = joint(shoulder, 0, -0.3, 0);
    limb(elbow, 0.27, 0.045, M.skin);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), M.skin);
    hand.position.y = -0.29;
    elbow.add(hand);

    const thigh = joint(hips, 0.095 * side, 0, 0);
    limb(thigh, 0.45, 0.075, M.pants);
    const knee = joint(thigh, 0, -0.45, 0);
    limb(knee, 0.44, 0.06, M.pants);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.26), M.shoes);
    foot.position.set(0, -0.45, 0.06);
    knee.add(foot);

    rig.shoulders.push(shoulder);
    rig.elbows.push(elbow);
    rig.thighs.push(thigh);
    rig.knees.push(knee);
  }
  return rig;
}

function buildPackage() {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(BOX.x, BOX.y, BOX.z), M.cardboard));
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.004, BOX.z + 0.002), M.tape);
  tape.position.y = BOX.y / 2;
  group.add(tape);
  return group;
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => u * u * (3 - 2 * u);

// Turns from angle a to angle b the short way.
function lerpAngle(a: number, b: number, u: number) {
  const full = 2 * Math.PI;
  const d = ((((b - a + Math.PI) % full) + full) % full) - Math.PI;
  return a + d * u;
}

// Joint angles. Rotation about +x moves a hanging limb backward, so a
// negative angle swings it forward.
function pose(rig: Rig, o: { phase: number; walk: number; carry: number; reach: number; crouch: number }) {
  const swing = Math.sin(o.phase);
  const crouch = 0.84 * o.crouch; // thigh angle at the lowest point: hips 0.3 m lower
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1; // left leg leads at phase 0
    rig.thighs[i].rotation.x = -0.45 * o.walk * swing * side - crouch;
    rig.knees[i].rotation.x = 0.8 * o.walk * Math.max(0, Math.cos(o.phase) * side) + 2 * crouch;

    const walkArm = 0.35 * o.walk * swing * side;
    const shoulder = lerp(lerp(walkArm, -0.3, o.carry), -0.9, o.reach);
    const elbow = lerp(lerp(-0.25, -1.1, o.carry), -0.3, o.reach);
    rig.shoulders[i].rotation.x = shoulder;
    rig.elbows[i].rotation.x = elbow;
  }
  const bob = 0.02 * o.walk * Math.abs(swing);
  rig.hips.position.y = HIP - 0.9 * (1 - Math.cos(crouch)) + bob;
  rig.torso.rotation.x = 0.55 * o.crouch;
}

// A polyline the person walks along. Each point's y is the floor height
// under the feet there.
class Route {
  private readonly lengths = [0];

  constructor(readonly points: THREE.Vector3[]) {
    for (let i = 1; i < points.length; i++) {
      this.lengths.push(this.lengths[i - 1] + points[i].distanceTo(points[i - 1]));
    }
  }

  get length() {
    return this.lengths[this.lengths.length - 1];
  }

  position(s: number) {
    const d = Math.min(Math.max(s, 0), this.length);
    let i = 1;
    while (i < this.points.length - 1 && this.lengths[i] < d) i++;
    const u = (d - this.lengths[i - 1]) / (this.lengths[i] - this.lengths[i - 1]);
    return this.points[i - 1].clone().lerp(this.points[i], u);
  }

  // Facing direction at s. Looking a little ahead and behind rounds the corners.
  heading(s: number) {
    const a = this.position(s - 0.35);
    const b = this.position(s + 0.35);
    return Math.atan2(b.x - a.x, b.z - a.z);
  }
}

export type Phase = "approach" | "drop" | "leave" | "gone";

// A person carries the package along the route, sets it down at drop, turns
// around, and walks back. The scene is a pure function of time, so a frame
// at time t is the same on every run.
export class Delivery {
  phase: Phase = "approach";
  readonly root = new THREE.Group();
  private readonly rig = buildPerson();
  private readonly box = buildPackage();
  private readonly route: Route;
  private readonly end: THREE.Vector3;
  private readonly arrive: number; // heading at the end of the route
  private readonly place: number; // heading toward the drop spot
  private readonly dropCenter: THREE.Vector3;
  private readonly times: number[]; // end of each step: approach, pause, place, turn, leave, gone
  private readonly speed: number; // m/s

  // jitter gives values in [-1, 1) (all 0 for seed 0). They move the start
  // point up to 2 m along the first leg and change the speed by up to 10%.
  constructor(points: THREE.Vector3[], drop: THREE.Vector3, jitter: () => number) {
    const [first, second] = points;
    const start = first.clone().addScaledVector(second.clone().sub(first).normalize(), 2 * jitter());
    points = [start, ...points.slice(1)];
    this.speed = SPEED * (1 + 0.1 * jitter());
    this.route = new Route(points);
    this.end = points[points.length - 1];
    this.arrive = this.route.heading(this.route.length);
    this.place = Math.atan2(drop.x - this.end.x, drop.z - this.end.z);
    this.dropCenter = drop.clone().setY(drop.y + BOX.y / 2);
    this.root.add(this.rig.root, this.box);
    const walkTime = this.route.length / this.speed;
    let end = 0;
    this.times = [walkTime, PAUSE, PLACE, TURN, walkTime, GONE].map((step) => (end += step));
  }

  // Length of one loop, s.
  get loop() {
    return this.times[this.times.length - 1];
  }

  update(time: number) {
    const [t1, t2, t3, t4, t5, loop] = this.times;
    const t = ((time % loop) + loop) % loop;
    this.phase = t < t1 ? "approach" : t < t4 ? "drop" : t < t5 ? "leave" : "gone";

    let position = this.end;
    let heading = this.place;
    let phase = 0;
    let walk = 0;
    let carry = 0;
    let reach = 0;
    let crouch = 0;
    let toDrop = 1; // 0: in the hands, 1: on the floor at the drop spot

    if (t < t1) {
      const s = t * this.speed;
      position = this.route.position(s);
      heading = this.route.heading(s);
      phase = (2 * Math.PI * s) / STRIDE;
      walk = 1;
      carry = 1;
      toDrop = 0;
    } else if (t < t2) {
      heading = lerpAngle(this.arrive, this.place, smooth((t - t1) / PAUSE));
      carry = 1;
      toDrop = 0;
    } else if (t < t3) {
      const u = (t - t2) / PLACE;
      crouch = Math.sin(Math.PI * u);
      reach = crouch;
      carry = u < 0.5 ? 1 : 0;
      toDrop = u < 0.5 ? smooth(2 * u) : 1;
    } else if (t < t4) {
      heading = lerpAngle(this.place, this.arrive + Math.PI, smooth((t - t3) / TURN));
    } else if (t < t5) {
      const s = this.route.length - (t - t4) * this.speed;
      position = this.route.position(s);
      heading = this.route.heading(s) + Math.PI;
      phase = (2 * Math.PI * (t - t4) * this.speed) / STRIDE;
      walk = 1;
    }

    this.rig.root.visible = t < t5;
    this.rig.root.position.copy(position);
    this.rig.root.rotation.y = heading;
    pose(this.rig, { phase, walk, carry, reach, crouch });

    const held = CARRY.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, heading).add(position);
    this.box.position.lerpVectors(held, this.dropCenter, toDrop);
    this.box.rotation.y = toDrop < 1 ? heading : this.place;
  }

  // Distance on the ground from a point (the camera) to the person's feet, m.
  distanceFrom(point: THREE.Vector3) {
    const feet = this.rig.root.position;
    return Math.hypot(feet.x - point.x, feet.z - point.z);
  }

  // The person's box in the camera image as [x0, y0, x1, y1], in fractions of
  // the image width and height from the top left. Null when the person is out
  // of view. The box covers the whole body, also parts behind walls or rails.
  screenBox(camera: THREE.Camera): [number, number, number, number] | null {
    if (!this.rig.root.visible) return null;
    this.rig.root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    this.rig.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const position = object.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld).project(camera);
        if (v.z < -1 || v.z > 1) continue; // behind the camera or past the far plane
        x0 = Math.min(x0, v.x);
        x1 = Math.max(x1, v.x);
        y0 = Math.min(y0, v.y);
        y1 = Math.max(y1, v.y);
      }
    });
    // From -1..1 with y up to 0..1 with y down, clipped to the image.
    const clip = (u: number) => Math.min(Math.max(u, 0), 1);
    const box: [number, number, number, number] = [clip((x0 + 1) / 2), clip((1 - y1) / 2), clip((x1 + 1) / 2), clip((1 - y0) / 2)];
    return box[2] > box[0] && box[3] > box[1] ? box : null;
  }
}
