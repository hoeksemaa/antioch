// Simulations page (Three.js viewer plus a few buttons). The original scene
// browser: the overview with the doorbell camera inset, the delivery playing,
// keys 1–5 to switch houses, and V to switch the view.

import { HOUSES, type House } from "./houses";
import type { Viewer } from "./viewer";

export function startSimulations(viewer: Viewer) {
  const stage = document.getElementById("stage")!;
  const inset = document.getElementById("inset")!;
  const buttons = document.getElementById("houses")!;
  stage.prepend(viewer.canvas);
  new ResizeObserver(([entry]) => viewer.setSize(entry.contentRect.width, entry.contentRect.height)).observe(stage);

  function load(house: House) {
    if (house !== viewer.house) viewer.load(house);
    viewer.play();
    for (const b of buttons.querySelectorAll<HTMLButtonElement>("button")) b.classList.toggle("on", b.dataset.house === house.id);
    const p = new URLSearchParams(location.search);
    p.set("house", house.id);
    history.replaceState(null, "", `?${p}`);
  }

  function setView(view: "overview" | "doorbell") {
    viewer.setView(view);
    document.body.classList.toggle("doorbell", view === "doorbell");
  }

  HOUSES.forEach((house, i) => {
    const b = document.createElement("button");
    b.dataset.house = house.id;
    b.textContent = `${i + 1} ${house.name}`;
    b.addEventListener("click", () => load(house));
    buttons.append(b);
  });

  window.addEventListener("keydown", (event) => {
    const house = HOUSES[Number(event.key) - 1];
    if (house) load(house);
    else if (event.key.toLowerCase() === "v") setView(viewer.view === "overview" ? "doorbell" : "overview");
  });

  // Keeps the inset's border and label on the inset.
  viewer.onDraw = () => {
    const { width, height, margin } = viewer.insetSize();
    Object.assign(inset.style, { right: `${margin}px`, bottom: `${margin}px`, width: `${width}px`, height: `${height}px` });
  };

  viewer.inset = true;
  setView("overview");
  load(viewer.house);
}
