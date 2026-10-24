// Three.js (browser): the event axis, what moves in front of the doorbell.
// - delivery: the person with the package (delivery.ts).
// - dog: a dog trots up the walk, sniffs near the steps, and trots back.
// - car: an SUV drives past on the street (headlights on when it is dark).
// - empty: nothing moves but the weather.
// dog, car, and empty have no person: window.bench reports phase "none" and
// no person box, so every detection there is a false alarm.
// Every pose comes from the time t, so a frame is the same on every run.

import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import type { Phase } from "./delivery";
import type { HouseView } from "./houses";
import { loadCar } from "./props";

export type Event = "delivery" | "dog" | "car" | "empty";

// What the viewer and window.bench need from any event.
export interface Actor {
  readonly root: THREE.Object3D;
  readonly loop: number; // s
  readonly phase: Phase;
  update(t: number): void;
  // The person box in the image, or null when no person is in view.
  screenBox(project: (point: THREE.Vector3) => THREE.Vector2 | null): [number, number, number, number] | null;
  // Doorbell to person on the ground, m; null with no person.
  distanceFrom(point: THREE.Vector3): number | null;
  // Moving bright lights that can flare in the lens (headlights).
  flares(): THREE.Vector3[];
}

let dog: Promise<THREE.Group> | null = null;
let dogModel: THREE.Group | null = null;
let suv: Promise<THREE.Group> | null = null;
let suvModel: THREE.Group | null = null;

// Loads the files that the event needs. Call it before makeEvent.
export async function prepareEvent(event: Event) {
  if (event === "dog") {
    dog ??= new FBXLoader().loadAsync(`${import.meta.env.BASE_URL}props/Pug.fbx`).then((model) => {
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const standard = (m: THREE.MeshPhongMaterial) => new THREE.MeshStandardMaterial({ name: m.name, color: m.color, roughness: 0.85 });
        object.material = Array.isArray(object.material) ? object.material.map(standard) : standard(object.material);
        object.frustumCulled = false;
        oneGroupPerMaterial(object.geometry);
      });
      return model;
    });
    dogModel = await dog;
  } else if (event === "car") {
    suv ??= loadCar("SUV");
    suvModel = await suv;
  }
}

// The FBX geometry alternates between its two materials in many short runs,
// and each run is one draw call. Reordering the faces gives one run (one draw
// call) for each material.
function oneGroupPerMaterial(geometry: THREE.BufferGeometry) {
  if (geometry.groups.length <= 1) return;
  const index = geometry.index;
  const byMaterial = new Map<number, number[]>();
  for (const group of geometry.groups) {
    const list = byMaterial.get(group.materialIndex ?? 0) ?? [];
    for (let i = group.start; i < group.start + group.count; i++) list.push(index ? index.getX(i) : i);
    byMaterial.set(group.materialIndex ?? 0, list);
  }
  const order: number[] = [];
  geometry.clearGroups();
  for (const [material, list] of [...byMaterial].sort((a, b) => a[0] - b[0])) {
    geometry.addGroup(order.length, list.length, material);
    order.push(...list);
  }
  geometry.setIndex(order);
}

const smooth = (u: number) => u * u * (3 - 2 * u);

// The ground part of a route: the walk up to the first step.
function groundRoute(view: HouseView) {
  const points: THREE.Vector3[] = [];
  for (const p of view.route) {
    if (p.y > 0.05) break;
    points.push(p.clone());
  }
  // Stop 0.6 m short of the steps.
  const [a, b] = points.slice(-2);
  points[points.length - 1] = b.clone().addScaledVector(a.clone().sub(b).normalize(), 0.6);
  return points;
}

// Position and heading along a polyline at distance s.
function along(points: THREE.Vector3[], s: number) {
  let left = Math.max(0, s);
  for (let i = 1; i < points.length; i++) {
    const length = points[i].distanceTo(points[i - 1]);
    if (left <= length || i === points.length - 1) {
      const u = Math.min(left / length, 1);
      const d = points[i].clone().sub(points[i - 1]);
      return { position: points[i - 1].clone().lerp(points[i], u), heading: Math.atan2(d.x, d.z) };
    }
    left -= length;
  }
  return { position: points[0].clone(), heading: 0 };
}

