// Three.js (browser): the world for one scenario, and the doorbell camera.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Delivery } from "./delivery";
import { HOUSES } from "./houses";
import { buildLights } from "./lights";
import { makeBody } from "./people";
import { buildProps } from "./props";
import { applySurfaces } from "./surfaces";
import { OVERCAST, buildWeather, weatherMaterials } from "./weather";
import { jitter } from "./random";
import type { Settings } from "./settings";

export function buildWorld(settings: Settings, renderer: THREE.WebGLRenderer) {
  const world = new THREE.Group();
  const house = HOUSES.find((h) => h.id === settings.house)!;
  const view = house.build(world);
  const lighting = buildLights(renderer, world, view, settings.light, OVERCAST[settings.weather]);
  const time = { value: 0 }; // the weather shaders read it
  weatherMaterials(world, settings.weather, time);
  buildProps(world, view, settings.occlusion);
  applySurfaces(world, settings.surfaces);
  mergeStatic(world);
  const weather = buildWeather(world, view, lighting, settings.weather, settings.seed, time);
  const body = makeBody(settings.person, settings.speed === "run", jitter(settings.seed, "person"));
  const delivery = new Delivery(view.route, view.drop, body, settings.speed, jitter(settings.seed, "delivery"));
  world.add(delivery.root);
  world.traverse((object) => {
    if (object instanceof THREE.Mesh && !(object.material instanceof THREE.ShaderMaterial)) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return { world, house, view, delivery, lighting, weather };
}

// Merges the static meshes that share a material into one mesh. A house has
// hundreds of small boxes; one draw call per material keeps the frame inside
// the browser budget.
function mergeStatic(world: THREE.Group) {
  world.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  world.traverse((object) => {
    // A mesh with several materials (the car) stays as it is.
    if (object instanceof THREE.Mesh && !Array.isArray(object.material)) meshes.push(object);
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
