// Three.js (browser): the weather axis. Clear, rain, snow, fog, and wind (a
// windy fall day).
// - The weather swaps materials on its own copies (wet ground, snow, windy
//   leaves) before the static meshes merge, so the v1 materials never change.
// - Rain, snow, and leaves are one particle draw each, moved in the vertex
//   shader from the time t and the seed, so a frame is the same on every run.
// - Budget: one particle draw per view, not in the shadow pass. Fog is free.

import * as THREE from "three";
import type { HouseView } from "./houses";
import { IR_INTENSITY, type Lighting } from "./lights";
import { M } from "./parts";
import { stream } from "./random";

export type Weather = "clear" | "rain" | "snow" | "fog" | "wind";

// How much each weather dims the sun and fills the sky with clouds.
export const OVERCAST: Record<Weather, number> = { clear: 0, rain: 0.85, snow: 0.75, fog: 0.6, wind: 0.25 };

export interface WeatherState {
  update(t: number): void; // before each frame
  fog: THREE.FogExp2 | null;
  overcastSky: boolean; // the background is a flat gray sky (the haze color)
  lensDrops: boolean; // rain on the doorbell lens (ring camera)
}

type Swap = Map<THREE.Material, THREE.Material>;

// A changed copy. userData.darken tells the textured surfaces how much darker
// the copy is; a snow-covered copy loses its surface tag (no texture).
function variant(material: THREE.MeshStandardMaterial, change: { color?: number; mix?: number; roughness?: number; darken?: number }) {
  const m = material.clone();
  if (change.darken) {
    m.color.multiplyScalar(change.darken);
    m.userData.darken = change.darken;
  }
  if (change.color !== undefined) {
    m.color.lerp(new THREE.Color(change.color), change.mix ?? 1);
    delete m.userData.surface;
  }
  if (change.roughness !== undefined) m.roughness = change.roughness;
  return m;
}

// Wet ground: darker and glossy.
function wet(): Swap {
  return new Map<THREE.Material, THREE.Material>([
    [M.concrete, variant(M.concrete, { darken: 0.55, roughness: 0.3 })],
    [M.asphalt, variant(M.asphalt, { darken: 0.6, roughness: 0.15 })],
    [M.deck, variant(M.deck, { darken: 0.6, roughness: 0.35 })],
    [M.lawn, variant(M.lawn, { darken: 0.75, roughness: 0.6 })],
    [M.paint, variant(M.paint, { darken: 0.8, roughness: 0.3 })],
  ]);
}

// Snow on the lawn, the roofs, and the bushes. The paths are shoveled.
function snowy(): Swap {
  return new Map<THREE.Material, THREE.Material>([
    [M.lawn, variant(M.lawn, { color: 0xf1f4f8, roughness: 0.9 })],
    [M.roof, variant(M.roof, { color: 0xe9edf2, roughness: 0.9 })],
    [M.leaf, variant(M.leaf, { color: 0xe4e9ee, mix: 0.6 })],
    [M.concrete, variant(M.concrete, { darken: 0.7, roughness: 0.4 })],
    [M.asphalt, variant(M.asphalt, { darken: 0.75, roughness: 0.3 })],
  ]);
}

