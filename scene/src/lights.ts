// Three.js (browser): the light axis. Day, dusk, night, and IR, plus the
// hidden v1 lights that the v1 baseline uses.
//
// Budget: one shadow light (the sun by day and dusk, the porch light at
// night). Street lamps cast no shadows. The sky is drawn into a cube map once
// for each preset, not once per frame.

import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import type { HouseView } from "./houses";
import { M, mat } from "./parts";

export type Light = "v1" | "day" | "dusk" | "night" | "ir";

interface Preset {
  sun?: { elevation: number; azimuth: number; color: number; intensity: number }; // degrees; azimuth 0 is toward the street (+z), 90 is +x
  // ground: the light that comes up from the ground, in the sky map's units
  sky: { elevation: number; azimuth: number; turbidity: number; rayleigh: number; mie: number; clouds: number; ground: number; brightness: number };
  ambient: number; // environment (sky) light on the scene
  moon?: number;
  porch: number; // porch light, cd (0 is off)
  street: number; // each street lamp, cd (0 is off)
  windows: number; // glow of lit windows
  ir: boolean; // IR light at the doorbell, and a monochrome doorbell image
  exposure: number;
}

const PRESETS: Record<Exclude<Light, "v1">, Preset> = {
  day: {
    sun: { elevation: 44, azimuth: -40, color: 0xfff4e0, intensity: 2.8 },
    sky: { elevation: 44, azimuth: -40, turbidity: 2.5, rayleigh: 1.5, mie: 0.004, clouds: 0.3, ground: 0.7, brightness: 0.35 },
    ambient: 0.22,
    porch: 0,
    street: 0,
    windows: 0,
    ir: false,
    exposure: 1,
  },
  dusk: {
    sun: { elevation: 9, azimuth: 32, color: 0xff9a4d, intensity: 1.8 },
    sky: { elevation: 9, azimuth: 32, turbidity: 8, rayleigh: 2.5, mie: 0.01, clouds: 0.2, ground: 0.2, brightness: 0.35 },
    ambient: 0.3,
    porch: 6,
    street: 30,
    windows: 0.35,
    ir: false,
    exposure: 1.1,
  },
  night: {
    sky: { elevation: -8, azimuth: 25, turbidity: 2, rayleigh: 0.6, mie: 0.004, clouds: 0, ground: 0.002, brightness: 1.5 },
    ambient: 0.05,
    moon: 0.03,
    porch: 8,
    street: 60,
    windows: 1.2,
    ir: false,
    exposure: 1.3,
  },
  ir: {
    sky: { elevation: -8, azimuth: 25, turbidity: 2, rayleigh: 0.6, mie: 0.004, clouds: 0, ground: 0.002, brightness: 1.5 },
    ambient: 0.05,
    moon: 0.03,
    porch: 0,
    street: 60,
    windows: 1.2,
    ir: true,
    exposure: 1.0,
  },
};

// The parts of a light that the viewer applies to the scene and the doorbell.
export interface Lighting {
  background: THREE.Color | THREE.Texture;
  backgroundIntensity: number;
  environment: THREE.Texture | null;
  environmentIntensity: number;
  exposure: number;
  ir: THREE.SpotLight | null; // drawn only into the doorbell image
}

const lampHead = mat(0x2a2a2a, 0.5);
const lampGlass = mat(0xf4efe2, 0.3); // porch lantern
const lampLens = mat(0xf4efe2, 0.3); // street lamps
const pole = mat(0x3a3d40, 0.6, 0.4);

const direction = (elevation: number, azimuth: number) => {
  const e = THREE.MathUtils.degToRad(elevation);
  const a = THREE.MathUtils.degToRad(azimuth);
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
};

// The sky as a cube map (the background) and as PMREM (the ambient light),
// made once per preset. 256 px faces: about 3 MB of GPU memory for each.
const skies = new Map<string, { background: THREE.Texture; environment: THREE.Texture }>();

function sky(renderer: THREE.WebGLRenderer, id: string, preset: Preset) {
  const cached = skies.get(id);
  if (cached) return cached;
  const scene = new THREE.Scene();
  const dome = new Sky();
  dome.scale.setScalar(100);
  const u = dome.material.uniforms;
  u.turbidity.value = preset.sky.turbidity;
  u.rayleigh.value = preset.sky.rayleigh;
  u.mieCoefficient.value = preset.sky.mie;
  u.mieDirectionalG.value = 0.8;
  u.cloudCoverage.value = preset.sky.clouds;
  u.sunPosition.value.copy(direction(preset.sky.elevation, preset.sky.azimuth));
  scene.add(dome);
  // Ground below the horizon, so light from below is ground light, not haze.
  const g = preset.sky.ground;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(500, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32 * g, 0.36 * g, 0.24 * g) }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  scene.add(ground);

  // The background shows the sun disc. The ambient light leaves it out,
  // because the sun is already a directional light.
  const cube = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  new THREE.CubeCamera(0.1, 1000, cube).update(renderer, scene);
  u.showSunDisc.value = 0;
  const ambientCube = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
  new THREE.CubeCamera(0.1, 1000, ambientCube).update(renderer, scene);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromCubemap(ambientCube.texture).texture;
  pmrem.dispose();
  ambientCube.dispose();
  dome.geometry.dispose();
  dome.material.dispose();
  ground.geometry.dispose();
  ground.material.dispose();
  const made = { background: cube.texture, environment };
  skies.set(id, made);
  return made;
}

