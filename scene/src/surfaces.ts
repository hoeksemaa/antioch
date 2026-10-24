// Three.js (browser): the surfaces axis. flat is the v1 look (one color for
// each material). textured gives each tagged material (userData.surface, see
// parts.ts) CC0 Poly Haven textures: a 1K color map, and 512 px normal and
// AO/roughness/metal (ARM) maps, in scene/public/surfaces/.
//
// UVs are set in meters before the static meshes merge, so a tile has the same
// size on every wall. The merge keeps one draw call per material.

import * as THREE from "three";
import type { SurfaceKind } from "./parts";

export type Surfaces = "flat" | "textured";

interface Look {
  tile: number; // m for one repeat of the texture
  // The textured material's color, from the flat color.
  color: (flat: THREE.Color) => THREE.Color;
}

const white = () => new THREE.Color(0xffffff);
const LOOKS: Record<SurfaceKind, Look> = {
  siding: { tile: 1.6, color: (c) => c.clone().multiplyScalar(1.45) }, // light gray boards, painted the house color
  brick: { tile: 1.4, color: (c) => white().lerp(c, 0.45) },
  stone: { tile: 1.8, color: () => white() },
  roof: { tile: 2.0, color: (c) => white().lerp(c, 0.5) },
  deck: { tile: 1.6, color: (c) => c.clone().multiplyScalar(1.6) },
  walk: { tile: 2.4, color: () => white().multiplyScalar(1.15) },
  foundation: { tile: 2.0, color: () => white().multiplyScalar(0.9) },
  asphalt: { tile: 4.0, color: () => white() },
  lawn: { tile: 2.5, color: () => new THREE.Color(0.62, 1.05, 0.4) }, // the texture is dry grass; this makes it a green lawn
};

const KINDS = Object.keys(LOOKS) as SurfaceKind[];
type Maps = Map<SurfaceKind, { color: THREE.Texture; normal: THREE.Texture; arm: THREE.Texture }>;
const loader = new THREE.TextureLoader();
let maps: Promise<Maps> | null = null;
let ready: Maps | null = null;

// Loads the textures (about 3 MB, once). Call it before applySurfaces.
export async function prepareSurfaces(surfaces: Surfaces, renderer: THREE.WebGLRenderer) {
  if (surfaces === "flat") return;
  maps ??= (async () => {
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const load = async (file: string, srgb: boolean) => {
      const t = await loader.loadAsync(`${import.meta.env.BASE_URL}surfaces/${file}.webp`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = anisotropy;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const entries = await Promise.all(
      KINDS.map(async (kind) => {
        const [color, normal, arm] = await Promise.all([load(`${kind}_color`, true), load(`${kind}_normal`, false), load(`${kind}_arm`, false)]);
        for (const t of [color, normal, arm]) t.repeat.setScalar(1 / LOOKS[kind].tile);
        return [kind, { color, normal, arm }] as const;
      }),
    );
    return new Map(entries);
  })();
  ready = await maps;
}

// UVs in meters for the box and plane geometry that the houses use.
function meterUvs(geometry: THREE.BufferGeometry) {
  const uv = geometry.attributes.uv;
  if (geometry instanceof THREE.BoxGeometry && uv.count === 24) {
    const { width: w, height: h, depth: d } = geometry.parameters;
    const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x, -x, +y, -y, +z, -z
    for (let i = 0; i < 24; i++) {
      const [su, sv] = faces[Math.floor(i / 4)];
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  } else if (geometry instanceof THREE.PlaneGeometry) {
    const { width: w, height: h } = geometry.parameters;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  }
  // ExtrudeGeometry (roofs) already has UVs in meters.
}

// Gives each tagged mesh a textured copy of its material. Runs before the
// static meshes merge, after the weather swaps (wet ground stays darker and
// glossy; userData.darken is the weather's darkening).
export function applySurfaces(world: THREE.Group, surfaces: Surfaces) {
  if (surfaces === "flat" || !ready) return;
  const copies = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  world.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const source = object.material as THREE.MeshStandardMaterial;
    const kind = source.userData?.surface as SurfaceKind | undefined;
    if (!kind || !ready!.has(kind)) return;
    let textured = copies.get(source);
    if (!textured) {
      const m = ready!.get(kind)!;
      textured = source.clone();
      const darken = source.userData.darken ?? 1;
      textured.color = LOOKS[kind].color(source.color.clone().multiplyScalar(1 / darken)).multiplyScalar(darken);
      textured.map = m.color;
      textured.normalMap = m.normal;
      textured.roughnessMap = m.arm; // green channel
      textured.aoMap = m.arm; // red channel
      textured.aoMapIntensity = 0.8;
      copies.set(source, textured);
    }
    meterUvs(object.geometry);
    object.material = textured;
  });
}
