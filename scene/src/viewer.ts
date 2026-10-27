// Three.js (browser): the 3D viewer. Loads a house, plays or freezes the
// delivery, and draws the doorbell camera or an orbiting overview. The Python
// benchmark drives this same viewer through window.bench (see bench.ts).

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { installBench } from "./bench";
import { DoorbellCamera } from "./camera";
import { prepareEvent, type Actor } from "./events";
import type { House } from "./houses";
import { IR_INTENSITY, type Lighting } from "./lights";
import { preparePerson } from "./people";
import { prepareProps } from "./props";
import { prepareSurfaces } from "./surfaces";
import { buildWorld } from "./scene";
import { Sensor } from "./sensor";
import type { WeatherState } from "./weather";
import type { Settings } from "./settings";

export type View = "doorbell" | "overview";

declare global {
  interface Window {
    sim?: { stats: () => Record<string, number> };
  }
}

// Around the doorbell image (in the doorbell view, and at the sides of a
// square inset): black.
const BARS = 0x000000;

// The largest rectangle with this aspect that fits in w × h, centered.
function fit(w: number, h: number, aspect: number) {
  const width = Math.min(w, h * aspect);
  const height = width / aspect;
  return { x: (w - width) / 2, y: (h - height) / 2, width, height };
}

export class Viewer {
  view: View = "doorbell";
  inset = false; // in the overview, also draw the doorbell camera in the bottom-right corner
  time = 0; // s into the delivery loop
  playing = false;
  settings!: Settings;
  house!: House;
  actor!: Actor; // what moves: the delivery, or a no-person event
  onDraw?: () => void; // after each drawn frame

  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly overview = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 300);
  private readonly controls: OrbitControls;
  private world?: THREE.Group;
  private doorbell!: DoorbellCamera;
  private lighting!: Lighting;
  private weather!: WeatherState;
  private readonly sensor = new Sensor();
  private frustum!: THREE.CameraHelper;
  private last = performance.now();
  private loads = 0; // the newest load wins when loads overlap

  constructor() {
    const r = this.renderer;
    r.info.autoReset = false; // count every pass of a frame; draw() resets it
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false; // draw() updates it once per frame, not once per view
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.setScissorTest(true);

    this.controls = new OrbitControls(this.overview, r.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.enabled = false;

    r.setAnimationLoop(() => this.tick());

    // For the browser budget checks: the cost of the last frame.
    window.sim = {
      stats: () => {
        const { render, memory, programs } = this.renderer.info;
        return { calls: render.calls, triangles: render.triangles, points: render.points, lines: render.lines, geometries: memory.geometries, textures: memory.textures, programs: programs?.length ?? 0 };
      },
    };
  }

  get canvas() {
    return this.renderer.domElement;
  }

  get duration() {
    return this.actor.loop;
  }

  setSize(width: number, height: number) {
    this.renderer.setSize(width, height);
  }

  // Size of the doorbell inset frame, in CSS px, and its margin from the
  // bottom-right corner of the canvas. The frame is as wide as a 16:9 inset
  // for both cameras, so it lines up with the panel above it. A square
  // (fisheye) image is 0.75 as wide, so it has about the same area; it sits in
  // the middle of the frame, with black at the sides. The frame is at most 40%
  // of the canvas height, so the panel fits above it.
  insetSize() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const tall = this.doorbell.aspect === 1 ? 0.75 : 1 / this.doorbell.aspect; // height / width
    const width = Math.round(Math.min(480, Math.max(180, size.x * 0.32), (0.4 * size.y) / tall));
    return { width, height: Math.round(width * tall), margin: 16 };
  }

  // Loads the files that the settings need (people, textures, the car), then
  // builds the world.
  // window.bench is ready after the first load.
  async load(settings: Settings) {
    const load = ++this.loads;
    await Promise.all([preparePerson(settings.person), prepareSurfaces(settings.surfaces, this.renderer), prepareProps(settings.occlusion), prepareEvent(settings.event)]);
    if (load !== this.loads) return;
    if (this.world) {
      this.scene.remove(this.world, this.frustum);
      this.world.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      this.frustum.dispose();
    }
    const built = buildWorld(settings, this.renderer);
    this.world = built.world;
    this.scene.add(this.world);
    this.lighting = built.lighting;
    this.weather = built.weather;
    this.scene.fog = built.weather.fog;
    this.scene.background = built.weather.overcastSky ? built.lighting.haze : built.lighting.background;
    this.scene.backgroundIntensity = built.lighting.backgroundIntensity;
    this.scene.environment = built.lighting.environment;
    this.scene.environmentIntensity = built.lighting.environmentIntensity;
    this.settings = settings;
    this.house = built.house;
    this.actor = built.actor;
    this.doorbell = new DoorbellCamera(built.view, settings.camera);

    // Shows the doorbell's field of view in the overview. A short copy of the
    // camera keeps the drawn frustum near the house.
    const short = this.doorbell.camera.clone();
    short.far = this.doorbell.fisheye ? 1 : 3;
    short.updateProjectionMatrix();
    this.frustum = new THREE.CameraHelper(short);
    const yellow = new THREE.Color(0xffcc33);
    this.frustum.setColors(yellow, yellow, yellow, yellow, yellow);
    this.scene.add(this.frustum);

    this.overview.position.copy(built.view.eye);
    this.controls.target.copy(built.view.focus);
    this.controls.update();
    this.time = 0;

    if (!window.bench) {
      installBench({
        settings: () => this.settings,
        house: () => this.house.id,
        seed: () => this.settings.seed,
        actor: () => this.actor,
        camera: () => this.doorbell,
        renderAt: (t) => this.setTime(t),
      });
    }
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
    if (this.playing && this.world) this.time = (this.time + (now - this.last) / 1000) % this.duration;
    this.last = now;
    this.draw();
  }

  private draw() {
    if (!this.world) return; // the first load is not done
    this.actor.update(this.time);
    this.weather.update(this.time);
    const r = this.renderer;
    r.info.reset();
    r.shadowMap.needsUpdate = true;
    r.toneMappingExposure = this.lighting.exposure;
    const size = r.getSize(new THREE.Vector2());
    r.setScissor(0, 0, size.x, size.y);
    r.clear();
    if (this.view === "overview") {
      this.controls.update();
      this.overview.aspect = size.x / size.y;
      this.overview.updateProjectionMatrix();
      this.frustum.visible = true;
      r.setViewport(0, 0, size.x, size.y);
      r.setScissor(0, 0, size.x, size.y);
      r.render(this.scene, this.overview);
      if (this.inset) {
        // WebGL counts y from the bottom. The frame is black first, for the
        // sides of a square image.
        const { width, height, margin } = this.insetSize();
        const x = size.x - width - margin;
        this.fill(x, margin, width, height);
        const image = Math.min(width, height * this.doorbell.aspect);
        this.drawDoorbell({ x: x + (width - image) / 2, y: margin, width: image, height });
      }
    } else {
      this.fill(0, 0, size.x, size.y); // the bars around the image
      this.drawDoorbell(fit(size.x, size.y, this.doorbell.aspect));
    }
    this.onDraw?.();
  }

  // Fills a rect (CSS px, from the bottom left) with BARS, the color around
  // the doorbell image.
  private fill(x: number, y: number, width: number, height: number) {
    const r = this.renderer;
    const color = r.getClearColor(new THREE.Color());
    const alpha = r.getClearAlpha();
    r.setScissor(x, y, width, height);
    r.setClearColor(BARS, 1);
    r.clear();
    r.setClearColor(color, alpha);
  }

  // The doorbell image in rect (CSS px, from the bottom left). The IR light is
  // on only here, so the overview shows the scene as a person sees it.
  private drawDoorbell(rect: { x: number; y: number; width: number; height: number }) {
    const r = this.renderer;
    const ir = this.lighting.ir;
    this.frustum.visible = false;
    const ring = this.doorbell.fisheye;
    if (ir) ir.intensity = IR_INTENSITY;
    if (ir || ring) {
      const inImage = (f: THREE.Vector2 | null): f is THREE.Vector2 => f !== null && Math.abs(f.x) <= 1 && Math.abs(f.y) <= 1;
      const flares = ring ? [...this.lighting.flares, ...this.actor.flares()].map((f) => this.doorbell.project(f)).filter(inImage) : [];
      const drops = ring && this.weather.lensDrops;
      this.sensor.render(r, this.scene, this.doorbell.camera, rect, { mono: !!ir, ring, time: this.time, flares, drops, seed: this.settings.seed });
    } else {
      r.setViewport(rect.x, rect.y, rect.width, rect.height);
      r.setScissor(rect.x, rect.y, rect.width, rect.height);
      r.render(this.scene, this.doorbell.camera);
    }
    if (ir) ir.intensity = 0;
  }
}
