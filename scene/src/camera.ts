// Three.js (browser): the camera axis. Two doorbell cameras on the same mount:
// - basic: the v1 camera. A plain perspective camera, 16:9, 70° vertical.
// - ring: a square fisheye like a Ring doorbell. The scene renders through a
//   140° perspective camera, and the sensor pass (sensor.ts) maps that image
//   to a stereographic fisheye: about 150° corner to corner, about 115° side
//   to side. One perspective render cannot see the 150° × 150° of the real
//   lens: the corners would need rays more than 90° off the axis.

import * as THREE from "three";
import type { HouseView } from "./houses";

export type CameraModel = "basic" | "ring";

const SOURCE_FOV = 140; // the ring camera's perspective render, degrees
export const TAN_ALPHA = Math.tan(THREE.MathUtils.degToRad(SOURCE_FOV / 2));
// The fisheye maps the image corners to the corners of the source render, so
// no part of the image is outside it.
const CORNER = Math.atan(Math.SQRT2 * TAN_ALPHA);
export const LENS_K = Math.tan(CORNER / 2) / Math.SQRT2; // r = tan(θ / 2) / LENS_K, r = 1 at the side

export class DoorbellCamera {
  readonly camera: THREE.PerspectiveCamera;
  readonly aspect: number;
  readonly fisheye: boolean;

  constructor(view: HouseView, readonly model: CameraModel) {
    this.fisheye = model === "ring";
    this.aspect = this.fisheye ? 1 : 16 / 9;
    this.camera = new THREE.PerspectiveCamera(this.fisheye ? SOURCE_FOV : 70, this.aspect, 0.05, 150);
    this.camera.position.set(view.doorbell.x, view.doorbell.y, view.doorbell.z + 0.02);
    this.camera.lookAt(view.target);
    this.camera.updateMatrixWorld();
  }

  // A world point in the image, from -1 to 1 with y up (as NDC). Null when it
  // is behind the camera or outside the lens.
  project(point: THREE.Vector3): THREE.Vector2 | null {
    if (!this.fisheye) {
      const p = point.clone().project(this.camera);
      return p.z < -1 || p.z > 1 ? null : new THREE.Vector2(p.x, p.y);
    }
    const d = point.clone().applyMatrix4(this.camera.matrixWorldInverse);
    const theta = Math.atan2(Math.hypot(d.x, d.y), -d.z);
    if (theta >= CORNER) return null;
    const r = Math.tan(theta / 2) / LENS_K;
    const phi = Math.atan2(d.y, d.x);
    return new THREE.Vector2(r * Math.cos(phi), r * Math.sin(phi));
  }
}