// The v1 lights: a flat blue background, a hemisphere light, and the sun.
function v1(world: THREE.Group): Lighting {
  world.add(new THREE.HemisphereLight(0xdfeaff, 0x7a7466, 1.4));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.8);
  sun.position.set(-12, 18, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 70 });
  world.add(sun);
  M.glassLit.emissive.set(0x000000);
  return { background: new THREE.Color(0xa9c9e8), backgroundIntensity: 1, environment: null, environmentIntensity: 1, exposure: 1, ir: null };
}

// Adds the lights and light fixtures for one preset to the world.
export function buildLights(renderer: THREE.WebGLRenderer, world: THREE.Group, view: HouseView, light: Light): Lighting {
  if (light === "v1") return v1(world);
  const preset = PRESETS[light];

  if (preset.sun) {
    const sun = new THREE.DirectionalLight(preset.sun.color, preset.sun.intensity);
    sun.position.copy(direction(preset.sun.elevation, preset.sun.azimuth).multiplyScalar(40));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 90 });
    world.add(sun);
  }
  if (preset.moon) {
    const moon = new THREE.DirectionalLight(0x9db4ff, preset.moon);
    moon.position.copy(direction(40, -30).multiplyScalar(40));
    world.add(moon);
  }

  // Porch lantern on the wall beside the door, aimed out and down.
  lampGlass.emissive.set(preset.porch ? 0xffc37a : 0x000000);
  lampGlass.emissiveIntensity = 3;
  const lantern = new THREE.Group();
  lantern.position.copy(view.lamp);
  lantern.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), lampHead));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.22, 0.13), lampGlass);
  glass.position.y = -0.13;
  lantern.add(glass);
  world.add(lantern);
  if (preset.porch) {
    const porch = new THREE.SpotLight(0xffc98a, preset.porch, 0, 1.25, 0.7, 2);
    porch.position.copy(view.lamp).add(new THREE.Vector3(0, -0.15, 0.12));
    porch.target.position.set(view.lamp.x, 0, view.lamp.z + 4);
    porch.castShadow = !preset.sun; // one shadow light: the sun when it is up
    porch.shadow.mapSize.set(1024, 1024);
    porch.shadow.bias = -0.0008;
    porch.shadow.camera.near = 0.1;
    porch.shadow.camera.far = 30;
    world.add(porch, porch.target);
  }

  // Street lamps: a pole, an arm, and a head over the street.
  lampLens.emissive.set(preset.street ? 0xffe2b0 : 0x000000);
  lampLens.emissiveIntensity = 4;
  for (const { foot, head } of view.streetLamps) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, head.y, 10), pole);
    post.position.set(foot.x, head.y / 2, foot.z);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, Math.abs(head.z - foot.z) + 0.1), pole);
    arm.position.set(foot.x, head.y, (foot.z + head.z) / 2);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.5), lampHead);
    cap.position.copy(head);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.42), lampLens);
    lens.position.copy(head).add(new THREE.Vector3(0, -0.07, 0));
    world.add(post, arm, cap, lens);
    if (preset.street) {
      const lamp = new THREE.PointLight(0xffd9a8, preset.street, 30, 2);
      lamp.position.copy(head).add(new THREE.Vector3(0, -0.3, 0));
      world.add(lamp);
    }
  }

  M.glassLit.emissive.set(preset.windows ? 0xffb866 : 0x000000);
  M.glassLit.emissiveIntensity = preset.windows;

  // IR illuminator: LEDs on the doorbell, aimed where the camera looks. The
  // light falls off with the square of the distance.
  let ir: THREE.SpotLight | null = null;
  if (preset.ir) {
    ir = new THREE.SpotLight(0xffffff, 0, 0, 1.3, 0.5, 2);
    ir.position.copy(view.doorbell).add(new THREE.Vector3(0, 0, 0.05));
    ir.target.position.copy(view.target);
    world.add(ir, ir.target);
  }

  const { background, environment } = sky(renderer, light, preset);
  return { background, backgroundIntensity: preset.sky.brightness, environment, environmentIntensity: preset.ambient, exposure: preset.exposure, ir };
}

// IR light intensity while the doorbell image is drawn, cd.
export const IR_INTENSITY = 10;
