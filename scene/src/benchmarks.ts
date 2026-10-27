// Benchmark page entry (TypeScript in the browser). Shows the scores of the
// Python benchmark (scene/public/results/index.json, made by bench/run.py):
// - Summary: headline numbers for each detector, the largest differences
//   within one setting, scoring notes, and the data files.
// - By setting: for each value of each axis, the detection rate of each
//   detector (false alarms per minute for the scenes with no person).
// The replay of single runs is on the Analysis page (replay.ts).

import { AXES } from "./settings";
import { bestDetector, esc, loadIndex, NO_PERSON_EVENTS, pct, perMinute, sum, type Detector, type Summary, base } from "./results";
import "./style.css";
import "./benchmarks.css";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const label = (axis: string, value: string) => AXES.find((a) => a.id === axis)?.values.find((v) => v.id === value)?.label ?? value;

// One table cell: the detection rate, or false alarms per minute where no
// person is in the scene. "best" marks the best detector in the row.
function cells(summaries: (Summary | undefined)[], fa: boolean) {
  const values = summaries.map((s) => (s ? (fa ? perMinute(s) : s.in_view ? s.detected / s.in_view : null) : null));
  const known = values.filter((v): v is number => v !== null);
  const best = known.length ? (fa ? Math.min(...known) : Math.max(...known)) : null;
  return summaries
    .map((s, i) => {
      const v = values[i];
      const text = !s || v === null ? "–" : fa ? `${v.toFixed(1)}/min` : pct(s.detected, s.in_view);
      const tip = !s ? "" : fa ? `${s.false_alarms} false alarms in ${Math.round(s.seconds)} s` : `${s.detected} of ${s.in_view} frames` + (s.first_seen_m !== null ? ` · first seen ${s.first_seen_m} m` : "");
      return `<td class="${v !== null && v === best && summaries.length > 1 ? "best" : ""}" title="${tip}">${text}</td>`;
    })
    .join("");
}

// All deliveries, and all scenes with no person, for one detector.
const deliveries = (d: Detector) => d.by_setting?.event?.delivery ?? sum([]);
const noPersonScenes = (d: Detector) => sum(NO_PERSON_EVENTS.map((e) => d.by_setting?.event?.[e]).filter((s): s is Summary => !!s));

