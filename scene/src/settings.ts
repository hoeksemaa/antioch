// Three.js (browser): the scenario axes. A scenario is one value on each axis,
// plus a seed. Each axis is one module that changes the base scene, and no
// axis depends on another axis.
//
// Each axis has two defaults:
// - baseline: the v1 scene. Capture mode (?view=doorbell, which the Python
//   benchmark uses) and the Benchmarks replay fill a missing axis with it, so
//   old results still match the scene.
// - showcase: what the Simulations page opens with.

import { HOUSES } from "./houses";

export interface Settings {
  house: string;
  seed: number; // 0 is the canonical scene: no random jitter
}

export type AxisId = Exclude<keyof Settings, "seed">;

export interface Axis {
  id: AxisId; // also the URL parameter
  label: string;
  values: { id: string; label: string }[];
  baseline: string;
  showcase: string;
}

export const AXES: Axis[] = [
  {
    id: "house",
    label: "House",
    values: HOUSES.map((h) => ({ id: h.id, label: h.name })),
    baseline: "porch",
    showcase: "porch",
  },
];

// Reads the settings from URL parameters. A missing or unknown value takes
// the axis's baseline or showcase value.
export function readSettings(params: URLSearchParams, fill: "baseline" | "showcase"): Settings {
  const settings = { seed: Math.max(0, Math.floor(Number(params.get("seed")) || 0)) } as Settings;
  for (const axis of AXES) {
    const value = params.get(axis.id);
    settings[axis.id] = axis.values.some((v) => v.id === value) ? value! : axis[fill];
  }
  return settings;
}

// Writes every axis and the seed into the URL parameters.
export function writeSettings(settings: Settings, params: URLSearchParams) {
  for (const axis of AXES) params.set(axis.id, settings[axis.id]);
  params.set("seed", String(settings.seed));
}

export function baseline(): Settings {
  return readSettings(new URLSearchParams(), "baseline");
}
