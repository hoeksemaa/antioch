// Simulations page (Three.js viewer plus a few controls): the overview with
// the doorbell camera inset and the delivery playing. One row of buttons for
// each axis in settings.ts, in a panel on the right above the inset; a symbol
// (icons.ts) names each row, and the ? button opens a panel with the keys and
// the symbol names. Keys 1–5 switch houses. A click on the inset (or V) opens
// the doorbell view, and a click on that view (or V, or Esc) goes back to the
// overview.
// On a narrow screen (style.css), the panel title opens and closes the rows.
// The rows start closed there, so the scene has the screen.
// The page shows no seed control: a seed from the URL (an Open frame link from
// the Gallery) stays in the settings, so that frame matches the benchmark.

import { HOUSES } from "./houses";
import { icon } from "./icons";
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
    row.innerHTML = `<span class="icon" role="img" aria-label="${axis.label}" title="${axis.label}">${icon(axis.id)}</span><div class="options" role="group" aria-label="${axis.label}"></div>`;
    const options = row.querySelector(".options")!;
    axis.values.forEach((value, i) => {
      const b = document.createElement("button");
      b.dataset.axis = axis.id;
      b.dataset.value = value.id;
      b.textContent = axis.id === "house" ? `${i + 1} ${value.label}` : value.label;
      b.addEventListener("click", () => set({ [axis.id]: value.id }));
      options.append(b);
    });
    rows.append(row);
  }

  // The panel title: a toggle for the rows on a narrow screen, and plain text
  // (a disabled button) on a wide screen, where the rows always show.
  const hud = document.getElementById("hud")!;
  const toggle = document.getElementById("hud-toggle") as HTMLButtonElement;
  const narrow = matchMedia("(max-width: 760px)");
  function syncToggle() {
    toggle.disabled = !narrow.matches;
    toggle.setAttribute("aria-expanded", String(hud.classList.contains("open") || !narrow.matches));
  }
  toggle.addEventListener("click", () => {
    hud.classList.toggle("open");
    syncToggle();
  });
  narrow.addEventListener("change", syncToggle);
  syncToggle();

  // The help panel: the keys, and the name of each symbol. A click outside it
  // (or Esc) closes it.
  const help = document.getElementById("help")!;
  const panel = document.getElementById("help-panel")!;
  document.getElementById("help-icons")!.innerHTML = AXES.map((a) => `<li>${icon(a.id)}${a.label}</li>`).join("");
  function showHelp(open: boolean) {
    panel.hidden = !open;
    help.setAttribute("aria-expanded", String(open));
  }
  help.addEventListener("click", (event) => {
    event.stopPropagation();
    showHelp(panel.hidden);
  });
  document.addEventListener("click", (event) => {
    if (!panel.hidden && !panel.contains(event.target as Node)) showHelp(false);
  });

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement) return;
    const house = HOUSES[Number(event.key) - 1];
    if (house) set({ house: house.id });
    else if (event.key.toLowerCase() === "v") setView(viewer.view === "overview" ? "doorbell" : "overview");
    else if (event.key === "Escape") {
      if (!panel.hidden) showHelp(false);
      else setView("overview");
    }
  });

  inset.addEventListener("click", () => setView("doorbell"));
  viewer.canvas.addEventListener("click", () => {
    if (viewer.view === "doorbell") setView("overview");
  });

  // Keeps the inset's border and label on the inset, and the panel above it.
  viewer.onDraw = () => {
    const { width, height, margin } = viewer.insetSize();
    Object.assign(inset.style, { right: `${margin}px`, bottom: `${margin}px`, width: `${width}px`, height: `${height}px` });
    stage.style.setProperty("--inset-w", `${width}px`);
    stage.style.setProperty("--inset-h", `${height}px`);
  };

  viewer.inset = true;
  setView("overview");
  await load(first);
}
