// Three.js (browser): lights, the world for one house, and the doorbell camera.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Delivery } from "./delivery";
import { HOUSES, type HouseView } from "./houses";
import { jitter } from "./random";
import type { Settings } from "./settings";

export function addLights(scene: THREE.Scene) {
  scene.background = new THREE.Color(0xa9c9e8);
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x7a7466, 1.4));

  const sun = new THREE.DirectionalLight(0xfff4e0, 2.8);
  sun.position.set(-12, 18, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 70 });
  scene.add(sun);
}

export function buildWorld(settings: Settings) {
  const world = new THREE.Group();
  const house = HOUSES.find((h) => h.id === settings.house)!;
  const view = house.build(world);
  mergeStatic(world);
  const delivery = new Delivery(view.route, view.drop, jitter(settings.seed, "delivery"));
  world.add(delivery.root);
  world.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return { world, house, view, delivery };
}

// Merges the static meshes that share a material into one mesh. A house has
// hundreds of small boxes; one draw call per material keeps the frame inside
// the browser budget.
function mergeStatic(world: THREE.Group) {
  world.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  world.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const mesh of meshes) {
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    for (const name of Object.keys(geometry.attributes)) {
      if (!["position", "normal", "uv"].includes(name)) geometry.deleteAttribute(name);
    }
    geometry.clearGroups();
    const material = mesh.material as THREE.Material;
    byMaterial.set(material, [...(byMaterial.get(material) ?? []), geometry]);
    mesh.geometry.dispose();
    mesh.removeFromParent();
  }
  for (const [material, geometries] of byMaterial) {
    world.add(new THREE.Mesh(mergeGeometries(geometries), material));
    for (const geometry of geometries) geometry.dispose();
  }
}

// A wide 16:9 camera on the front face of the doorbell. Real doorbells use a
// fisheye lens; this is a plain perspective camera for now.
export function doorbellCamera(view: HouseView) {
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 150);
  camera.position.set(view.doorbell.x, view.doorbell.y, view.doorbell.z + 0.02);
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  return camera;
}