const pathLength = (points: THREE.Vector3[]) => points.slice(1).reduce((sum, p, i) => sum + p.distanceTo(points[i]), 0);

class Dog implements Actor {
  readonly root = new THREE.Group();
  readonly loop: number;
  phase: Phase = "none";
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  // Each leg: the upper bone that swings, the end of the leg chain, and the
  // paw bone. The paws are IK targets on the root, so they follow the chain
  // ends by hand.
  private readonly legs: { bone: THREE.Object3D; end: THREE.Object3D; paw: THREE.Object3D; rest: THREE.Quaternion; lag: number }[] = [];
  private readonly path: THREE.Vector3[];
  private readonly length: number;
  private readonly speed: number;
  private readonly times: number[]; // end of: out, sniff, turn, back, gone
  private readonly face: number; // turn so that the model faces +z

  constructor(view: HouseView, jitter: () => number) {
    this.model = SkeletonUtils.clone(dogModel!);
    this.model.scale.setScalar(0.6 / 263); // the model is 263 units high; a medium dog is 0.6 m
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.idle = this.mixer.clipAction(dogModel!.animations.find((a) => a.name.includes("Idle"))!);
    this.idle.play();
    this.model.updateMatrixWorld(true);
    const head = this.model.getObjectByName("Head")!.getWorldPosition(new THREE.Vector3());
    this.face = head.z >= 0 ? 0 : Math.PI;
    // Trot: diagonal legs move together.
    for (const [leg, lag] of [["FrontL", 0], ["BackR", 0], ["FrontR", Math.PI], ["BackL", Math.PI]] as const) {
      const [part, side] = [leg.slice(0, -1), leg.slice(-1)];
      const bone = this.model.getObjectByName(`${part}UpLeg${side}`)!;
      const end = this.model.getObjectByName(`${part}LowLeg${side}_end`)!;
      const paw = this.model.getObjectByName(`${part}Foot${side}`)!;
      this.legs.push({ bone, end, paw, rest: bone.quaternion.clone(), lag });
    }
    this.path = groundRoute(view);
    this.path[0].addScaledVector(this.path[1].clone().sub(this.path[0]).normalize(), 2 * jitter());
    this.length = pathLength(this.path);
    this.speed = 1.6 * (1 + 0.1 * jitter());
    const walk = this.length / this.speed;
    let end = 0;
    this.times = [walk, 3, 0.8, walk, 2].map((step) => (end += step));
    this.loop = end;
  }

  update(time: number) {
    const [t1, t2, t3, t4, loop] = this.times;
    const t = ((time % loop) + loop) % loop;
    let s = 0;
    let turn = 0;
    let trot = 0;
    if (t < t1) {
      s = t * this.speed;
      trot = 1;
    } else if (t < t2) {
      s = this.length;
    } else if (t < t3) {
      s = this.length;
      turn = smooth((t - t2) / (t3 - t2));
    } else if (t < t4) {
      s = this.length - (t - t3) * this.speed;
      turn = 1;
      trot = 1;
    }
    const { position, heading } = along(this.path, s);
    this.root.visible = t < t4;
    this.root.position.copy(position);
    this.root.rotation.y = heading + this.face + Math.PI * turn;

    this.idle.time = t % this.idle.getClip().duration;
    this.idle.weight = 1 - trot;
    this.mixer.update(0);
    const phase = (2 * Math.PI * (t < t1 ? s : this.length - s)) / 0.9; // 0.9 m for each stride
    if (trot <= 0) return;
    for (const leg of this.legs) {
      const swing = 0.5 * Math.sin(phase + leg.lag); // about local x: forward and back
      leg.bone.quaternion.copy(leg.rest).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), swing));
    }
    this.root.updateMatrixWorld(true);
    for (const leg of this.legs) leg.paw.position.copy(leg.paw.parent!.worldToLocal(leg.end.getWorldPosition(new THREE.Vector3())));
  }

  screenBox() {
    return null;
  }

  distanceFrom() {
    return null;
  }

  flares() {
    return [];
  }
}

