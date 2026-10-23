// Results page (TypeScript in the browser; no Three.js in this file). Reads
// the Python benchmark's output from public/results/ and replays any frame in
// the Three.js scene, which runs in the iframe.

import type { Scenario } from "./bench";
import "./results.css";

type Pair = [number, number]; // [detected, in view]

interface Summary {
  frames: number;
  in_view: number;
  detected: number;
  first_seen_m: number | null;
  false_alarms: number;
  by_distance: Record<string, Pair>;
}

interface Detector {
  id: string;
  name: string;
  source: string;
  settings: { min_score: number; min_iou: number; fps: number; seed?: number };
  run: string;
  results: Record<string, Summary>;
}

interface Index {
  updated: string;
  scenarios: Scenario[];
  detectors: Detector[];
}

interface Frame {
  t: number;
  phase: string;
  d: number; // doorbell to person, m
  truth: number[] | null;
  dets: number[][]; // [x0, y0, x1, y1, score]
  hit: boolean | null;
  fa: number;
}

const base = import.meta.env.BASE_URL;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "–");
const status = (hit: boolean | null) => (hit === null ? "out" : hit ? "hit" : "miss");

let index: Index;
let selected = { detector: "", scenario: "" };
let frameIndex = 0;
let loadedScenario = "";
const frames = new Map<string, Frame[]>(); // "detector/scenario" -> frames

async function framesFor(detector: string, scenario: string) {
  const key = `${detector}/${scenario}`;
  if (!frames.has(key)) {
    const res = await fetch(`${base}results/${key}.json`);
    frames.set(key, res.ok ? (await res.json()).frames : []);
  }
  return frames.get(key)!;
}

function renderMatrix() {
  const d0 = index.detectors[0];
  $("settings").textContent =
    `person · min score ${d0.settings.min_score} · IoU ≥ ${d0.settings.min_iou} · ${d0.settings.fps} fps · seed ${d0.settings.seed ?? 0} · ` +
    `updated ${index.updated.slice(0, 16).replace("T", " ")} UTC`;
  const scored = index.detectors.reduce((n, d) => n + (d.results.all?.frames ?? 0), 0);
  $("stats").innerHTML = [
    ["Detectors", index.detectors.length],
    ["Scenarios", index.scenarios.length],
    ["Frames scored", scored],
  ]
    .map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`)
    .join("");

  const head = index.detectors.map((d) => `<th>${esc(d.name)}<small>${esc(d.id)}</small></th>`).join("");
  const rows = [...index.scenarios, { id: "all", name: "All scenarios", query: "" }].map((s) => {
    const cells = index.detectors.map((d) => {
      const r = d.results[s.id];
      if (!r) return `<td class="muted">–</td>`;
      const rate = r.in_view ? r.detected / r.in_view : 0;
      const tip = `${r.detected} of ${r.in_view} frames` + (r.first_seen_m !== null ? ` · first seen ${r.first_seen_m} m` : "");
      const clickable = s.id !== "all";
      const isSelected = d.id === selected.detector && s.id === selected.scenario;
      return `<td class="${clickable ? "cell" : ""} ${isSelected ? "selected" : ""}" title="${tip}"
        data-detector="${esc(d.id)}" data-scenario="${esc(s.id)}">
        ${pct(r.detected, r.in_view)}<div class="bar"><i style="width:${rate * 100}%"></i></div></td>`;
    });
    const name = s.id === "all" ? "All scenarios" : `${esc(s.name)}<small>${esc(s.id)}</small>`;
    return `<tr class="${s.id === "all" ? "total" : ""}"><td class="name">${name}</td>${cells.join("")}</tr>`;
  });
  $("matrix").innerHTML = `<thead><tr><th>Scenario</th>${head}</tr></thead><tbody>${rows.join("")}</tbody>`;
}

async function select(detector: string, scenario: string, frame?: number) {
  const changed = scenario !== selected.scenario;
  selected = { detector, scenario };
  renderMatrix();
  await Promise.all(index.detectors.map((d) => framesFor(d.id, scenario)));
  const list = frames.get(`${detector}/${scenario}`)!;
  if (frame !== undefined) frameIndex = frame;
  else if (changed) {
    // Start at the first frame where this detector sees the person walk up.
    const first = list.findIndex((f) => f.phase === "approach" && f.hit);
    frameIndex = Math.max(first, 0);
  }
  frameIndex = Math.min(frameIndex, Math.max(list.length - 1, 0));
  if (changed) {
    const query = index.scenarios.find((s) => s.id === scenario)!.query;
    const seed = index.detectors.find((d) => d.id === detector)!.settings.seed ?? 0;
    loadedScenario = "";
    $<HTMLIFrameElement>("replay").src = `${base}?${query}&view=doorbell&seed=${seed}&t=${list[frameIndex]?.t ?? 0}`;
  }
  renderDetail();
}

function renderDetail() {
  const { detector, scenario } = selected;
  const d = index.detectors.find((x) => x.id === detector)!;
  const s = index.scenarios.find((x) => x.id === scenario)!;
  const r = d.results[scenario];
  $("detail").hidden = false;
  $("detail-title").textContent = s.name;
  $("detail-sub").textContent = `${s.id} × ${d.id} · ${d.source}`;
  $("detail-stats").innerHTML = [
    ["Detection rate", pct(r.detected, r.in_view)],
    ["First seen", r.first_seen_m !== null ? `${r.first_seen_m} m` : "–"],
    ["False alarms", r.false_alarms],
  ]
    .map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`)
    .join("");

  $("strips").innerHTML = index.detectors
    .map((x) => {
      const list = frames.get(`${x.id}/${scenario}`) ?? [];
      const cells = list
        .map((f, i) => `<button class="${status(f.hit)}" data-detector="${esc(x.id)}" data-frame="${i}"
          title="t = ${f.t.toFixed(1)} s · ${f.d.toFixed(1)} m · ${status(f.hit)}"></button>`)
        .join("");
      return `<div class="strip-row ${x.id === detector ? "selected" : ""}"><div class="label">${esc(x.id)}</div><div class="strip">${cells}</div></div>`;
    })
    .join("");

  const bands = Object.keys(r.by_distance);
  const bandRows = index.detectors.map((x) => {
    const b = x.results[scenario]?.by_distance ?? {};
    const cells = bands.map((k) => `<td title="${b[k]?.[0] ?? 0} of ${b[k]?.[1] ?? 0} frames">${b[k] ? pct(...b[k]) : "–"}</td>`);
    return `<tr class="${x.id === detector ? "selected" : ""}"><td class="mono">${esc(x.id)}</td>${cells.join("")}</tr>`;
  });
  $("bands").innerHTML =
    `<thead><tr><th>Detection rate by distance</th>${bands.map((k) => `<th>${k}</th>`).join("")}</tr></thead>` +
    `<tbody>${bandRows.join("")}</tbody>`;

  showFrame();
}

