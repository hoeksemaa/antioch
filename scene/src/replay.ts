// Analysis page: the replay of one benchmark run in the Three.js viewer. The
// doorbell camera shows the true box and one detector's boxes, and a strip
// for each detector shows every scored frame: hit, miss, out of view, or a
// false alarm with no person. The markup is #replay in gallery.html.

import { esc, noPerson, pct, perMinute, base, type Frame, type Index, type Scenario } from "./results";
import type { Settings } from "./settings";
import { Viewer } from "./viewer";
import "./replay.css";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const status = (hit: boolean | null) => (hit === null ? "out" : hit ? "hit" : "miss");

export interface Replay {
  select: (scenario: string, detector?: string, t?: number) => Promise<void>;
  state: () => { scenario: string; detector: string };
}

// Starts the replay on one scenario and detector. onChange runs after each
// new choice (the page keeps it in the URL).
export async function startReplay(index: Index, first: { scenario: string; detector: string; t?: number }, onChange: () => void): Promise<Replay> {
  const { detectors, scenarios } = index;
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  let scenario: Scenario | undefined;
  let detector = first.detector;
  const viewer = new Viewer();
  const viewport = $("viewport");
  viewport.prepend(viewer.canvas);
  new ResizeObserver(([entry]) => viewer.setSize(entry.contentRect.width, entry.contentRect.height)).observe(viewport);
  const frames = new Map<string, Frame[]>(); // "detector/scenario" -> frames
  let drawn = -2; // frame index of the overlay now on screen

  const fps = () => detectors[0]?.settings.fps ?? 2;
  const current = () => frames.get(`${detector}/${scenario?.id}`) ?? [];
  const frameAt = (t: number) => Math.min(Math.floor(t * fps() + 1e-6), current().length - 1);

  // The box overlay covers the doorbell image: the whole 16:9 viewport, or
  // the centered square of the fisheye.
  async function load(s: Scenario) {
    await viewer.load({ ...s.settings, seed: s.seed } as Settings);
    const width = s.settings.camera === "ring" ? (100 * 9) / 16 : 100;
    Object.assign($("boxes").style, { left: `${(100 - width) / 2}%`, width: `${width}%` });
  }

  async function loadFrames(id: string) {
    await Promise.all(
      detectors.map(async (d) => {
        const key = `${d.id}/${id}`;
        if (frames.has(key)) return;
        const res = await fetch(`${base}results/${key}.json`);
        frames.set(key, res.ok ? (await res.json()).frames : []);
      }),
    );
  }

  function render() {
    if (!scenario) return;
    const d = detectors.find((x) => x.id === detector);
    const r = d?.results[scenario.id];
    $("detail-title").textContent = scenario.name;
    $("detail-sub").textContent = d ? `${d.id} · ${d.source}` : "";
    $("cell-stats").innerHTML = r
      ? (noPerson(scenario)
          ? [
              ["Person", "none"],
              ["False alarms", r.false_alarms],
              ["Per minute", perMinute(r).toFixed(1)],
            ]
          : [
              ["Detection rate", pct(r.detected, r.in_view)],
              ["First seen", r.first_seen_m !== null ? `${r.first_seen_m} m` : "–"],
              ["False alarms", r.false_alarms],
            ]
        )
          .map(([name, value]) => `<div><span>${name}</span><b>${value}</b></div>`)
          .join("")
      : "";

    $("strips").innerHTML = detectors
      .map((x) => {
        const strip = (frames.get(`${x.id}/${scenario!.id}`) ?? [])
          .map((f, i) => {
            const where = f.d !== null ? ` · ${f.d.toFixed(1)} m` : "";
            const state = f.hit === null && f.fa ? "fa" : status(f.hit);
            return `<button class="${state}" data-detector="${esc(x.id)}" data-frame="${i}" title="t = ${f.t.toFixed(1)} s${where} · ${state === "fa" ? "false alarm" : state}"></button>`;
          })
          .join("");
        return `<div class="strip-row ${x.id === detector ? "on" : ""}"><span>${esc(x.id)}</span><div class="strip">${strip}</div></div>`;
      })
      .join("");

    const bands = r && !noPerson(scenario) ? Object.keys(r.by_distance) : [];
    $("bands").innerHTML = bands.length
      ? `<thead><tr><th>Detection rate by distance</th>${bands.map((k) => `<th>${k}</th>`).join("")}</tr></thead><tbody>` +
        detectors
          .map((x) => {
            const b = x.results[scenario!.id]?.by_distance ?? {};
            const row = bands.map((k) => `<td title="${b[k]?.[0] ?? 0} of ${b[k]?.[1] ?? 0} frames">${b[k] ? pct(...b[k]) : "–"}</td>`);
            return `<tr class="${x.id === detector ? "on" : ""}"><td class="mono">${esc(x.id)}</td>${row.join("")}</tr>`;
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
    const box = (b: number[], cls: string, text = "") =>
      `<div class="${cls}" style="left:${b[0] * 100}%;top:${b[1] * 100}%;width:${(b[2] - b[0]) * 100}%;height:${(b[3] - b[1]) * 100}%">${text}</div>`;
    $("boxes").innerHTML = f ? (f.truth ? box(f.truth, "truth") : "") + f.dets.map((b) => box(b, "det", `<span>person ${b[4].toFixed(2)}</span>`)).join("") : "";
    $("frame-info").textContent = f
      ? `t ${f.t.toFixed(1)} s · frame ${i + 1}/${list.length} · ${f.phase} · ` +
        (f.truth && f.d !== null ? `${f.d.toFixed(1)} m · ${status(f.hit)}` : f.d === null ? "no person" : "out of view") +
        (f.dets.length ? ` · best ${Math.max(...f.dets.map((b) => b[4])).toFixed(2)}` : "")
      : `t ${viewer.time.toFixed(1)} s`;
    for (const b of $("strips").querySelectorAll<HTMLButtonElement>("button")) {
      b.classList.toggle("current", Number(b.dataset.frame) === i && b.dataset.detector === detector);
    }
  }

  // Picks a scenario and detector, then pauses at time t. With no t, it
  // pauses on the first frame where that detector sees the person walk up (or
  // makes a false alarm), so the boxes show at once.
  async function select(id: string, det = detector, t?: number) {
    const next = byId.get(id);
    if (!next) return;
    detector = detectors.some((d) => d.id === det) ? det : detector;
    if (next !== scenario) {
      scenario = next;
      await load(next);
    }
    await loadFrames(next.id);
    render();
    const list = current();
    const hit = list.findIndex((f) => (f.phase === "approach" && f.hit) || (f.hit === null && f.fa));
    viewer.setTime(t ?? (hit >= 0 ? list[hit].t : 0));
    onChange();
  }

  function step(by: number) {
    const n = current().length;
    if (!n) return;
    viewer.setTime(((frameAt(viewer.time) + by + n) % n) / fps());
  }

  $("strips").addEventListener("click", (event) => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b) return;
    if (b.dataset.detector !== detector) {
      detector = b.dataset.detector!;
      render();
      onChange();
    }
    viewer.setTime(Number(b.dataset.frame) / fps());
  });
  $("play").addEventListener("click", () => (viewer.playing ? viewer.pause() : viewer.play()));
  $("prev").addEventListener("click", () => step(-1));
  $("next").addEventListener("click", () => step(1));

  // The keys work while the replay is on screen, so space still scrolls the
  // rest of the page.
  let onScreen = false;
  new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting), { threshold: 0.5 }).observe($("replay"));
  window.addEventListener("keydown", (event) => {
    if (!onScreen || (event.target as HTMLElement).closest("input, textarea, select")) return;
    if (event.key === " ") viewer.playing ? viewer.pause() : viewer.play();
    else if (event.key === "ArrowLeft") step(-1);
    else if (event.key === "ArrowRight") step(1);
    else return;
    event.preventDefault();
  });

  viewer.onDraw = updateOverlay;
  await select(first.scenario, first.detector, first.t);
  return { select, state: () => ({ scenario: scenario?.id ?? "", detector }) };
}