async function start() {
  const index = await loadIndex();
  const detectors = index?.detectors ?? [];
  const best = bestDetector(detectors);
  const scored = detectors.reduce((n, d) => n + (d.all?.frames ?? 0), 0);

  const headRow = (first: string) => `<thead><tr><th>${first}</th>${detectors.map((d) => `<th title="${esc(d.name)}">${esc(d.id)}</th>`).join("")}</tr></thead>`;

  function renderHead() {
    const d0 = detectors[0];
    $("settings").textContent = d0
      ? `person · min score ${d0.settings.min_score} · IoU ≥ ${d0.settings.min_iou} · ${d0.settings.fps} fps` + (d0.settings.device ? ` · ${d0.settings.device}` : "")
      : "No results yet. Run bench/run.py (Python) to make them.";
    $("stats").innerHTML = [
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
    const all = detectors.map(deliveries);
    const empty = detectors.map(noPersonScenes);
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
      row("Detection rate", "deliveries, person in view", all.map((s) => (s.in_view ? s.detected / s.in_view : null)), share, true, (i) => `${all[i].detected} of ${all[i].in_view} frames`),
      ...bands.map((band) =>
        row(`At ${band}`, "doorbell to person", detectors.map((d) => { const [n, of] = d.all.by_distance[band]; return of ? n / of : null; }), share, true, (i) => {
          const [n, of] = detectors[i].all.by_distance[band];
          return `${n} of ${of} frames`;
        }),
      ),
      row("First seen", "median distance of the first hit", detectors.map((d) => d.all.first_seen_m), (v) => `${v.toFixed(1)} m`, true),
      row("False alarms", "scenes with no person, per minute", empty.map((s) => (s.seconds ? perMinute(s) : null)), (v) => `${v.toFixed(1)}/min`, false, (i) => `${empty[i].false_alarms} in ${Math.round(empty[i].seconds)} s`),
      row("Time per frame", `detector only${detectors[0].settings.device ? ` · ${esc(detectors[0].settings.device)}` : ""}`, detectors.map((d) => d.all.ms_per_frame ?? null), (v) => `${Math.round(v)} ms`, false),
    ];
    $("summary").innerHTML = headRow("Detector") + `<tbody>${rows.join("")}</tbody>`;
    $("summary-sub").textContent = `${detectors.length} detectors · ${scored.toLocaleString()} frames scored · updated ${index?.updated.slice(0, 10) ?? ""}`;

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
    // The scene with no person that has the most false alarms, over all
    // detectors.
    const events = NO_PERSON_EVENTS.map((e) => ({ e, s: sum(detectors.map((d) => d.by_setting?.event?.[e]).filter((s): s is Summary => !!s)) }));
    events.sort((a, b) => perMinute(b.s) - perMinute(a.s));
    if (events[0]?.s.false_alarms) {
      const e = events[0].e;
      const each = detectors.map((d) => { const s = d.by_setting?.event?.[e]; return s ? `${esc(d.id)} ${perMinute(s).toFixed(1)}` : ""; }).filter(Boolean).join(" · ");
      findings.push(`<li><b>False alarms:</b> the ${esc(label("event", e).toLowerCase())} causes the most <small>(${each} per minute)</small></li>`);
    }
    $("findings").innerHTML = `<li class="muted">For ${esc(best.name)}, the best detector:</li>` + findings.join("");

    $("data").innerHTML = [
      [`${base}results/index.json`, "results/index.json", "every score: overall and by setting"],
      [`${base}notable/gallery.json`, "notable/gallery.json", "the notable frames, with every setting (see Analysis)"],
      ["https://github.com/hoeksemaa/antioch/tree/main/bench", "bench/", "the Python benchmark: capture, detectors, scoring, gallery"],
    ]
      .map(([href, name, about]) => `<li><a class="mono" href="${href}">${name}</a> <small>${about}</small></li>`)
      .join("");
  }

  function renderSettings() {
    const rows: string[] = [];
    for (const axis of AXES) {
      rows.push(`<tr class="group"><td colspan="${detectors.length + 1}">${esc(axis.label)}${["person", "speed"].includes(axis.id) ? " <small>deliveries only</small>" : ""}</td></tr>`);
      for (const v of axis.values) {
        const summaries = detectors.map((d) => d.by_setting?.[axis.id]?.[v.id]);
        const first = summaries.find(Boolean);
        if (!first?.frames) continue;
        const fa = axis.id === "event" && NO_PERSON_EVENTS.includes(v.id);
        const size = fa ? `${(first.seconds / 60).toFixed(1)} min · false alarms` : `${first.in_view.toLocaleString()} frames`;
        rows.push(`<tr><td class="name"><span>${esc(v.label)}<small>${size}</small></span></td>${cells(summaries, fa)}</tr>`);
      }
    }
    rows.push(`<tr class="total"><td class="name"><span><b>All deliveries</b><small>detection rate</small></span></td>${cells(detectors.map(deliveries), false)}</tr>`);
    rows.push(`<tr class="total-2"><td class="name"><span><b>All scenes with no person</b><small>false alarms</small></span></td>${cells(detectors.map(noPersonScenes), true)}</tr>`);
    if (detectors.some((d) => d.all?.ms_per_frame)) {
      const device = detectors[0].settings.device ?? "";
      const times = detectors.map((d) => `<td class="mono" title="mean detector time for one frame">${d.all?.ms_per_frame ? `${Math.round(d.all.ms_per_frame)} ms` : "–"}</td>`).join("");
      rows.push(`<tr class="total-2"><td class="name"><span><b>Time per frame</b><small>detector only${device ? ` · ${esc(device)}` : ""}</small></span></td>${times}</tr>`);
    }
    $("by-setting").innerHTML = headRow("Setting") + `<tbody>${rows.join("")}</tbody>`;
  }

  renderHead();
  renderSummary();
  if (detectors.length) renderSettings();
}

start();
