// Simulations page (Three.js viewer plus a few controls): the overview with
// the doorbell camera inset and the delivery playing. One row of buttons for
// each axis in settings.ts, and a seed. Keys 1–5 switch houses, and V
// switches the view.

import { HOUSES } from "./houses";
import { AXES, writeSettings, type AxisId, type Settings } from "./settings";
import type { Viewer } from "./viewer";

export async function startSimulations(viewer: Viewer, first: Settings) {
  const stage = document.getElementById("stage")!;
  const inset = document.getElementById("inset")!;
  const rows = document.getElementById("axes")!;
  stage.prepend(viewer.canvas);
  new ResizeObserver(([entry]) => viewer.setSize(entry.contentRect.width, entry.contentRect.height)).observe(stage);

  // The newest choice, also while its files load.
  let wanted = first;

  async function load(settings: Settings) {
    wanted = settings;
    for (const b of rows.querySelectorAll<HTMLButtonElement>("button[data-axis]")) {
      b.classList.toggle("on", settings[b.dataset.axis as AxisId] === b.dataset.value);
    }
    await viewer.load(settings);
    if (viewer.settings !== settings) return; // a newer choice replaced this one
    viewer.play();
    seed.value = String(settings.seed);
    const p = new URLSearchParams(location.search);
    p.delete("t");
    writeSettings(settings, p);
    history.replaceState(null, "", `?${p}`);
  }

  const set = (change: Partial<Settings>) => load({ ...wanted, ...change });

  function setView(view: "overview" | "doorbell") {
    viewer.setView(view);
    document.body.classList.toggle("doorbell", view === "doorbell");
  }

  for (const axis of AXES) {
    const row = document.createElement("div");
    row.className = "axis";
    row.innerHTML = `<span>${axis.label}</span>`;
    axis.values.forEach((value, i) => {
      const b = document.createElement("button");
      b.dataset.axis = axis.id;
      b.dataset.value = value.id;
      b.textContent = axis.id === "house" ? `${i + 1} ${value.label}` : value.label;
      b.addEventListener("click", () => set({ [axis.id]: value.id }));
      row.append(b);
    });
    rows.append(row);
  }

  // Seed 0 is the canonical scene. The new-seed button picks one at random.
  const row = document.createElement("div");
  row.className = "axis";
  row.innerHTML = `<span>Seed</span><input id="seed" type="number" min="0" step="1" /><button id="reseed" title="New seed">↻</button>`;
  rows.append(row);
  const seed = row.querySelector<HTMLInputElement>("#seed")!;
  seed.addEventListener("change", () => set({ seed: Math.max(0, Math.floor(Number(seed.value)) || 0) }));
  row.querySelector("#reseed")!.addEventListener("click", () => set({ seed: 1 + Math.floor(Math.random() * 9999) }));

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement) return;
    const house = HOUSES[Number(event.key) - 1];
    if (house) set({ house: house.id });
    else if (event.key.toLowerCase() === "v") setView(viewer.view === "overview" ? "doorbell" : "overview");
  });

  // Keeps the inset's border and label on the inset.
  viewer.onDraw = () => {
    const { width, height, margin } = viewer.insetSize();
    Object.assign(inset.style, { right: `${margin}px`, bottom: `${margin}px`, width: `${width}px`, height: `${height}px` });
  };

  viewer.inset = true;
  setView("overview");
  await load(first);
}
