// Three.js (browser): the doorbell camera's sensor pass. The scene renders
// into an HDR target, then one full-screen shader makes the image that the
// camera records. It runs only for the doorbell image, and only when an effect
// is on (the v1 scene draws straight to the screen).
//
// Effects:
// - IR monochrome (light axis).
// - Fisheye camera (camera axis, ring): fisheye lens, auto exposure, noise,
//   vignette, lens softness, compression, bloom, lens flare, and rain drops on
//   the lens (weather axis).
// Every effect is a function of the frame and the time t only (no state from
// earlier frames), so a frame at time t is the same on every run.

import * as THREE from "three";
import { LENS_K, TAN_ALPHA } from "./camera";

export interface SensorOptions {
  mono: boolean; // IR: the image is gray
  ring: boolean; // the ring camera's lens and sensor effects
  time: number; // s; the noise changes on each video frame
  flares: THREE.Vector2[]; // up to 4 bright lights in the image, -1 to 1 with y up
  drops: boolean; // rain drops on the lens
  seed: number; // places the drops
}

const FLARES = 4;
const SUPERSAMPLE = 1.5; // ring: the source render, in output pixels

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tScene;
  uniform float mono;
  uniform float ring;
  uniform float lensK;
  uniform float tanAlpha;
  uniform float maxLod;
  uniform vec2 outSize; // output image, px
  uniform float frame; // video frame number, for the noise
  uniform vec3 flares[${FLARES}]; // xy: position (0..1), z: 1 if present
  uniform float drops;
  uniform float dropSeed;
  varying vec2 vUv;

  // Output image (0..1) to the source render (0..1): stereographic fisheye.
  vec2 lens(vec2 uv) {
    if (ring < 0.5) return uv;
    vec2 p = uv * 2.0 - 1.0;
    float r = length(p);
    if (r < 1e-5) return vec2(0.5);
    float theta = 2.0 * atan(r * lensK);
    return p / r * tan(theta) / tanAlpha * 0.5 + 0.5;
  }

  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

  float hash(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  // About normal noise with mean 0 and deviation 1.
  float gauss(vec3 p) {
    return (hash(p) + hash(p + 17.1) + hash(p + 41.7) - 1.5) * 2.0;
  }

  // Scene light at a source point, gray for IR.
  vec3 sampleScene(vec2 uv, float lod) {
    vec3 c = textureLod(tScene, uv, lod).rgb;
    return mix(c, vec3(dot(c, vec3(0.3, 0.45, 0.25))), mono);
  }

  // Rain drops on the lens: each drop shows a small, flipped, blurred image
  // of what is behind it. Returns the image point to sample, and the drop
  // mask in z.
  vec3 lensDrops(vec2 uv) {
    vec3 hit = vec3(uv, 0.0);
    if (drops < 0.5) return hit;
    float cells = 6.0;
    vec2 cell = floor(uv * cells);
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        vec2 c = cell + vec2(i, j);
        if (hash(vec3(c, dropSeed)) > 0.3) continue;
        vec2 center = (c + vec2(hash(vec3(c, dropSeed + 1.0)), hash(vec3(c, dropSeed + 2.0)))) / cells;
        float radius = 0.02 + 0.035 * hash(vec3(c, dropSeed + 3.0));
        vec2 d = uv - center;
        float r = length(d) / radius;
        float m = 1.0 - r * r;
        if (r < 1.0 && m > hit.z) hit = vec3(mix(uv, center - d * 0.4, smoothstep(0.0, 0.7, m)), m);
      }
    }
    return hit;
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r2 = dot(p, p);
    vec3 drop = lensDrops(vUv);
    vec2 uv = lens(drop.xy);

    if (ring < 0.5) {
      gl_FragColor = linearToOutputTexel(vec4(toneMapping(sampleScene(uv, 0.0)), 1.0));
      return;
    }

    // Auto exposure: center-weighted mean of a 3 × 3 grid from a small mip.
    // Each sample is capped, so the sun or a lamp does not black out the image.
    float lod = max(maxLod - 3.0, 0.0);
    float sum = 0.0;
    float weights = 0.0;
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        float w = (i == 0 && j == 0) ? 4.0 : 1.0;
        sum += w * min(luma(textureLod(tScene, vec2(0.5) + vec2(i, j) * 0.25, lod).rgb), 2.0);
        weights += w;
      }
    }
    float gain = clamp(0.12 / max(sum / weights, 1e-4), 0.5, 8.0);
    float dark = smoothstep(1.5, 8.0, gain); // 0 in good light, 1 in very low light

    // Lens softness grows toward the edges. Chroma at half resolution.
    float soft = 0.35 + 0.9 * r2 + 3.0 * smoothstep(0.0, 0.3, drop.z);
    vec3 sharp = sampleScene(uv, soft) * gain;
    vec2 half2 = (floor(vUv * outSize / 2.0) + 0.5) * 2.0 / outSize;
    vec3 coarse = sampleScene(lens(lensDrops(half2).xy), soft + 1.0) * gain;

    // Bloom: bright parts spread light.
    vec3 bloom = vec3(0.0);
    for (int k = 2; k <= 5; k++) {
      bloom += max(sampleScene(uv, soft + float(k)) * gain - 1.0, 0.0) * 0.12;
    }

    // Lens flare: ghosts on the line from each bright light through the
    // center, and a short horizontal streak. A light behind something gives
    // no flare, because its pixel is dark.
    vec3 flare = vec3(0.0);
    for (int i = 0; i < ${FLARES}; i++) {
      if (flares[i].z < 0.5) continue;
      vec2 f = flares[i].xy;
      float raw = luma(sampleScene(lens(f), 1.0));
      float strength = smoothstep(3.0, 30.0, raw * gain);
      if (strength <= 0.0) continue;
      float ghosts = 0.008 + 0.072 * smoothstep(20.0, 200.0, raw); // the sun: strong ghosts; a lamp: faint ones
      vec2 fp = f * 2.0 - 1.0;
      for (int g = 0; g < 4; g++) {
        float s = g == 0 ? -0.35 : g == 1 ? -0.7 : g == 2 ? 0.45 : -1.25;
        float size = g == 0 ? 0.05 : g == 1 ? 0.11 : g == 2 ? 0.03 : 0.2;
        float d = length(p - fp * s);
        flare += vec3(1.0, 0.75, 0.5) * smoothstep(size, size * 0.6, d) * ghosts * strength;
      }
      vec2 dq = p - fp;
      flare += vec3(1.0, 0.85, 0.7) * exp(-abs(dq.y) * 140.0) * exp(-abs(dq.x) * (3.0 + 6.0 * (1.0 - ghosts / 0.08))) * 0.6 * strength;
    }

    vec3 color = toneMapping(sharp + bloom + flare);
    vec3 chroma = toneMapping(coarse + bloom + flare);
    color = vec3(luma(color)) + (chroma - vec3(luma(chroma)));

    // Compression: in low light, 8 × 8 blocks go flat.
    vec2 block = floor(vUv * outSize / 8.0);
    vec3 flat8 = toneMapping(sampleScene(lens((block + 0.5) * 8.0 / outSize), log2(8.0 * ${SUPERSAMPLE.toFixed(1)})) * gain);
    color = mix(color, flat8, 0.3 * dark);

    // Sensor noise, more at high gain. In low light, compression turns some
    // of it into blotches, one value for each block.
    vec3 seed = vec3(floor(vUv * outSize), frame);
    float sigma = 0.012 + 0.05 * dark;
    float n = mix(gauss(seed), gauss(vec3(block * 8.0, frame + 0.5)), 0.35 * dark);
    vec3 grain = vec3(n) + vec3(gauss(seed + 3.3), gauss(seed + 5.7), gauss(seed + 9.1)) * 0.35 * (1.0 - mono);
    color = pow(max(color, 0.0), vec3(1.0 / 2.2));
    color += grain * sigma;
    color *= 1.0 - 0.16 * r2; // vignette
    color *= 1.0 - 0.12 * smoothstep(0.0, 0.2, drop.z) * (1.0 - smoothstep(0.2, 0.5, drop.z)); // drop rims
    color = pow(max(color, 0.0), vec3(2.2));
    gl_FragColor = linearToOutputTexel(vec4(color, 1.0));
  }
