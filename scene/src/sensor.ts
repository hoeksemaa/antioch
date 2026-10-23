// Three.js (browser): the doorbell camera's sensor pass. The scene renders
// into an HDR target, then one full-screen shader makes the image that the
// camera records. It runs only for the doorbell image, and only when an effect
// is on (the v1 scene draws straight to the screen).
//
// Effects: IR monochrome (light axis).

import * as THREE from "three";

export interface SensorOptions {
  mono: boolean; // IR: the image is gray
}

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
  varying vec2 vUv;
  void main() {
    vec3 color = texture2D(tScene, vUv).rgb;
    // Silicon sees near-IR; a gray image weights the channels about evenly.
    float gray = dot(color, vec3(0.3, 0.45, 0.25));
    color = mix(color, vec3(gray), mono);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Sensor {
  private readonly target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  private readonly material = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: this.target.texture }, mono: { value: 0 } },
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
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (this.target.width !== width || this.target.height !== height) this.target.setSize(width, height);
    this.material.uniforms.mono.value = options.mono ? 1 : 0;

    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.setViewport(rect.x, rect.y, rect.width, rect.height);
    renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
    renderer.render(this.quad, this.camera);
  }
}
