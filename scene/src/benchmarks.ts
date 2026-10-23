// Benchmarks page entry (TypeScript in the browser). Shows the Python
// benchmark's results: the detectors × scenarios matrix, and a replay of the
// selected cell in the Three.js viewer with the true box and the detections
// on the doorbell camera.

import { HOUSES } from "./houses";
import { Viewer } from "./viewer";
import "./style.css";

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
  results: Record<string, Summary>;
}

interface Index {
  updated: string;
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
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "–");
const status = (hit: boolean | null) => (hit === null ? "out" : hit ? "hit" : "miss");

async function start() {
  const params = new URLSearchParams(location.search);
  let index: Index | null = null;
  try {
    const res = await fetch(`${base}results/index.json`);
    if (res.ok) index = await res.json();
  } catch {
    // No results yet: the page says so.
  }
  const detectors = index?.detectors ?? [];

  // Replays use the seed that the results were made with.
  const viewer = new Viewer(detectors[0]?.settings.seed ?? 0);
  viewer.load(HOUSES.find((h) => h.id === params.get("house")) ?? HOUSES[0]);
  const viewport = $("viewport");
  viewport.prepend(viewer.canvas);
  new ResizeObserver(([entry]) => viewer.setSize(entry.contentRect.width, entry.contentRect.height)).observe(viewport);
  let detector = detectors.find((d) => d.id === params.get("detector"))?.id ?? detectors[0]?.id ?? "";
  const frames = new Map<string, Frame[]>(); // "detector/scenario" -> frames
  let drawn = -2; // frame index of the overlay now on screen

  const fps = () => detectors[0]?.settings.fps ?? 2;
  const current = () => frames.get(`${detector}/${viewer.house.id}`) ?? [];
  const frameAt = (t: number) => Math.min(Math.floor(t * fps() + 1e-6), current().length - 1);

  async function loadFrames(scenario: string) {
    await Promise.all(
      detectors.map(async (d) => {
        const key = `${d.id}/${scenario}`;
        if (frames.has(key)) return;
        const res = await fetch(`${base}results/${key}.json`);
        frames.set(key, res.ok ? (await res.json()).frames : []);
      }),
    );
  }

  function renderHead() {
    const d0 = detectors[0];
    $("settings").textContent = d0
      ? `person · min score ${d0.settings.min_score} · IoU ≥ ${d0.settings.min_iou} · ${d0.settings.fps} fps · seed ${d0.settings.seed ?? 0}`
      : "No results yet. Run bench/run.py (Python) to make them.";
    const scored = detectors.reduce((n, d) => n + (d.results.all?.frames ?? 0), 0);
    $("stats").innerHTML = [
      ["Scenarios", HOUSES.length],
      ["Detectors", detectors.length],
      ["Frames scored", scored.toLocaleString()],
    ]
      .map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`)
      .join("");
  }

  function renderMatrix() {
    const head = detectors
      .map((d) => `<th class="${d.id === detector ? "on" : ""}" data-detector="${esc(d.id)}" title="${esc(d.name)}">${esc(d.id)}</th>`)
      .join("");
    const rows = [...HOUSES.map((h) => ({ id: h.id, name: h.name })), { id: "all", name: "All scenarios" }].map((s) => {
      const rates = detectors.map((d) => {
        const r = d.results[s.id];
        return r && r.in_view ? r.detected / r.in_view : -1;
      });
      const best = Math.max(...rates, 0);
      const cells = detectors
        .map((d, i) => {
          const r = d.results[s.id];
          const cls = [s.id !== "all" ? "cell" : "", rates[i] === best && best > 0 ? "best" : "", d.id === detector && s.id === viewer.house.id ? "on" : ""];
          const tip = r ? `${r.detected} of ${r.in_view} frames` + (r.first_seen_m !== null ? ` · first seen ${r.first_seen_m} m` : "") : "";
          return `<td class="${cls.join(" ")}" data-detector="${esc(d.id)}" data-scenario="${esc(s.id)}" title="${tip}">${r ? pct(r.detected, r.in_view) : "–"}</td>`;
        })
        .join("");
      const ring = s.id === "all" ? "" : `<span class="ring" style="--p:${Math.round(best * 100)}"></span>`;
      const name = s.id === "all" ? `<b>All scenarios</b>` : `${esc(s.name)}<small>${esc(s.id)}</small>`;
      const cls = s.id === "all" ? "total" : s.id === viewer.house.id ? "on" : "";
      return `<tr class="${cls}" data-scenario="${esc(s.id)}"><td class="name">${ring}<span>${name}</span></td>${cells}</tr>`;
    });
    $("matrix").innerHTML = `<thead><tr><th>Scenario</th>${head}</tr></thead><tbody>${rows.join("")}</tbody>`;
  }

  function renderCell() {
    const scenario = viewer.house.id;
    const d = detectors.find((x) => x.id === detector);
    const r = d?.results[scenario];
    $("detail-title").textContent = d ? `${viewer.house.name} × ${d.name}` : viewer.house.name;
    $("detail-sub").textContent = d ? `${scenario} × ${d.id} · ${d.source}` : scenario;
    $("cell-stats").innerHTML = r
      ? [
          ["Detection rate", pct(r.detected, r.in_view)],
          ["First seen", r.first_seen_m !== null ? `${r.first_seen_m} m` : "–"],
          ["False alarms", r.false_alarms],
        ]
          .map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`)
          .join("")
      : "";

    $("strips").innerHTML = detectors
      .map((x) => {
        const cells = (frames.get(`${x.id}/${scenario}`) ?? [])
          .map((f, i) => `<button class="${status(f.hit)}" data-detector="${esc(x.id)}" data-frame="${i}" title="t = ${f.t.toFixed(1)} s · ${f.d.toFixed(1)} m · ${status(f.hit)}"></button>`)
          .join("");
        return `<div class="strip-row ${x.id === detector ? "on" : ""}"><span>${esc(x.id)}</span><div class="strip">${cells}</div></div>`;
      })
      .join("");

    const bands = r ? Object.keys(r.by_distance) : [];
    $("bands").innerHTML = r
      ? `<thead><tr><th>Detection rate by distance</th>${bands.map((k) => `<th>${k}</th>`).join("")}</tr></thead><tbody>` +
        detectors
          .map((x) => {
            const b = x.results[scenario]?.by_distance ?? {};
            const cells = bands.map((k) => `<td title="${b[k]?.[0] ?? 0} of ${b[k]?.[1] ?? 0} frames">${b[k] ? pct(...b[k]) : "–"}</td>`);
            return `<tr class="${x.id === detector ? "on" : ""}"><td class="mono">${esc(x.id)}</td>${cells.join("")}</tr>`;
          })
          .join("") +
        `</tbody>`
      : "";
    drawn = -2;
  }

  // Runs after every drawn frame: moves the playhead, and when the frame
  // changes, redraws the boxes and the frame line.
  function updateOverlay() {
    const list = current();
    const covered = list.length / fps() || viewer.duration;
    $("playhead").style.left = `${Math.min(viewer.time / covered, 1) * 100}%`;
    $("play").textContent = viewer.playing ? "❚❚" : "▶";
    const i = list.length ? frameAt(viewer.time) : -1;
    if (i === drawn) return;
    drawn = i;
    const f = list[i];
    const box = (b: number[], cls: string, label = "") =>
      `<div class="${cls}" style="left:${b[0] * 100}%;top:${b[1] * 100}%;width:${(b[2] - b[0]) * 100}%;height:${(b[3] - b[1]) * 100}%">${label}</div>`;
    $("boxes").innerHTML =
      f
        ? (f.truth ? box(f.truth, "truth") : "") + f.dets.map((b) => box(b, "det", `<span>person ${b[4].toFixed(2)}</span>`)).join("")
        : "";
    $("frame-info").textContent = f
      ? `t ${f.t.toFixed(1)} s · frame ${i + 1}/${list.length} · ${f.phase} · ` +
        (f.truth ? `${f.d.toFixed(1)} m · ${status(f.hit)}` : "out of view") +
        (f.dets.length ? ` · best ${Math.max(...f.dets.map((b) => b[4])).toFixed(2)}` : "")
      : `t ${viewer.time.toFixed(1)} s`;
    for (const b of $("strips").querySelectorAll<HTMLButtonElement>("button")) {
      b.classList.toggle("current", Number(b.dataset.frame) === i && b.dataset.detector === detector);
    }
  }

  function saveUrl() {
    const p = new URLSearchParams(location.search);
    p.delete("t");
    p.set("house", viewer.house.id);
    if (detector) p.set("detector", detector);
    history.replaceState(null, "", `?${p}`);
  }

  // Picks a scenario and detector. Pauses on the first frame where that
  // detector sees the person walk up, so the boxes show at once.
  async function select(scenario: string, det = detector) {
    detector = det;
    if (scenario !== viewer.house.id) viewer.load(HOUSES.find((h) => h.id === scenario)!);
    await loadFrames(scenario);
    renderMatrix();
    renderCell();
    const first = current().findIndex((f) => f.phase === "approach" && f.hit);
    viewer.setTime(first >= 0 ? current()[first].t : 0);
    saveUrl();
  }

  function step(by: number) {
    const n = current().length;
    if (!n) return;
    viewer.setTime(((frameAt(viewer.time) + by + n) % n) / fps());
  }

  $("matrix").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const cell = target.closest<HTMLElement>("td.cell");
    const head = target.closest<HTMLElement>("th[data-detector]");
    const row = target.closest<HTMLElement>("tr[data-scenario]");
    if (cell) select(cell.dataset.scenario!, cell.dataset.detector!);
    else if (head) select(viewer.house.id, head.dataset.detector!);
    else if (row && row.dataset.scenario !== "all") select(row.dataset.scenario!);
  });
  $("strips").addEventListener("click", (event) => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b) return;
    if (b.dataset.detector !== detector) {
      detector = b.dataset.detector!;
      renderMatrix();
      renderCell();
      saveUrl();
    }
    viewer.setTime(Number(b.dataset.frame) / fps());
  });
  $("play").addEventListener("click", () => (viewer.playing ? viewer.pause() : viewer.play()));
  $("prev").addEventListener("click", () => step(-1));
  $("next").addEventListener("click", () => step(1));
  window.addEventListener("keydown", (event) => {
    if ((event.target as HTMLElement).closest("input, textarea, select")) return;
    if (event.key === " ") viewer.playing ? viewer.pause() : viewer.play();
    else if (event.key === "ArrowLeft") step(-1);
    else if (event.key === "ArrowRight") step(1);
    else return;
    event.preventDefault();
  });

  viewer.onDraw = updateOverlay;
  renderHead();
  if (!detectors.length) return;
  await select(viewer.house.id, detector);
}

start();