`;

export class Sensor {
  private readonly target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  private readonly material = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: this.target.texture },
      mono: { value: 0 },
      ring: { value: 0 },
      lensK: { value: LENS_K },
      tanAlpha: { value: TAN_ALPHA },
      maxLod: { value: 0 },
      outSize: { value: new THREE.Vector2() },
      frame: { value: 0 },
      flares: { value: Array.from({ length: FLARES }, () => new THREE.Vector3()) },
      drops: { value: 0 },
      dropSeed: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
  private readonly camera = new THREE.OrthographicCamera();

  // Draws the scene through the sensor into rect (CSS px, from the bottom
  // left), the same rect that setViewport takes.
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    rect: { x: number; y: number; width: number; height: number },
    options: SensorOptions,
  ) {
    const ratio = renderer.getPixelRatio();
    const scale = options.ring ? SUPERSAMPLE : 1;
    const outWidth = Math.max(1, Math.round(rect.width * ratio));
    const outHeight = Math.max(1, Math.round(rect.height * ratio));
    const width = Math.min(2048, Math.round(outWidth * scale));
    const height = Math.min(2048, Math.round(outHeight * scale));
    if (this.target.width !== width || this.target.height !== height) this.target.setSize(width, height);

    const u = this.material.uniforms;
    u.mono.value = options.mono ? 1 : 0;
    u.ring.value = options.ring ? 1 : 0;
    u.maxLod.value = Math.floor(Math.log2(Math.max(width, height)));
    u.outSize.value.set(outWidth, outHeight);
    u.frame.value = Math.floor(options.time * 30);
    u.drops.value = options.drops ? 1 : 0;
    u.dropSeed.value = options.seed % 1000;
    u.flares.value.forEach((f: THREE.Vector3, i: number) => {
      const p = options.flares[i];
      f.set(p ? (p.x + 1) / 2 : 0, p ? (p.y + 1) / 2 : 0, p ? 1 : 0);
    });

    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.setViewport(rect.x, rect.y, rect.width, rect.height);
    renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
    renderer.render(this.quad, this.camera);
  }
}
