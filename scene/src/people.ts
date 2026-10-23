// Three.js (browser): the person axis. Two kinds of body, with one interface:
// - Mannequin: the v1 jointed capsule figure (the v1 baseline).
// - Rigged: a skinned person from CC0 Quaternius parts (an outfit, a head, and
//   hair; built offline into scene/public/people/), animated with walk, jog,
//   idle, and crouch clips. Two-bone IK puts the hands on the package.
// A pose depends only on the delivery time t, so a frame is the same on
// every run.

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { mat } from "./parts";

export type Person = "mannequin" | "man" | "woman" | "dark" | "hooded" | "child";

export interface Pose {
  phase: number; // gait phase, radians (2π for each stride)
  stride: number; // distance for one stride, m
  walk: number; // 0: standing, 1: walking
  carry: number; // 1: holding the package
  reach: number; // 1: arms down at the package on the floor
  crouch: number; // 1: lowest point of the crouch
  time: number; // s, for the idle motion
  box: THREE.Vector3; // package center, world
}

export interface Body {
  readonly root: THREE.Object3D; // feet at y = 0, facing +z
  readonly hold: THREE.Vector3; // package center while carried, body frame
  pose(o: Pose): void;
  // Calls fn with every vertex of the body, in world space.
  vertices(fn: (p: THREE.Vector3) => void): void;
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

// ---------------------------------------------------------------------------
// Mannequin (v1)

const HIP = 0.935; // hip height when standing, m

const M = {
  skin: mat(0xc68e6a, 0.7),
  shirt: mat(0x4f6d7a, 0.9),
  pants: mat(0x2e3440, 0.9),
  cap: mat(0x2b2f36, 0.8),
  shoes: mat(0x1b1b1b, 0.7),
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

// A simple jointed person, about 1.78 m tall, facing +z, feet at y = 0.
class Mannequin implements Body {
  readonly root = new THREE.Group();
  readonly hold = new THREE.Vector3(0, 1.12, 0.36);
  private readonly hips = joint(this.root, 0, HIP, 0);
  private readonly torso = joint(this.hips, 0, 0, 0);
  private readonly shoulders: THREE.Group[] = []; // [left, right]
  private readonly elbows: THREE.Group[] = [];
  private readonly thighs: THREE.Group[] = [];
  private readonly knees: THREE.Group[] = [];

  constructor() {
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 4, 12), M.shirt);
    chest.position.y = 0.33;
    chest.scale.z = 0.7;
    this.torso.add(chest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 14), M.skin);
    head.position.y = 0.74;
    this.torso.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.06, 20), M.cap);
    cap.position.y = 0.81;
    this.torso.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.015, 0.1), M.cap);
    brim.position.set(0, 0.785, 0.1);
    this.torso.add(brim);

    for (const side of [1, -1]) {
      const shoulder = joint(this.torso, 0.22 * side, 0.57, 0);
      limb(shoulder, 0.3, 0.05, M.shirt);
      const elbow = joint(shoulder, 0, -0.3, 0);
      limb(elbow, 0.27, 0.045, M.skin);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), M.skin);
      hand.position.y = -0.29;
      elbow.add(hand);

      const thigh = joint(this.hips, 0.095 * side, 0, 0);
      limb(thigh, 0.45, 0.075, M.pants);
      const knee = joint(thigh, 0, -0.45, 0);
      limb(knee, 0.44, 0.06, M.pants);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.26), M.shoes);
      foot.position.set(0, -0.45, 0.06);
      knee.add(foot);

      this.shoulders.push(shoulder);
      this.elbows.push(elbow);
      this.thighs.push(thigh);
      this.knees.push(knee);
    }
  }

  // Joint angles. Rotation about +x moves a hanging limb backward, so a
  // negative angle swings it forward.
  pose(o: Pose) {
    const swing = Math.sin(o.phase);
    const crouch = 0.84 * o.crouch; // thigh angle at the lowest point: hips 0.3 m lower
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1; // left leg leads at phase 0
      this.thighs[i].rotation.x = -0.45 * o.walk * swing * side - crouch;
      this.knees[i].rotation.x = 0.8 * o.walk * Math.max(0, Math.cos(o.phase) * side) + 2 * crouch;

      const walkArm = 0.35 * o.walk * swing * side;
      const shoulder = lerp(lerp(walkArm, -0.3, o.carry), -0.9, o.reach);
      const elbow = lerp(lerp(-0.25, -1.1, o.carry), -0.3, o.reach);
      this.shoulders[i].rotation.x = shoulder;
      this.elbows[i].rotation.x = elbow;
    }
    const bob = 0.02 * o.walk * Math.abs(swing);
    this.hips.position.y = HIP - 0.9 * (1 - Math.cos(crouch)) + bob;
    this.torso.rotation.x = 0.55 * o.crouch;
  }

  vertices(fn: (p: THREE.Vector3) => void) {
    const v = new THREE.Vector3();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const position = object.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) fn(v.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld));
    });
  }
}

