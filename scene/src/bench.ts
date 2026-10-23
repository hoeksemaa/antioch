// Three.js (browser): the hook that the Python benchmark (bench/) calls
// through Playwright. Python picks a time t; this renders that doorbell frame
// and returns the ground truth for it.

import type { DoorbellCamera } from "./camera";
import type { Delivery, Phase } from "./delivery";

// One test case. For now each house is one scenario; later a scenario can
// also set the light, weather, person, and so on, through more URL parameters.
export interface Scenario {
  id: string;
  name: string;
  query: string; // URL parameters that load it, for example "house=porch"
}

export interface Truth {
  t: number;
  phase: Phase;
  box: [number, number, number, number] | null; // person box, fractions of the image
  distance: number; // doorbell to person, on the ground, m
}

declare global {
  interface Window {
    bench?: {
      scenarios: () => Scenario[];
      house: () => string;
      seed: () => number;
      duration: () => number;
      render: (t: number) => Truth;
    };
  }
}

export function installBench(o: {
  scenarios: () => Scenario[];
  house: () => string;
  seed: () => number;
  delivery: () => Delivery;
  camera: () => DoorbellCamera;
  renderAt: (t: number) => void;
}) {
  window.bench = {
    scenarios: o.scenarios,
    house: o.house,
    seed: o.seed,
    duration: () => o.delivery().loop,
    render(t) {
      o.renderAt(t);
      const delivery = o.delivery();
      const camera = o.camera();
      return { t, phase: delivery.phase, box: delivery.screenBox((p) => camera.project(p)), distance: delivery.distanceFrom(camera.camera.position) };
    },
  };
}
