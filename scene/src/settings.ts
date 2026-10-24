// Three.js (browser): the scenario axes. A scenario is one value on each axis,
// plus a seed. Each axis is one module that changes the base scene, and no
// axis depends on another axis.
//
// Each axis has two defaults:
// - baseline: the v1 scene. Capture mode (?view=doorbell, which the Python
//   benchmark uses) and the Benchmarks replay fill a missing axis with it, so
//   old results still match the scene.
// - showcase: what the Simulations page opens with.

import type { CameraModel } from "./camera";
import { HOUSES } from "./houses";
import type { Event } from "./events";
import type { Light } from "./lights";
import type { Person } from "./people";
import type { Occlusion } from "./props";
import type { Surfaces } from "./surfaces";
import type { Weather } from "./weather";

export interface Settings {
  house: string;
  light: Light;
  weather: Weather;
  camera: CameraModel;
  person: Person;
  speed: "walk" | "run";
  surfaces: Surfaces;
  occlusion: Occlusion;
  event: Event;
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
  {
    id: "event",
    label: "Event",
    values: [
      { id: "delivery", label: "Delivery" },
      { id: "dog", label: "Dog" },
      { id: "car", label: "Passing car" },
      { id: "empty", label: "Empty" },
    ],
    baseline: "delivery",
    showcase: "delivery",
  },
  {
    id: "light",
    label: "Light",
    values: [
      { id: "day", label: "Day" },
      { id: "dusk", label: "Dusk" },
      { id: "night", label: "Night" },
      { id: "ir", label: "IR" },
    ],
    baseline: "v1", // the v1 lights; not a button
    showcase: "day",
  },
  {
    id: "weather",
    label: "Weather",
    values: [
      { id: "clear", label: "Clear" },
      { id: "rain", label: "Rain" },
      { id: "snow", label: "Snow" },
      { id: "fog", label: "Fog" },
      { id: "wind", label: "Wind" },
    ],
    baseline: "clear",
    showcase: "clear",
  },
  {
    id: "camera",
    label: "Camera",
    values: [
      { id: "basic", label: "Basic" },
      { id: "ring", label: "Fisheye" },
    ],
    baseline: "basic",
    showcase: "ring",
  },
  {
    id: "person",
    label: "Person",
    values: [
      { id: "mannequin", label: "Mannequin" },
      { id: "man", label: "Man" },
      { id: "woman", label: "Woman" },
      { id: "dark", label: "Dark clothes" },
      { id: "hooded", label: "Hooded" },
      { id: "child", label: "Child height" },
    ],
    baseline: "mannequin",
    showcase: "man",
  },
  {
    id: "speed",
    label: "Speed",
    values: [
      { id: "walk", label: "Walk" },
      { id: "run", label: "Run" },
    ],
    baseline: "walk",
    showcase: "walk",
  },
  {
    id: "surfaces",
    label: "Surfaces",
    values: [
      { id: "flat", label: "Flat" },
      { id: "textured", label: "Textured" },
    ],
    baseline: "flat",
    showcase: "textured",
  },
  {
    id: "occlusion",
    label: "Occlusion",
    values: [
      { id: "none", label: "None" },
      { id: "bins", label: "Bins" },
      { id: "car", label: "Parked car" },
    ],
    baseline: "none",
    showcase: "none",
  },
];

// Reads the settings from URL parameters. A missing or unknown value takes
// the axis's baseline or showcase value.
export function readSettings(params: URLSearchParams, fill: "baseline" | "showcase"): Settings {
  const settings = { seed: Math.max(0, Math.floor(Number(params.get("seed")) || 0)) } as Settings;
  for (const axis of AXES) {
    const value = params.get(axis.id);
    (settings as unknown as Record<AxisId, string>)[axis.id] = axis.values.some((v) => v.id === value) || value === axis.baseline ? value! : axis[fill];
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
