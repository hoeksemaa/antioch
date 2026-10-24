// Three.js (browser): the occlusion axis. Things that stand between the
// doorbell and the walk:
// - bins: two curbside wheelie bins (built here).
// - car: a parked sedan (Quaternius Realistic Car Pack, CC0, OBJ in
//   scene/public/props/). In the no-porch house's driveway it hides the
//   approach; at the other houses it is parked at the curb.
// Each house gives the spots (HouseView.bins, HouseView.car).

import * as THREE from "three";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import type { HouseView } from "./houses";
import { mat } from "./parts";

export type Occlusion = "none" | "bins" | "car";

let car: Promise<THREE.Group> | null = null;
let carModel: THREE.Group | null = null;

// The car's OBJ materials as standard (PBR) materials. Glass is dark and glossy.
function standard(source: THREE.MeshPhongMaterial) {
  const name = source.name.toLowerCase();
  const glass = name.includes("window");
  const light = name.includes("light");
  return new THREE.MeshStandardMaterial({
    name: source.name,
    color: source.color,
    roughness: glass ? 0.08 : light ? 0.3 : 0.35,
    metalness: glass ? 0.2 : name === "black" ? 0 : 0.3,
  });
}

// Loads a car model (about 130 KB, once).
export function loadCar(name: string) {
  const base = `${import.meta.env.BASE_URL}props/`;
  return (async () => {
    const materials = await new MTLLoader().setPath(base).loadAsync(`${name}.mtl`);
    materials.preload();
    const model = await new OBJLoader().setMaterials(materials).setPath(base).loadAsync(`${name}.obj`);
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.material = Array.isArray(object.material) ? object.material.map(standard) : standard(object.material);
      }
    });
    // The sedan model is 1.18 m high; a real sedan is about 1.45 m.
    if (name === "NormalCar1") model.scale.set(1, 1.22, 1.05);
    return model;
  })();
}

// Loads the files that the occlusion needs. Call it before buildProps.
export async function prepareProps(occlusion: Occlusion) {
  if (occlusion !== "car") return;
  car ??= loadCar("NormalCar1");
  carModel = await car;
}

const binBody = [mat(0x2f4a35, 0.55), mat(0x2d4f8a, 0.55)]; // trash, recycling
const binWheel = mat(0x151515, 0.8);

// A wheelie bin: a tapered body, a lid, a handle, and two wheels. The front
// (+z) faces the street.
function wheelieBin(material: THREE.Material) {
  const bin = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.34, 0.95, 4, 1), material);
  body.rotation.y = Math.PI / 4;
  body.scale.set(1, 1, 1.25);
  body.position.y = 0.5;
  bin.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.78), material);
  lid.position.set(0, 1.0, 0.0);
  bin.add(lid);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.05), binWheel);
  handle.position.set(0, 0.96, -0.4);
  bin.add(handle);
  for (const x of [-0.25, 0.25]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 14), binWheel);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.1, -0.34);
    bin.add(wheel);
  }
  return bin;
}

// Adds the occluders. Runs before the static meshes merge (they do not move).
export function buildProps(world: THREE.Group, view: HouseView, occlusion: Occlusion) {
  if (occlusion === "bins") {
    view.bins.forEach(([x, z, angle], i) => {
      const bin = wheelieBin(binBody[i % 2]);
      bin.position.set(x, 0, z);
      bin.rotation.y = angle;
      world.add(bin);
    });
  } else if (occlusion === "car" && carModel) {
    const [x, z, heading] = view.car;
    const parked = carModel.clone();
    parked.position.set(x, 0, z);
    parked.rotation.y = heading;
    world.add(parked);
  }
}