class PassingCar implements Actor {
  readonly root = new THREE.Group();
  readonly loop: number;
  phase: Phase = "none";
  private readonly wheels: THREE.Object3D[] = [];
  private readonly lamps: THREE.Object3D[] = [];
  private readonly from: number;
  private readonly to: number;
  private readonly speed = 9; // m/s
  private readonly drive: number; // s

  constructor(view: HouseView, dark: boolean, jitter: () => number) {
    const model = suvModel!.clone();
    this.root.add(model);
    // Own copies of the light materials, so the parked car stays dark.
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const list = (Array.isArray(object.material) ? object.material : [object.material]).map((m: THREE.MeshStandardMaterial) => {
        if (!/light/i.test(m.name)) return m;
        const copy = m.clone();
        if (dark) {
          copy.emissive.set(/tail/i.test(m.name) ? 0xff2a1a : 0xfff1d6);
          copy.emissiveIntensity = /tail/i.test(m.name) ? 2 : 6;
        }
        return copy;
      });
      object.material = Array.isArray(object.material) ? list : list[0];
      // Wheels turn about their own center.
      if (/Wheel/.test(object.name)) {
        object.geometry = object.geometry.clone();
        object.geometry.computeBoundingBox();
        const center = object.geometry.boundingBox!.getCenter(new THREE.Vector3());
        object.geometry.translate(-center.x, -center.y, -center.z);
        object.position.copy(center);
        this.wheels.push(object);
      }
    });
    if (dark) {
      for (const x of [-0.7, 0.7]) {
        const lamp = new THREE.SpotLight(0xfff1d6, 60, 50, 0.45, 0.6, 2);
        lamp.position.set(x, 0.75, 2.1);
        lamp.target.position.set(x * 1.5, 0, 14);
        model.add(lamp, lamp.target);
        this.lamps.push(lamp);
      }
    }
    // A seed can send the car the other way, in the far lane.
    const reverse = jitter() > 0.5;
    this.from = reverse ? 50 : -50;
    this.to = reverse ? -50 : 50;
    this.root.position.z = reverse ? view.lane + 4 : view.lane;
    this.root.rotation.y = reverse ? -Math.PI / 2 : Math.PI / 2;
    this.drive = Math.abs(this.to - this.from) / this.speed;
    this.loop = this.drive + 3;
  }

  update(time: number) {
    const t = ((time % this.loop) + this.loop) % this.loop;
    const u = Math.min(t / this.drive, 1);
    this.root.visible = t < this.drive;
    this.root.position.x = this.from + (this.to - this.from) * u;
    const distance = Math.min(t, this.drive) * this.speed;
    for (const wheel of this.wheels) wheel.rotation.x = distance / 0.36;
  }

  screenBox() {
    return null;
  }

  distanceFrom() {
    return null;
  }

  flares() {
    if (!this.root.visible) return [];
    this.root.updateMatrixWorld(true);
    return this.lamps.map((lamp) => lamp.getWorldPosition(new THREE.Vector3()));
  }
}

class Empty implements Actor {
  readonly root = new THREE.Group();
  readonly loop = 12;
  phase: Phase = "none";
  update() {}
  screenBox() {
    return null;
  }
  distanceFrom() {
    return null;
  }
  flares() {
    return [];
  }
}

// An actor for a no-person event. prepareEvent must have finished for it.
export function makeEvent(event: Exclude<Event, "delivery">, view: HouseView, dark: boolean, jitter: () => number): Actor {
  if (event === "dog") return new Dog(view, jitter);
  if (event === "car") return new PassingCar(view, dark, jitter);
  return new Empty();
}
