// Three.js (browser): the 3D viewer. Loads a house, plays or freezes the
// delivery, and draws the doorbell camera or an orbiting overview. The Python
// benchmark drives this same viewer through window.bench (see bench.ts).

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { installBench } from "./bench";
import type { Delivery } from "./delivery";
import { HOUSES, type House } from "./houses";
import { reseed } from "./random";
import { addLights, buildWorld, doorbellCamera } from "./scene";

export type View = "doorbell" | "overview";

// The largest 16:9 rectangle that fits in w × h, centered.
function fit16x9(w: number, h: number) {
  const width = Math.min(w, (h * 16) / 9);
  const height = (width * 9) / 16;
  return { x: (w - width) / 2, y: (h - height) / 2, width, height };
}

export class Viewer {
  view: View = "doorbell";
  time = 0; // s into the delivery loop
  playing = false;
  house!: House;
  delivery!: Delivery;
  onDraw?: () => void; // after each drawn frame

  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly overview = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 300);
  private readonly controls: OrbitControls;
  private world?: THREE.Group;
  private doorbell!: THREE.PerspectiveCamera;
  private frustum!: THREE.CameraHelper;
  private last = performance.now();

  constructor(private readonly seed: number) {
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.setScissorTest(true);
    addLights(this.scene);

    this.controls = new OrbitControls(this.overview, r.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.enabled = false;

    installBench({
      scenarios: () => HOUSES.map((h) => ({ id: h.id, name: h.name, query: `house=${h.id}` })),
      house: () => this.house.id,
      seed: () => this.seed,
      delivery: () => this.delivery,
      camera: () => this.doorbell,
      renderAt: (t) => this.setTime(t),
    });
    r.setAnimationLoop(() => this.tick());
  }

  get canvas() {
    return this.renderer.domElement;
  }

  get duration() {
    return this.delivery.loop;
  }

  setSize(width: number, height: number) {
    this.renderer.setSize(width, height);
  }

  load(house: House) {
    if (this.world) {
      this.scene.remove(this.world, this.frustum);
      this.world.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      this.frustum.dispose();
    }
    reseed(this.seed);
    const built = buildWorld(house);
    this.world = built.world;
    this.scene.add(this.world);
    this.house = house;
    this.delivery = built.delivery;
    this.doorbell = doorbellCamera(built.view);

    // Shows the doorbell's field of view in the overview. A short copy of the
    // camera keeps the drawn frustum near the house.
    const short = this.doorbell.clone();
    short.far = 3;
    short.updateProjectionMatrix();
    this.frustum = new THREE.CameraHelper(short);
    const yellow = new THREE.Color(0xffcc33);
    this.frustum.setColors(yellow, yellow, yellow, yellow, yellow);
    this.scene.add(this.frustum);

    this.overview.position.copy(built.view.eye);
    this.controls.target.copy(built.view.focus);
    this.controls.update();
    this.time = 0;
  }

  setView(view: View) {
    this.view = view;
    this.controls.enabled = view === "overview";
  }

  play() {
    this.playing = true;
    this.last = performance.now();
  }

  pause() {
    this.playing = false;
  }

  // Freezes the scene at time t and draws that frame at once.
  setTime(t: number) {
    this.pause();
    this.time = t;
    this.draw();
  }

  private tick() {
    const now = performance.now();
    if (this.playing) this.time = (this.time + (now - this.last) / 1000) % this.duration;
    this.last = now;
    this.draw();
  }

  private draw() {
    this.delivery.update(this.time);
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    r.setScissor(0, 0, size.x, size.y);
    r.clear();
    let camera: THREE.Camera = this.doorbell;
    let rect = fit16x9(size.x, size.y);
    if (this.view === "overview") {
      this.controls.update();
      this.overview.aspect = size.x / size.y;
      this.overview.updateProjectionMatrix();
      camera = this.overview;
      rect = { x: 0, y: 0, width: size.x, height: size.y };
    }
    this.frustum.visible = this.view === "overview";
    r.setViewport(rect.x, rect.y, rect.width, rect.height);
    r.setScissor(rect.x, rect.y, rect.width, rect.height);
    r.render(this.scene, camera);
    this.onDraw?.();
  }
}
