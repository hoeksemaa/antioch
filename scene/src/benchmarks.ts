// Benchmarks page entry (TypeScript in the browser). Shows the Python
// benchmark's results on the fixed scenario list (bench/scenarios.json):
// - By setting: for each value of each axis, the detection rate of each
//   detector over the scenarios with that value (false alarms per minute for
//   the events with no person). Click a value to list its scenarios.
// - Scenarios: each scenario × detector. Click a cell to replay it.
// - Replay: the scenario in the Three.js viewer with the true box and the
//   detections on the doorbell camera.

import { AXES, type AxisId, type Settings } from "./settings";
import { Viewer } from "./viewer";
import "./style.css";
import "./benchmarks.css";

type Pair = [number, number]; // [detected, in view]

interface Summary {
  frames: number;
  seconds: number; // scene time
  in_view: number;
  detected: number;
  first_seen_m: number | null;
  false_alarms: number;
  ms_per_frame?: number; // detector time
  scenarios?: number;
  by_distance: Record<string, Pair>;
}

interface Detector {
  id: string;
  name: string;
  source: string;
  settings: { min_score: number; min_iou: number; fps: number; device?: string };
  results: Record<string, Summary>;
  all: Summary;
  by_setting: Record<string, Record<string, Summary>>;
}

interface Scenario {
  id: string;
  name: string;
  settings: Record<AxisId, string>;
  seed: number;
  query: string;
}

interface Index {
  updated: string;
  scenarios: Scenario[];
  detectors: Detector[];
}

interface Frame {
  t: number;
  phase: string;
  d: number | null; // doorbell to person, m; null with no person
  truth: number[] | null;
  dets: number[][]; // [x0, y0, x1, y1, score]
  hit: boolean | null;
  fa: number;
}

const base = import.meta.env.BASE_URL;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "–");
const perMinute = (s: Summary) => (s.seconds ? (s.false_alarms / s.seconds) * 60 : 0);
const status = (hit: boolean | null) => (hit === null ? "out" : hit ? "hit" : "miss");
const noPerson = (s: Scenario) => s.settings.event !== "delivery";
const NO_PERSON_EVENTS = ["dog", "car", "empty"];
const label = (axis: AxisId, value: string) => AXES.find((a) => a.id === axis)?.values.find((v) => v.id === value)?.label ?? value;

// One table cell: the detection rate, or false alarms per minute where no
// person is in the scene. "best" marks the best detector in the row.
function cells(summaries: (Summary | undefined)[], fa: boolean, on: (i: number) => boolean, attrs: (i: number) => string) {
  const values = summaries.map((s) => (s ? (fa ? perMinute(s) : s.in_view ? s.detected / s.in_view : null) : null));
  const known = values.filter((v): v is number => v !== null);
  const best = known.length ? (fa ? Math.min(...known) : Math.max(...known)) : null;
  return summaries
    .map((s, i) => {
      const v = values[i];
      const text = !s || v === null ? "–" : fa ? `${v.toFixed(1)}/min` : pct(s.detected, s.in_view);
      const tip = !s ? "" : fa ? `${s.false_alarms} false alarms in ${Math.round(s.seconds)} s` : `${s.detected} of ${s.in_view} frames` + (s.first_seen_m !== null ? ` · first seen ${s.first_seen_m} m` : "");
      const cls = ["cell", v !== null && v === best && summaries.length > 1 ? "best" : "", on(i) ? "on" : ""];
      return `<td class="${cls.join(" ")}" ${attrs(i)} title="${tip}">${text}</td>`;
    })
    .join("");
}

