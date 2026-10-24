// Three.js (browser): the delivery person and package, and the ground truth
// that the Python benchmark reads (phase, person box, distance).

import * as THREE from "three";
import { mat } from "./parts";
import type { Body } from "./people";

export const SPEEDS = { walk: 1.4, run: 4.5 }; // m/s
const STRIDES = { walk: 1.4, run: 2.6 }; // distance for one full gait cycle, m
const PAUSE = 0.5; // turn to face the drop spot, s
const PLACE = 1.6; // crouch, set the package down, stand up, s
const TURN = 0.8; // turn around to walk back, s
const GONE = 2.0; // time out of the scene before the loop starts again, s

// One package for every scene for now: 45 × 30 × 35 cm.
const BOX = new THREE.Vector3(0.45, 0.3, 0.35);

const M = {
  cardboard: mat(0xb8875a, 0.95),
  tape: mat(0xd9c39a, 0.6),
};

function buildPackage() {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(BOX.x, BOX.y, BOX.z), M.cardboard));
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.004, BOX.z + 0.002), M.tape);
  tape.position.y = BOX.y / 2;
  group.add(tape);
  return group;
}

const smooth = (u: number) => u * u * (3 - 2 * u);

// Turns from angle a to angle b the short way.
function lerpAngle(a: number, b: number, u: number) {
  const full = 2 * Math.PI;
  const d = ((((b - a + Math.PI) % full) + full) % full) - Math.PI;
  return a + d * u;
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

// "none": an event with no person (events.ts).
export type Phase = "approach" | "drop" | "leave" | "gone" | "none";

// A person carries the package along the route, sets it down at drop, turns
// around, and walks back. The scene is a pure function of time, so a frame
// at time t is the same on every run.
export class Delivery {
  phase: Phase = "approach";
  readonly root = new THREE.Group();
  private readonly box = buildPackage();
  private readonly route: Route;
  private readonly end: THREE.Vector3;
  private readonly arrive: number; // heading at the end of the route
  private readonly place: number; // heading toward the drop spot
  private readonly dropCenter: THREE.Vector3;
  private readonly times: number[]; // end of each step: approach, pause, place, turn, leave, gone
  private readonly speed: number; // m/s
  private readonly stride: number; // m

  // jitter gives values in [-1, 1) (all 0 for seed 0). They move the start
  // point up to 2 m along the first leg and change the speed by up to 10%.
  constructor(
    points: THREE.Vector3[],
    drop: THREE.Vector3,
    private readonly body: Body,
    gait: keyof typeof SPEEDS,
    jitter: () => number,
  ) {
    const [first, second] = points;
    const start = first.clone().addScaledVector(second.clone().sub(first).normalize(), 2 * jitter());
    points = [start, ...points.slice(1)];
    this.speed = SPEEDS[gait] * (1 + 0.1 * jitter());
    this.stride = STRIDES[gait];
    this.route = new Route(points);
    this.end = points[points.length - 1];
    this.arrive = this.route.heading(this.route.length);
    this.place = Math.atan2(drop.x - this.end.x, drop.z - this.end.z);
    this.dropCenter = drop.clone().setY(drop.y + BOX.y / 2);
    this.root.add(body.root, this.box);
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
      phase = (2 * Math.PI * s) / this.stride;
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
      phase = (2 * Math.PI * (t - t4) * this.speed) / this.stride;
      walk = 1;
    }

    const person = this.body.root;
    person.visible = t < t5;
    person.position.copy(position);
    person.rotation.y = heading;

    const held = this.body.hold.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, heading).add(position);
    this.box.position.lerpVectors(held, this.dropCenter, toDrop);
    this.box.rotation.y = toDrop < 1 ? heading : this.place;
    this.body.pose({ phase, stride: this.stride, walk, carry, reach, crouch, time: t, box: this.box.position });
  }

  // No moving lights.
  flares(): THREE.Vector3[] {
    return [];
  }

  // Distance on the ground from a point (the camera) to the person's feet, m.
  distanceFrom(point: THREE.Vector3) {
    const feet = this.body.root.position;
    return Math.hypot(feet.x - point.x, feet.z - point.z);
  }

  // The person's box in the camera image as [x0, y0, x1, y1], in fractions of
  // the image width and height from the top left. Null when the person is out
  // of view. The box covers the whole body, also parts behind walls or rails.
  // project gives a world point in the image (-1 to 1, y up), or null.
  screenBox(project: (point: THREE.Vector3) => THREE.Vector2 | null): [number, number, number, number] | null {
    if (!this.body.root.visible) return null;
    this.body.root.updateMatrixWorld(true);
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    this.body.vertices((v) => {
      const p = project(v);
      if (!p) return; // behind the camera, past the far plane, or outside the lens
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    });
    // From -1..1 with y up to 0..1 with y down, clipped to the image.
    const clip = (u: number) => Math.min(Math.max(u, 0), 1);
    const box: [number, number, number, number] = [clip((x0 + 1) / 2), clip((1 - y1) / 2), clip((x1 + 1) / 2), clip((1 - y0) / 2)];
    return box[2] > box[0] && box[3] > box[1] ? box : null;
  }
}
