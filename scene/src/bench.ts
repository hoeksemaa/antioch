// Three.js (browser): the hook that the Python benchmark (bench/) calls
// through Playwright. Python picks a time t; this renders that doorbell frame
// and returns the ground truth for it.

import type { DoorbellCamera } from "./camera";
import type { Phase } from "./delivery";
import type { Actor } from "./events";
import type { Settings } from "./settings";

// The test cases (scenarios) are a fixed list in Python (bench/scenarios.json).
// Each one is a URL query that sets every axis and the seed.

export interface Truth {
  t: number;
  phase: Phase;
  box: [number, number, number, number] | null; // person box, fractions of the image
  distance: number | null; // doorbell to person, on the ground, m; null with no person
}

declare global {
  interface Window {
    bench?: {
      settings: () => Settings; // what the scene loaded, after defaults
      house: () => string;
      seed: () => number;
      duration: () => number;
      render: (t: number) => Truth;
    };
  }
}

export function installBench(o: {
  settings: () => Settings;
  house: () => string;
  seed: () => number;
  actor: () => Actor;
  camera: () => DoorbellCamera;
  renderAt: (t: number) => void;
}) {
  window.bench = {
    settings: o.settings,
    house: o.house,
    seed: o.seed,
    duration: () => o.actor().loop,
    render(t) {
      o.renderAt(t);
      const actor = o.actor();
      const camera = o.camera();
      return { t, phase: actor.phase, box: actor.screenBox((p) => camera.project(p)), distance: actor.distanceFrom(camera.camera.position) };
    },
  };
}