// Leaves and bushes sway in the wind. The same shader code runs in the shadow
// pass, so the shadows move too.
function sway(material: THREE.Material, time: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vec4 wp = modelMatrix * vec4(transformed, 1.0);
      float h = clamp((wp.y - 0.3) / 3.0, 0.0, 1.0);
      float ph = dot(wp.xz, vec2(0.37, 0.21));
      transformed.x += h * (0.14 * sin(uTime * 1.6 + ph) + 0.05 * sin(uTime * 4.1 + ph * 2.3));
      transformed.z += h * 0.07 * sin(uTime * 2.2 + ph * 1.4);`,
    );
  };
  material.customProgramCacheKey = () => "sway";
  return material;
}

// One draw of many small quads. Each quad's place comes from a random vec4
// and the time, in the vertex shader.
function particles(o: {
  count: number;
  center: THREE.Vector3;
  size: THREE.Vector3;
  fall: number; // m/s down
  drift: number; // m/s along +x (wind)
  wobble: number; // m
  width: number;
  length: number;
  facing: boolean; // true: quads face the camera (flakes, leaves); false: upright streaks (rain)
  colors: number[];
  alpha: number;
  random: () => number;
  level: number;
  doorbell: THREE.Vector3;
  ir: THREE.SpotLight | null;
  time: { value: number };
}) {
  const corners = [-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 0, 0.5, 1, -0.5, 1];
  const corner = new Float32Array(o.count * 12);
  const drop = new Float32Array(o.count * 24);
  const color = new Float32Array(o.count * 18);
  const c = new THREE.Color();
  for (let i = 0; i < o.count; i++) {
    const r = [o.random(), o.random(), o.random(), o.random()];
    c.set(o.colors[Math.floor(o.random() * o.colors.length)]);
    for (let k = 0; k < 6; k++) {
      corner.set([corners[k * 2], corners[k * 2 + 1]], (i * 6 + k) * 2);
      drop.set(r, (i * 6 + k) * 4);
      color.set([c.r, c.g, c.b], (i * 6 + k) * 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(o.count * 18), 3)); // unused; three needs it
  geometry.setAttribute("corner", new THREE.BufferAttribute(corner, 2));
  geometry.setAttribute("drop", new THREE.BufferAttribute(drop, 4));
  geometry.setAttribute("tint", new THREE.BufferAttribute(color, 3));
  geometry.boundingSphere = new THREE.Sphere(o.center, o.size.length());

  const uniforms = {
    uTime: o.time,
    uCenter: { value: o.center },
    uSize: { value: o.size },
    uFall: { value: o.fall },
    uDrift: { value: o.drift },
    uWobble: { value: o.wobble },
    uWidth: { value: o.width },
    uLength: { value: o.length },
    uFacing: { value: o.facing ? 1 : 0 },
    uLevel: { value: o.level },
    uAlpha: { value: o.alpha },
    uDoorbell: { value: o.doorbell },
    uIr: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      attribute vec4 drop;
      attribute vec3 tint;
      uniform float uTime, uFall, uDrift, uWobble, uWidth, uLength, uFacing, uIr;
      uniform vec3 uCenter, uSize, uDoorbell;
      varying vec2 vCorner;
      varying vec3 vTint;
      varying float vGlow;
      varying float vFade;
      void main() {
        vec3 lo = uCenter - uSize * 0.5;
        vec3 p = lo + drop.xyz * uSize;
        p.y = lo.y + mod(drop.y * uSize.y - uFall * uTime, uSize.y);
        p.x = lo.x + mod(drop.x * uSize.x + uDrift * uTime, uSize.x);
        float w = drop.w * 6.2832;
        p.x += uWobble * sin(uTime * 1.3 + w);
        p.z += uWobble * cos(uTime * 1.1 + w * 1.7);
        p.y += uWobble * 0.5 * sin(uTime * 2.3 + w * 2.9) * step(0.5, uFacing) * step(uFall, 0.01);
        vec3 toCam = normalize(cameraPosition - p);
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
        vec3 up = mix(vec3(0.0, 1.0, 0.0), normalize(cross(toCam, right)), uFacing);
        float spin = uFacing * (uTime * 3.0 + w);
        vec2 q = vec2(corner.x, corner.y - 0.5);
        q = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * q;
        vec3 pos = p + right * q.x * uWidth + up * q.y * uLength;
        // IR backscatter: drops near the doorbell's IR light glow.
        float d = distance(p, uDoorbell);
        vGlow = uIr * 3.0 / (1.0 + 2.0 * d * d);
        // Far drops are thinner than a pixel; they fade out instead of flickering.
        vFade = 1.0 - smoothstep(8.0, 22.0, distance(p, cameraPosition));
        vCorner = corner;
        vTint = tint;
        gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uLevel, uAlpha, uFacing;
      varying vec2 vCorner;
      varying vec3 vTint;
      varying float vGlow;
      varying float vFade;
      void main() {
        float edge = 1.0 - abs(vCorner.x) * 2.0;
        float ends = sin(vCorner.y * 3.1416);
        float round = smoothstep(0.5, 0.3, length(vec2(vCorner.x, vCorner.y - 0.5)));
        float a = mix(edge * ends, round, uFacing) * uAlpha * vFade;
        gl_FragColor = vec4(vTint * (uLevel + vGlow), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;
  // The IR light is on only while the doorbell image is drawn.
  mesh.onBeforeRender = () => {
    uniforms.uIr.value = o.ir ? o.ir.intensity / IR_INTENSITY : 0;
  };
  return mesh;
}

// Swaps materials for the weather. Runs before the static meshes merge.
export function weatherMaterials(world: THREE.Group, weather: Weather, time: { value: number }) {
  const swap: Swap = weather === "rain" ? wet() : weather === "snow" ? snowy() : new Map();
  if (weather === "wind") {
    swap.set(M.leaf, sway(variant(M.leaf, { color: 0xb5651d, mix: 0.55 }), time));
  }
  if (!swap.size) return;
  world.traverse((object) => {
    if (object instanceof THREE.Mesh && swap.has(object.material)) object.material = swap.get(object.material)!;
  });
}

// Adds the particles and fog for the weather. Runs after the merge.
export function buildWeather(world: THREE.Group, view: HouseView, lighting: Lighting, weather: Weather, seed: number, time: { value: number }): WeatherState {
  const random = stream(seed, "weather");
  // The particle box covers what the doorbell sees, from the door to past the street.
  const center = new THREE.Vector3(view.doorbell.x, 6, view.doorbell.z + 12);
  const common = { random, level: lighting.level, doorbell: view.doorbell, ir: lighting.ir, time, center };

  // Swaying leaves also need the sway in their shadow-pass material.
  world.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material.customProgramCacheKey?.() === "sway") {
      object.customDepthMaterial = sway(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), time);
    }
  });

  if (weather === "rain") {
    world.add(particles({ ...common, count: 16000, size: new THREE.Vector3(40, 14, 26), fall: 9, drift: 0.6, wobble: 0, width: 0.02, length: 0.5, facing: false, colors: [0xc8d2dc], alpha: 0.55 }));
  } else if (weather === "snow") {
    world.add(particles({ ...common, count: 7000, size: new THREE.Vector3(40, 14, 26), fall: 1.1, drift: 0.3, wobble: 0.35, width: 0.05, length: 0.05, facing: true, colors: [0xffffff, 0xeef3f8], alpha: 0.9 }));
  } else if (weather === "wind") {
    const low = center.clone().setY(0.8);
    world.add(particles({ ...common, center: low, count: 300, size: new THREE.Vector3(40, 1.5, 26), fall: 0, drift: 3.5, wobble: 0.4, width: 0.09, length: 0.07, facing: true, colors: [0xb5651d, 0xd4a017, 0x8b4513, 0xc0392b], alpha: 1 }));
  }

  const fog = weather === "fog" ? new THREE.FogExp2(lighting.haze.getHex(), 0.055) : null;
  return {
    update(t) {
      time.value = t;
    },
    fog,
    overcastSky: weather === "rain" || weather === "snow" || weather === "fog",
    lensDrops: weather === "rain",
  };
}