function sum(rows: Summary[]): Summary {
  const add = (k: "frames" | "seconds" | "in_view" | "detected" | "false_alarms") => rows.reduce((n, r) => n + r[k], 0);
  return { frames: add("frames"), seconds: add("seconds"), in_view: add("in_view"), detected: add("detected"), false_alarms: add("false_alarms"), first_seen_m: null, by_distance: {} };
}

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
  const scenarios = index?.scenarios ?? [];
  const byId = new Map(scenarios.map((s) => [s.id, s]));

  // The filter from the By setting table: one axis value, or none.
  let filter: { axis: AxisId; value: string } | null = null;
  const [fAxis, fValue] = (params.get("filter") ?? "").split("=");
  if (AXES.some((a) => a.id === fAxis) && fValue) filter = { axis: fAxis as AxisId, value: fValue };
  const shown = () => scenarios.filter((s) => !filter || (s.settings[filter.axis] === filter.value && !(["person", "speed"].includes(filter.axis) && noPerson(s))));

  let scenario = byId.get(params.get("scenario") ?? "") ?? scenarios[0];
  // The default detector is the one with the best detection rate.
  const rate = (s?: Summary) => (s && s.in_view ? s.detected / s.in_view : -1);
  const best = [...detectors].sort((a, b) => rate(b.all) - rate(a.all))[0];
  let detector = detectors.find((d) => d.id === params.get("detector"))?.id ?? best?.id ?? "";
  const viewer = new Viewer();
  // The box overlay covers the doorbell image: the whole 16:9 viewport, or
  // the centered square of the fisheye.
  const load = async (s: Scenario) => {
    await viewer.load({ ...s.settings, seed: s.seed } as Settings);
    const width = s.settings.camera === "ring" ? (100 * 9) / 16 : 100;
    Object.assign($("boxes").style, { left: `${(100 - width) / 2}%`, width: `${width}%` });
  };
  if (scenario) await load(scenario);
  const viewport = $("viewport");
  viewport.prepend(viewer.canvas);
  new ResizeObserver(([entry]) => viewer.setSize(entry.contentRect.width, entry.contentRect.height)).observe(viewport);
  const frames = new Map<string, Frame[]>(); // "detector/scenario" -> frames
  let drawn = -2; // frame index of the overlay now on screen

  const fps = () => detectors[0]?.settings.fps ?? 2;
  const current = () => frames.get(`${detector}/${scenario?.id}`) ?? [];
  const frameAt = (t: number) => Math.min(Math.floor(t * fps() + 1e-6), current().length - 1);

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

  function renderHead() {
    const d0 = detectors[0];
    $("settings").textContent = d0
      ? `person · min score ${d0.settings.min_score} · IoU ≥ ${d0.settings.min_iou} · ${d0.settings.fps} fps` + (d0.settings.device ? ` · ${d0.settings.device}` : "")
      : "No results yet. Run bench/run.py (Python) to make them.";
    const scored = detectors.reduce((n, d) => n + (d.all?.frames ?? 0), 0);
    $("stats").innerHTML = [
      ["Scenarios", scenarios.length],
      ["Detectors", detectors.length],
      ["Frames scored", scored.toLocaleString()],
    ]
      .map(([name, value]) => `<div><span>${name}</span><b>${value}</b></div>`)
      .join("");
  }

  // Summary: headline numbers for each detector, the largest differences
  // within one setting, and the data files. Everything comes from index.json.
  function renderSummary() {
    if (!detectors.length) return;
    const deliveries = detectors.map((d) => sum(scenarios.filter((s) => !noPerson(s) && d.results[s.id]).map((s) => d.results[s.id])));
    const empty = detectors.map((d) => sum(scenarios.filter((s) => noPerson(s) && d.results[s.id]).map((s) => d.results[s.id])));
    // One row: values, how to show them, and whether higher is better.
    const row = (name: string, note: string, values: (number | null)[], show: (v: number) => string, higher: boolean, tip: (i: number) => string = () => "") => {
      const known = values.filter((v): v is number => v !== null);
      const top = known.length ? (higher ? Math.max(...known) : Math.min(...known)) : null;
      const cells = values.map((v, i) => `<td class="${v !== null && v === top && known.length > 1 ? "best" : ""}" title="${tip(i)}">${v === null ? "–" : show(v)}</td>`).join("");
      return `<tr><td class="name"><span>${name}<small>${note}</small></span></td>${cells}</tr>`;
    };
    const share = (v: number) => `${Math.round(v * 100)}%`;
    const bands = Object.keys(detectors[0].all?.by_distance ?? {});
    const rows = [
      row("Detection rate", "deliveries, person in view", deliveries.map((s) => (s.in_view ? s.detected / s.in_view : null)), share, true, (i) => `${deliveries[i].detected} of ${deliveries[i].in_view} frames`),
      ...bands.map((band) =>
        row(`At ${band}`, "doorbell to person", detectors.map((d) => { const [n, of] = d.all.by_distance[band]; return of ? n / of : null; }), share, true, (i) => {
          const [n, of] = detectors[i].all.by_distance[band];
          return `${n} of ${of} frames`;
        }),
      ),
      row("First seen", "median distance of the first hit", detectors.map((d) => d.all.first_seen_m), (v) => `${v.toFixed(1)} m`, true),
      row("False alarms", "no-person events, per minute", empty.map((s) => (s.seconds ? perMinute(s) : null)), (v) => `${v.toFixed(1)}/min`, false, (i) => `${empty[i].false_alarms} in ${Math.round(empty[i].seconds)} s`),
      row("Time per frame", `detector only${detectors[0].settings.device ? ` · ${esc(detectors[0].settings.device)}` : ""}`, detectors.map((d) => d.all.ms_per_frame ?? null), (v) => `${Math.round(v)} ms`, false),
    ];
    $("summary").innerHTML = headRow("Detector") + `<tbody>${rows.join("")}</tbody>`;
    const frames = detectors.reduce((n, d) => n + (d.all?.frames ?? 0), 0);
    $("summary-sub").textContent = `${scenarios.length} scenarios · ${detectors.length} detectors · ${frames.toLocaleString()} frames scored · updated ${index?.updated.slice(0, 10) ?? ""}`;

    // For the best detector: the axes where the rate changes most from one
    // value to another.
    const spreads = AXES.filter((a) => a.id !== "event")
      .map((a) => {
        const values = a.values
          .map((v) => ({ label: v.label, s: best.by_setting?.[a.id]?.[v.id] }))
          .filter((v) => v.s && v.s.in_view)
          .map((v) => ({ label: v.label, rate: v.s!.detected / v.s!.in_view }));
        values.sort((x, y) => y.rate - x.rate);
        return { axis: a.label, high: values[0], low: values[values.length - 1] };
      })
      .filter((x) => x.high && x.low && x.high !== x.low)
      .sort((x, y) => y.high.rate - y.low.rate - (x.high.rate - x.low.rate));
    const findings = spreads.slice(0, 4).map(
      (x) => `<li><b>${esc(x.axis)}:</b> ${esc(x.high.label)} ${share(x.high.rate)} → ${esc(x.low.label)} ${share(x.low.rate)} <small>(${Math.round(x.low.rate * 100) - Math.round(x.high.rate * 100)} points)</small></li>`,
    );
    // The no-person event with the most false alarms, over all detectors.
    const events = NO_PERSON_EVENTS.map((e) => ({ e, s: sum(detectors.map((d) => d.by_setting?.event?.[e]).filter((s): s is Summary => !!s)) }));
    events.sort((a, b) => perMinute(b.s) - perMinute(a.s));
    if (events[0]?.s.false_alarms) {
      const e = events[0].e;
      const each = detectors.map((d) => { const s = d.by_setting?.event?.[e]; return s ? `${esc(d.id)} ${perMinute(s).toFixed(1)}` : ""; }).filter(Boolean).join(" · ");
      findings.push(`<li><b>False alarms:</b> the ${esc(label("event", e).toLowerCase())} causes the most <small>(${each} per minute)</small></li>`);
    }
    $("findings").innerHTML = `<li class="muted">For ${esc(best.name)}, the best detector:</li>` + findings.join("");

    const example = `${detectors[0].id}/${scenarios[0]?.id}.json`;
    $("data").innerHTML = [
      [`${base}results/index.json`, "results/index.json", "every detector × scenario, all scenarios, and by setting"],
      [`${base}results/${example}`, `results/${example}`, "every frame of one scenario: true box, boxes, scores, low boxes, overlap, time"],
      [`${base}notable/gallery.json`, "notable/gallery.json", "the notable frames, with every setting (see the Gallery)"],
      ["https://github.com/hoeksemaa/antioch/blob/main/bench/scenarios.json", "bench/scenarios.json", "the 100 fixed scenarios"],
      ["https://github.com/hoeksemaa/antioch/tree/main/bench", "bench/", "the Python benchmark: capture, detectors, scoring, gallery"],
    ]
      .map(([href, name, about]) => `<li><a class="mono" href="${href}">${name}</a> <small>${about}</small></li>`)
      .join("");
  }

  function headRow(first: string) {
    const head = detectors.map((d) => `<th class="${d.id === detector ? "on" : ""}" data-detector="${esc(d.id)}" title="${esc(d.name)}">${esc(d.id)}</th>`).join("");
    return `<thead><tr><th>${first}</th>${head}</tr></thead>`;
  }

  function renderSettings() {
    const rows: string[] = [];
    for (const axis of AXES) {
      rows.push(`<tr class="group"><td colspan="${detectors.length + 1}">${esc(axis.label)}${["person", "speed"].includes(axis.id) ? " <small>deliveries only</small>" : ""}</td></tr>`);
      for (const v of axis.values) {
        const summaries = detectors.map((d) => d.by_setting?.[axis.id]?.[v.id]);
        const n = summaries.find(Boolean)?.scenarios ?? 0;
        if (!n) continue;
        const fa = axis.id === "event" && NO_PERSON_EVENTS.includes(v.id);
        const on = filter?.axis === axis.id && filter.value === v.id;
        const name = `<span>${esc(v.label)}<small>${n} scenarios${fa ? " · false alarms" : ""}</small></span>`;
        rows.push(`<tr class="${on ? "on" : ""}" data-axis="${axis.id}" data-value="${esc(v.id)}"><td class="name">${name}</td>${cells(summaries, fa, () => false, () => "")}</tr>`);
      }
    }
    const deliveries = detectors.map((d) => sum(scenarios.filter((s) => !noPerson(s) && d.results[s.id]).map((s) => d.results[s.id])));
    const empty = detectors.map((d) => sum(scenarios.filter((s) => noPerson(s) && d.results[s.id]).map((s) => d.results[s.id])));
    rows.push(`<tr class="total"><td class="name"><span><b>All deliveries</b><small>detection rate</small></span></td>${cells(deliveries, false, () => false, () => "")}</tr>`);
    rows.push(`<tr class="total-2"><td class="name"><span><b>All no-person events</b><small>false alarms</small></span></td>${cells(empty, true, () => false, () => "")}</tr>`);
    if (detectors.some((d) => d.all?.ms_per_frame)) {
      const device = detectors[0].settings.device ?? "";
      const times = detectors.map((d) => `<td class="mono" title="mean detector time for one frame">${d.all?.ms_per_frame ? `${Math.round(d.all.ms_per_frame)} ms` : "–"}</td>`).join("");
      rows.push(`<tr class="total-2"><td class="name"><span><b>Time per frame</b><small>detector only${device ? ` · ${esc(device)}` : ""}</small></span></td>${times}</tr>`);
    }
    $("by-setting").innerHTML = headRow("Setting") + `<tbody>${rows.join("")}</tbody>`;
  }

  function renderScenarios() {
    const list = shown();
    $("filter").innerHTML = filter
      ? `${esc(AXES.find((a) => a.id === filter!.axis)!.label)} = ${esc(label(filter.axis, filter.value))} · ${list.length} of ${scenarios.length} scenarios · <button class="link" id="clear">show all</button>`
      : `All ${scenarios.length} scenarios. Click a setting above to list only its scenarios.`;
    const rows = list.map((s) => {
      const name = `<span>${esc(s.name)}<small>${esc(s.id)}</small></span>`;
      const row = cells(
        detectors.map((d) => d.results[s.id]),
        noPerson(s),
        (i) => detectors[i].id === detector && s.id === scenario?.id,
        (i) => `data-detector="${esc(detectors[i].id)}" data-scenario="${esc(s.id)}"`,
      );
      return `<tr class="${s.id === scenario?.id ? "on" : ""}" data-scenario="${esc(s.id)}"><td class="name">${name}</td>${row}</tr>`;
    });
    $("matrix").innerHTML = headRow("Scenario") + `<tbody>${rows.join("")}</tbody>`;
  }

  function renderCell() {
    if (!scenario) return;
    const d = detectors.find((x) => x.id === detector);
    const r = d?.results[scenario.id];
    $("detail-title").textContent = scenario.name;
    $("detail-sub").textContent = d ? `${scenario.id} × ${d.id} · ${d.source}` : scenario.id;
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

  function saveUrl() {
    const p = new URLSearchParams();
    if (scenario) p.set("scenario", scenario.id);
    if (detector) p.set("detector", detector);
    if (filter) p.set("filter", `${filter.axis}=${filter.value}`);
    history.replaceState(null, "", `?${p}`);
  }

  function render() {
    renderSummary();
    renderSettings();
    renderScenarios();
    renderCell();
    saveUrl();
  }

  // Picks a scenario and detector. Pauses on the first frame where that
  // detector sees the person walk up (or makes a false alarm), so the boxes
  // show at once.
  async function select(id: string, det = detector) {
    const next = byId.get(id);
    if (!next) return;
    detector = det;
    if (next !== scenario) {
      scenario = next;
      await load(next);
    }
    await loadFrames(next.id);
    render();
    const list = current();
    const first = list.findIndex((f) => (f.phase === "approach" && f.hit) || (f.hit === null && f.fa));
    viewer.setTime(first >= 0 ? list[first].t : 0);
  }

  function step(by: number) {
    const n = current().length;
    if (!n) return;
    viewer.setTime(((frameAt(viewer.time) + by + n) % n) / fps());
  }

  $("by-setting").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const head = target.closest<HTMLElement>("th[data-detector]");
    const row = target.closest<HTMLElement>("tr[data-axis]");
    if (head) {
      detector = head.dataset.detector!;
      render();
    } else if (row) {
      const same = filter?.axis === row.dataset.axis && filter?.value === row.dataset.value;
      filter = same ? null : { axis: row.dataset.axis as AxisId, value: row.dataset.value! };
      const list = shown();
      if (scenario && !list.includes(scenario) && list[0]) select(list[0].id);
      else render();
    }
  });
  $("summary").addEventListener("click", (event) => {
    const head = (event.target as HTMLElement).closest<HTMLElement>("th[data-detector]");
    if (head && scenario) select(scenario.id, head.dataset.detector!);
  });
  $("filter").addEventListener("click", (event) => {
    if ((event.target as HTMLElement).id !== "clear") return;
    filter = null;
    render();
  });
  $("matrix").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const cell = target.closest<HTMLElement>("td.cell");
    const head = target.closest<HTMLElement>("th[data-detector]");
    const row = target.closest<HTMLElement>("tr[data-scenario]");
    if (cell?.dataset.scenario) select(cell.dataset.scenario, cell.dataset.detector!);
    else if (head && scenario) select(scenario.id, head.dataset.detector!);
    else if (row) select(row.dataset.scenario!);
  });
  $("strips").addEventListener("click", (event) => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b) return;
    if (b.dataset.detector !== detector) {
      detector = b.dataset.detector!;
      render();
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
  renderSummary();
  if (!detectors.length || !scenario) return;
  await select(scenario.id, detector);
}

start();