// ---------------------------------------------------------------------------
// Rigged people

interface Spec {
  file: string; // scene/public/people/<file>.glb
  height: number; // m
  model: number; // the model's own height, m
  tint?: number; // multiplies the outfit colors
}

const PEOPLE: Record<Exclude<Person, "mannequin">, Spec> = {
  man: { file: "man", height: 1.8, model: 1.84 },
  woman: { file: "woman", height: 1.66, model: 1.78 },
  dark: { file: "man", height: 1.8, model: 1.84, tint: 0x34343a },
  hooded: { file: "hooded", height: 1.8, model: 1.84 },
  child: { file: "woman", height: 1.2, model: 1.78 },
};

// Distance for one loop of each gait clip, m, measured from the planted foot
// (and from the root motion in the library's _RM file).
const CLIPS = {
  walk: { name: "Walk_Loop", loop: 1.35 },
  run: { name: "Jog_Fwd_Loop", loop: 5.6 },
  idle: { name: "Idle_Loop", loop: 0 },
  crouch: { name: "Crouch_Idle_Loop", loop: 0 },
};

const loader = new GLTFLoader();
const files = new Map<string, Promise<GLTF>>();
const ready = new Map<string, GLTF>();

function file(name: string) {
  if (!files.has(name)) {
    files.set(
      name,
      loader.loadAsync(`${import.meta.env.BASE_URL}people/${name}.glb`).then((gltf) => {
        ready.set(name, gltf);
        return gltf;
      }),
    );
  }
  return files.get(name)!;
}

// Loads the files for a person. Call it before makeBody.
export async function preparePerson(person: Person) {
  if (person !== "mannequin") await Promise.all([file(PEOPLE[person].file), file("moves")]);
}

const _s = new THREE.Vector3();
const _e = new THREE.Vector3();
const _h = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _w = new THREE.Quaternion();

// Turns bone so that child moves toward target, blended by weight.
function aim(bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3, weight: number) {
  const origin = bone.getWorldPosition(new THREE.Vector3());
  const from = child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
  const to = target.clone().sub(origin).normalize();
  _q.setFromUnitVectors(from, to);
  bone.getWorldQuaternion(_w);
  const local = bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(_q.multiply(_w));
  bone.quaternion.slerp(local, weight);
  bone.updateMatrixWorld(true);
}

// Two-bone IK: the hand goes to target, and the elbow bends toward pole.
function reach(upper: THREE.Object3D, lower: THREE.Object3D, hand: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, weight: number) {
  upper.getWorldPosition(_s);
  lower.getWorldPosition(_e);
  hand.getWorldPosition(_h);
  const a = _s.distanceTo(_e);
  const b = _e.distanceTo(_h);
  _d.copy(target).sub(_s);
  const d = THREE.MathUtils.clamp(_d.length(), 0.05, a + b - 0.001);
  _d.normalize();
  const cos = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  const elbow = _s.clone().addScaledVector(_d, a * cos).addScaledVector(_p, a * Math.sqrt(1 - cos * cos));
  aim(upper, lower, elbow, weight);
  aim(lower, hand, target, weight);
}

class Rigged implements Body {
  readonly root = new THREE.Group();
  readonly hold: THREE.Vector3;
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<keyof typeof CLIPS, THREE.AnimationAction>;
  private readonly arms: { upper: THREE.Object3D; lower: THREE.Object3D; hand: THREE.Object3D; side: number }[];
  private readonly skinned: THREE.SkinnedMesh[] = [];

