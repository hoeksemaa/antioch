import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildScene, doorbellCamera } from "./porch";
import "./style.css";

// ?view=doorbell shows only the doorbell camera, with no overlays.
const clean = new URLSearchParams(location.search).get("view") === "doorbell";
let mode: "overview" | "doorbell" = clean ? "doorbell" : "overview";
document.body.classList.toggle("clean", clean);
document.body.classList.toggle("doorbell", mode === "doorbell");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setScissorTest(true);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
buildScene(scene);

const doorbell = doorbellCamera();

// Shows the doorbell's field of view in the overview. A short copy of the
// camera keeps the drawn frustum near the porch.
const frustumCamera = doorbell.clone();
frustumCamera.far = 3;
frustumCamera.updateProjectionMatrix();
const frustum = new THREE.CameraHelper(frustumCamera);
frustum.setColors(
  new THREE.Color(0xffcc33),
  new THREE.Color(0xffcc33),
  new THREE.Color(0xffcc33),
  new THREE.Color(0xffcc33),
  new THREE.Color(0xffcc33),
);
scene.add(frustum);

const overview = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
overview.position.set(6, 5.5, 16);
const controls = new OrbitControls(overview, renderer.domElement);
controls.target.set(0, 1.2, 3);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.update();

const inset = document.getElementById("inset")!;

// The largest 16:9 rectangle that fits in w × h, centered.
function fit16x9(w: number, h: number) {
  const width = Math.min(w, (h * 16) / 9);
  const height = (width * 9) / 16;
  return { x: (w - width) / 2, y: (h - height) / 2, width, height };
}

function draw(camera: THREE.Camera, x: number, y: number, width: number, height: number) {
  renderer.setViewport(x, y, width, height);
  renderer.setScissor(x, y, width, height);
  renderer.render(scene, camera);
}

function render() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setScissor(0, 0, w, h);
  renderer.clear();

  if (mode === "doorbell") {
    const r = fit16x9(w, h);
    frustum.visible = false;
    draw(doorbell, r.x, r.y, r.width, r.height);
    return;
  }

  controls.update();
  overview.aspect = w / h;
  overview.updateProjectionMatrix();
  frustum.visible = true;
  draw(overview, 0, 0, w, h);

  // Doorbell inset in the bottom-right corner. WebGL counts y from the bottom.
  const margin = 16;
  const width = Math.round(Math.min(480, Math.max(180, w * 0.32)));
  const height = Math.round((width * 9) / 16);
  frustum.visible = false;
  draw(doorbell, w - width - margin, margin, width, height);
  Object.assign(inset.style, {
    right: `${margin}px`,
    bottom: `${margin}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
}

window.addEventListener("resize", () => renderer.setSize(window.innerWidth, window.innerHeight));
window.addEventListener("keydown", (event) => {
  if (clean || event.key.toLowerCase() !== "v") return;
  mode = mode === "overview" ? "doorbell" : "overview";
  document.body.classList.toggle("doorbell", mode === "doorbell");
});

renderer.setAnimationLoop(render);
