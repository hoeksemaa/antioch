import * as THREE from "three";
import type { House, HouseView } from "./houses";

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

export function buildWorld(house: House) {
  const world = new THREE.Group();
  const view = house.build(world);
  world.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return { world, view };
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