  // jitter gives values in [-1, 1) (all 0 for seed 0): height ±4% and a
  // clothing tint.
  constructor(spec: Spec, private readonly run: boolean, jitter: () => number) {
    const scale = (spec.height / spec.model) * (1 + 0.04 * jitter());
    this.model = SkeletonUtils.clone(ready.get(spec.file)!.scene);
    this.model.scale.setScalar(scale);
    this.root.add(this.model);
    this.hold = new THREE.Vector3(0, 1.08, 0.34).multiplyScalar(spec.height / 1.8);

    const hue = jitter();
    const tint = new THREE.Color(spec.tint ?? 0xffffff);
    if (hue !== 0) tint.multiply(new THREE.Color().setHSL((hue + 1) / 2, 0.35, 0.75 + 0.2 * jitter()));
    this.model.traverse((object) => {
      if (!(object instanceof THREE.SkinnedMesh)) return;
      object.frustumCulled = false; // the bounds move with the bones
      this.skinned.push(object);
      const material = (object.material as THREE.MeshStandardMaterial).clone();
      if (/Peasant|Ranger/.test(material.name)) material.color.copy(tint);
      object.material = material;
    });

    this.mixer = new THREE.AnimationMixer(this.model);
    const clips = ready.get("moves")!.animations;
    const action = (name: string) => {
      const a = this.mixer.clipAction(clips.find((c) => c.name === name)!);
      a.play();
      a.weight = 0;
      return a;
    };
    this.actions = {
      walk: action(CLIPS.walk.name),
      run: action(CLIPS.run.name),
      idle: action(CLIPS.idle.name),
      crouch: action(CLIPS.crouch.name),
    };
    const bone = (name: string) => this.model.getObjectByName(name)!;
    this.model.updateMatrixWorld(true);
    this.arms = ["l", "r"].map((s) => ({
      upper: bone(`upperarm_${s}`),
      lower: bone(`lowerarm_${s}`),
      hand: bone(`hand_${s}`),
      side: Math.sign(bone(`hand_${s}`).getWorldPosition(new THREE.Vector3()).x),
    }));
  }

  pose(o: Pose) {
    const gait = this.run ? CLIPS.run : CLIPS.walk;
    const action = this.run ? this.actions.run : this.actions.walk;
    const distance = (o.phase / (2 * Math.PI)) * o.stride;
    const duration = action.getClip().duration;
    action.time = (((distance / gait.loop) % 1) + 1) % 1 * duration;
    action.weight = o.walk;
    (this.run ? this.actions.walk : this.actions.run).weight = 0;
    this.actions.crouch.time = 1.0;
    this.actions.crouch.weight = o.crouch;
    this.actions.idle.time = o.time % this.actions.idle.getClip().duration;
    this.actions.idle.weight = Math.max(0, 1 - o.walk - o.crouch);
    this.mixer.update(0);
    this.root.updateMatrixWorld(true);

    // Hands on the sides of the package while it is in the hands.
    const weight = Math.max(o.carry, o.reach);
    if (weight <= 0) return;
    const m = this.root.matrixWorld;
    const x = new THREE.Vector3().setFromMatrixColumn(m, 0).normalize();
    const y = new THREE.Vector3().setFromMatrixColumn(m, 1).normalize();
    for (const arm of this.arms) {
      const target = o.box.clone().addScaledVector(x, arm.side * 0.245).addScaledVector(y, -0.02);
      const pole = x.clone().multiplyScalar(arm.side * 0.5).addScaledVector(y, -1);
      reach(arm.upper, arm.lower, arm.hand, target, pole, weight);
    }
  }

  vertices(fn: (p: THREE.Vector3) => void) {
    const v = new THREE.Vector3();
    for (const mesh of this.skinned) {
      const count = mesh.geometry.attributes.position.count;
      for (let i = 0; i < count; i++) fn(mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld));
    }
  }
}

// A body for a person. preparePerson must have finished for it.
export function makeBody(person: Person, run: boolean, jitter: () => number): Body {
  return person === "mannequin" ? new Mannequin() : new Rigged(PEOPLE[person], run, jitter);
}
