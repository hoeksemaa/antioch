// Simulations page entry (Three.js, in the browser). Two modes:
// - Capture (?view=doorbell): the doorbell camera alone, in the full window,
//   with no page around it. The Python benchmark uses this mode. A missing
//   axis takes its v1 baseline value, so old results still match.
// - Simulations (default): the scene browser (see simulations.ts). A missing
//   axis takes its showcase value.
//
// URL parameters: one for each axis in settings.ts (for example ?house=<id>).
// ?seed=<n> seeds every random choice in the scene (default 0, no jitter).
// ?t=<seconds> freezes the delivery at that time.

import { readSettings } from "./settings";
import { startSimulations } from "./simulations";
import { Viewer } from "./viewer";
import "./style.css";

const params = new URLSearchParams(location.search);
const capture = params.get("view") === "doorbell";
const viewer = new Viewer();
const settings = readSettings(params, capture ? "baseline" : "showcase");

if (capture) {
  document.body.className = "capture";
  document.body.replaceChildren(viewer.canvas);
  const fill = () => viewer.setSize(window.innerWidth, window.innerHeight);
  fill();
  window.addEventListener("resize", fill);
  viewer.load(settings).then(() => {
    if (params.has("t")) viewer.setTime(Number(params.get("t")));
    else viewer.play();
  });
} else {
  startSimulations(viewer, settings).then(() => {
    if (params.has("t")) viewer.setTime(Number(params.get("t")));
  });
}
