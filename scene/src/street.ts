// Three.js (browser): the street, the far side, and the neighbors.

import * as THREE from "three";
import { M, box, mat, simpleHouse, tree, windowUnit } from "./parts";

// "suburb": detached houses, a grass strip at the curb.
// "row": attached row houses, a wide sidewalk with street trees.
export type StreetStyle = "suburb" | "row";

// The near edge of the near sidewalk is at z = sidewalk. The street and the
// far side follow from it.
export function buildStreet(parent: THREE.Object3D, sidewalk: number, style: StreetStyle) {
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(140, 110), M.lawn);
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, 0, sidewalk);
  parent.add(lawn);

  const walkWidth = style === "row" ? 3.2 : 1.6;
  const strip = style === "row" ? 0 : 0.8;
  const curb = sidewalk + walkWidth + strip;
  const street = curb + 0.15;
  const farCurb = street + 8;
  const farWalk = farCurb + 0.15 + strip;
  const lots = farWalk + walkWidth;

  box(parent, [140, 0.03, walkWidth], [0, 0.015, sidewalk + walkWidth / 2], M.concrete);
  box(parent, [140, 0.15, 0.15], [0, 0.075, curb + 0.075], M.concrete);
  box(parent, [140, 0.01, 8], [0, 0.005, street + 4], M.asphalt);
  for (let x = -68; x < 70; x += 4) {
    box(parent, [2, 0.012, 0.12], [x, 0.006, street + 4], M.paint);
  }
  box(parent, [140, 0.15, 0.15], [0, 0.075, farCurb + 0.075], M.concrete);
  box(parent, [140, 0.03, walkWidth], [0, 0.015, farWalk + walkWidth / 2], M.concrete);

  if (style === "row") {
    for (const x of [-7.5, 9]) tree(parent, x, sidewalk + walkWidth - 0.7);
    for (const x of [-12, 0, 12]) tree(parent, x, farWalk + 0.7);
    rowAcross(parent, lots + 3);
  } else {
    simpleHouse(parent, 10, 4.2, 9, -19, -4.5, 0xc9cfd6);
    simpleHouse(parent, 10, 4.2, 9, 19, -4.5, 0xd6c9b8);
    simpleHouse(parent, 9, 4.6, 8, -14, lots + 9, 0xb8c4b0);
    simpleHouse(parent, 9, 4.6, 8, 0, lots + 9, 0xe0d7c3);
    simpleHouse(parent, 9, 4.6, 8, 14, lots + 9, 0xc4b3a6);
  }
}

// Row house fronts across the street, facing -z, with the front at z = face.
function rowAcross(parent: THREE.Object3D, face: number) {
  const heights = [11, 12.2, 10.6, 11.6, 12, 10.8, 11.4, 12.4, 11];
  const colors = [0x7a5444, 0x8e4b3a, 0xcbbfa8, 0x8a8580, 0x9b5a45];
  heights.forEach((height, i) => {
    const x = (i - 4) * 6;
    box(parent, [6, height, 12], [x, height / 2, face + 6], mat(colors[i % colors.length], 0.9));
    box(parent, [6.05, 0.4, 0.5], [x, height - 0.2, face - 0.2], M.trim);
    // The window helper builds on the z = 0 plane facing +z, so turn a
    // group around to face -z.
    const front = new THREE.Group();
    front.position.set(x, 0, face);
    front.rotation.y = Math.PI;
    for (const y of [2.6, 5.6, 8.6]) {
      for (const wx of [-1.8, 0, 1.8]) windowUnit(front, wx, y, 1.0, 1.6);
    }
    parent.add(front);
  });
}
