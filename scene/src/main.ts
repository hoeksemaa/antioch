import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { HOUSES, type House } from "./houses";
import { addLights, buildWorld, doorbellCamera } from "./scene";
import "./style.css";

// ?house=<id> picks the house. ?view=doorbell shows only the doorbell camera,
// with no overlays.
const params = new URLSearchParams(location.search);
const clean = params.get("view") === "doorbell";
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
addLights(scene);

const overview = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
const controls = new OrbitControls(overview, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;

let world: THREE.Group | undefined;
let doorbell!: THREE.PerspectiveCamera;
let frustum!: THREE.CameraHelper;

const houseButtons = document.getElementById("houses")!;

function load(house: House) {
  if (world) {
    scene.remove(world);
    world.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    scene.remove(frustum);
    frustum.dispose();
  }
  const built = buildWorld(house);
  world = built.world;
  scene.add(world);
  doorbell = doorbellCamera(built.view);

  // Shows the doorbell's field of view in the overview. A short copy of the
  // camera keeps the drawn frustum near the house.
  const short = doorbell.clone();
  short.far = 3;
  short.updateProjectionMatrix();
  frustum = new THREE.CameraHelper(short);
  const yellow = new THREE.Color(0xffcc33);
  frustum.setColors(yellow, yellow, yellow, yellow, yellow);
  scene.add(frustum);

  overview.position.copy(built.view.eye);
  controls.target.copy(built.view.focus);
  controls.update();

  for (const button of houseButtons.querySelectorAll("button")) {
    button.classList.toggle("active", button.dataset.house === house.id);
  }
  params.set("house", house.id);
  history.replaceState(null, "", `?${params}`);
}

HOUSES.forEach((house, i) => {
  const button = document.createElement("button");
  button.dataset.house = house.id;
  button.textContent = `${i + 1} ${house.name}`;
  button.addEventListener("click", () => load(house));
  houseButtons.append(button);
});

load(HOUSES.find((house) => house.id === params.get("house")) ?? HOUSES[0]);

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
  const house = HOUSES[Number(event.key) - 1];
  if (house) load(house);
  if (clean || event.key.toLowerCase() !== "v") return;
  mode = mode === "overview" ? "doorbell" : "overview";
  document.body.classList.toggle("doorbell", mode === "doorbell");
});

renderer.setAnimationLoop(render);
