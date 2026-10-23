// Three.js (browser) entry. Two modes:
// - Capture (?view=doorbell): the doorbell camera alone, in the full window,
//   with no page around it. The Python benchmark uses this mode.
// - Console (default): the page, with the viewer, results, and controls.
//
// URL parameters: ?house=<id> picks the house. ?t=<seconds> freezes the
// delivery at that time. ?seed=<n> seeds every random choice in the scene
// (default 0).

import { HOUSES } from "./houses";
import { startConsole } from "./ui";
import { Viewer } from "./viewer";
import "./style.css";

const params = new URLSearchParams(location.search);
const viewer = new Viewer(Number(params.get("seed") ?? 0));
viewer.load(HOUSES.find((house) => house.id === params.get("house")) ?? HOUSES[0]);

if (params.get("view") === "doorbell") {
  document.body.className = "capture";
  document.body.replaceChildren(viewer.canvas);
  const fill = () => viewer.setSize(window.innerWidth, window.innerHeight);
  fill();
  window.addEventListener("resize", fill);
  if (params.has("t")) viewer.setTime(Number(params.get("t")));
  else viewer.play();
} else {
  startConsole(viewer, params);
}