// Shows the current frame: the scene at time t in the iframe, then the true
// box and this detector's boxes on top.
function showFrame() {
  const list = frames.get(`${selected.detector}/${selected.scenario}`) ?? [];
  const f = list[frameIndex];
  if (!f) return;
  const scene = $<HTMLIFrameElement>("replay").contentWindow;
  if (loadedScenario === selected.scenario) scene?.bench?.render(f.t);

  const box = (b: number[], cls: string, label = "") =>
    `<div class="${cls}" style="left:${b[0] * 100}%;top:${b[1] * 100}%;width:${(b[2] - b[0]) * 100}%;height:${(b[3] - b[1]) * 100}%">${label}</div>`;
  $("boxes").innerHTML =
    (f.truth ? box(f.truth, "truth") : "") + f.dets.map((b) => box(b, "det", `<span>person ${b[4].toFixed(2)}</span>`)).join("");

  const best = f.dets.length ? ` · best score ${Math.max(...f.dets.map((b) => b[4])).toFixed(2)}` : "";
  $("frame-info").textContent =
    `frame ${frameIndex + 1} of ${list.length} · t = ${f.t.toFixed(1)} s · ${f.phase} · ` +
    (f.truth ? `${f.d.toFixed(1)} m from the doorbell · ${status(f.hit)}` : "person out of view") +
    best + (f.fa ? ` · ${f.fa} false alarm${f.fa > 1 ? "s" : ""}` : "");

  for (const button of $("strips").querySelectorAll<HTMLButtonElement>("button")) {
    button.classList.toggle("current", Number(button.dataset.frame) === frameIndex && button.dataset.detector === selected.detector);
  }
}

$("matrix").addEventListener("click", (event) => {
  const cell = (event.target as HTMLElement).closest<HTMLElement>("td.cell");
  if (cell) select(cell.dataset.detector!, cell.dataset.scenario!);
});

$("strips").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (button) select(button.dataset.detector!, selected.scenario, Number(button.dataset.frame));
});

$("replay").addEventListener("load", () => {
  loadedScenario = selected.scenario;
  showFrame();
});

window.addEventListener("keydown", (event) => {
  if ($("detail").hidden || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  const count = frames.get(`${selected.detector}/${selected.scenario}`)?.length ?? 0;
  frameIndex = Math.min(Math.max(frameIndex + (event.key === "ArrowRight" ? 1 : -1), 0), count - 1);
  event.preventDefault();
  showFrame();
});

async function start() {
  const res = await fetch(`${base}results/index.json`);
  if (!res.ok) {
    $("matrix").innerHTML = `<tbody><tr><td class="empty">No results yet. Run bench/run.py (Python) to make them.</td></tr></tbody>`;
    return;
  }
  index = await res.json();
  const first = index.scenarios.find((s) => index.detectors[0]?.results[s.id]);
  if (first) await select(index.detectors[0].id, first.id);
  else renderMatrix();
}

start();
