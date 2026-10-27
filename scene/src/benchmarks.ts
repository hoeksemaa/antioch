// Benchmark page entry (TypeScript in the browser): one chart of the scores of
// the Python benchmark (scene/public/results/index.json, made by bench/run.py).
// One column for each detector (its name links to the model's page), and one
// colored row group for each category: the overall detection rate, by the
// distance of the person, by each setting, the false alarms, and the time to
// process one frame. The best value in each row is green. The notes and the
// replay are on the Analysis page.

import { AXES } from "./settings";
import { deliveries, esc, loadIndex, NO_PERSON_EVENTS, noPersonScenes, perMinute, SOURCES, type Detector, type Summary } from "./results";
import "./style.css";
import "./benchmarks.css";

// One color for each row group, red to gray. White text on each has a
// contrast of 4.5:1 or more.
const HUES: Record<string, string> = {
  rate: "#b8453a",
  distance: "#b25b14",
  house: "#8f6f0c",
  light: "#677f1b",
  weather: "#2e7f49",
  camera: "#1b7a72",
  person: "#1f6f96",
  speed: "#3d62ad",
  surfaces: "#5a55b5",
  occlusion: "#7d4aa6",
  alarms: "#9c3f7e",
  time: "#666560",
};

interface Row {
  label: string; // empty for the one row of a group
  tip: string;
  values: (number | null)[];
  show: (v: number) => string;
  higher: boolean; // higher is better
  tips?: string[]; // one for each detector
}

interface Group {
  name: string;
  unit?: string; // under the name: what the numbers are
  hue: string;
  tip: string;
  rows: Row[];
}

const DETECTED = "% detected";

const share = (v: number) => `${Math.round(v * 100)}%`;
const rate = (s?: Summary) => (s && s.in_view ? s.detected / s.in_view : null);
const frames = (s?: Summary) => (s ? `${s.detected} of ${s.in_view} frames` : "");

function groups(detectors: Detector[]): Group[] {
  const all = detectors.map(deliveries);
  const bands = Object.keys(detectors[0].all?.by_distance ?? {});
  const seen = detectors.map((d) => d.all.first_seen_m);
  const out: Group[] = [
    {
      name: "Overall detection rate",
      hue: HUES.rate,
      tip: "The share of frames with the person in view in which the detector found the person.",
      rows: [{ label: "", tip: `${all[0].in_view.toLocaleString()} frames with the person in view`, values: all.map(rate), show: share, higher: true, tips: all.map(frames) }],
    },
    {
      name: "Distance of person",
      unit: DETECTED,
      hue: HUES.distance,
      tip: "The detection rate by the distance from the doorbell to the person. First seen: the median distance of the first hit.",
      rows: [
        ...bands.map((band) => {
          const pairs = detectors.map((d) => d.all.by_distance[band]);
          return {
            label: band.replace("-", "–"),
            tip: `${pairs[0][1].toLocaleString()} frames with the person in view`,
            values: pairs.map(([n, of]) => (of ? n / of : null)),
            show: share,
            higher: true,
            tips: pairs.map(([n, of]) => `${n} of ${of} frames`),
          };
        }),
        { label: "First seen", tip: "The median distance of the first hit", values: seen, show: (v) => `${v.toFixed(1)} m`, higher: true },
      ],
    },
  ];
  for (const axis of AXES) {
    if (axis.id === "event") continue; // its delivery row is the detection rate; the rest are false alarms
    const rows = axis.values
      .map((v): Row | null => {
        const summaries = detectors.map((d) => d.by_setting?.[axis.id]?.[v.id]);
        if (!summaries[0]?.in_view) return null;
        return { label: v.label, tip: `${summaries[0].in_view.toLocaleString()} frames with the person in view`, values: summaries.map(rate), show: share, higher: true, tips: summaries.map(frames) };
      })
      .filter((r): r is Row => r !== null);
    if (rows.length) out.push({ name: axis.label, unit: DETECTED, hue: HUES[axis.id], tip: `The detection rate for each ${axis.label.toLowerCase()} setting.`, rows });
  }
  const scene = AXES.find((a) => a.id === "event")!;
  const alarms = (summaries: (Summary | undefined)[], label: string): Row => ({
    label,
    tip: summaries[0] ? `${(summaries[0].seconds / 60).toFixed(1)} min of scene time` : "",
    values: summaries.map((s) => (s && s.seconds ? perMinute(s) : null)),
    show: (v) => `${v.toFixed(1)}/min`,
    higher: false,
    tips: summaries.map((s) => (s ? `${s.false_alarms} false alarms in ${Math.round(s.seconds)} s` : "")),
  });
  out.push({
    name: "False alarms",
    unit: "per minute",
    hue: HUES.alarms,
    tip: "Person boxes per minute in scenes with no person. Lower is better.",
    rows: [
      ...NO_PERSON_EVENTS.map((e) => alarms(detectors.map((d) => d.by_setting?.event?.[e]), scene.values.find((v) => v.id === e)?.label ?? e)),
      alarms(detectors.map(noPersonScenes), "All with no person"),
    ],
  });
  const device = detectors[0].settings.device;
  out.push({
    name: "Time to process one frame",
    hue: HUES.time,
    tip: `The mean time for each model to process one frame${device ? `, on ${device}` : ""}. Lower is better.`,
    rows: [{ label: "", tip: device ? `On ${device}` : "", values: detectors.map((d) => d.all.ms_per_frame ?? null), show: (v) => `${Math.round(v)} ms`, higher: false }],
  });
  return out;
}

function render(detectors: Detector[]) {
  const head = detectors
    .map((d) => {
      // Non-breaking hyphens, so a name wraps only at its spaces.
      const name = `${esc(d.name).replace(/-/g, "\u2011")}<span> ↗</span>`;
      const link = SOURCES[d.id] ? `<a href="${SOURCES[d.id]}" target="_blank" rel="noopener">${name}</a>` : esc(d.name);
      return `<th title="${esc(d.source)}">${link}</th>`;
    })
    .join("");
  const body = groups(detectors)
    .map((g) => {
      const rows = g.rows.map((r, i) => {
        const known = r.values.filter((v): v is number => v !== null);
        const top = known.length > 1 ? (r.higher ? Math.max(...known) : Math.min(...known)) : null;
        const cells = r.values
          .map((v, j) => {
            if (v === null) return `<td>–</td>`;
            const best = v === top;
            return `<td class="${best ? "best" : ""}" title="${esc((r.tips?.[j] ?? "") + (best ? " · best" : ""))}">${r.show(v)}</td>`;
          })
          .join("");
        // A group of one row with no label: its block covers the label column.
        const alone = g.rows.length === 1 && !r.label;
        const name = `${esc(g.name)}${g.unit ? `<small>${esc(g.unit)}</small>` : ""}`;
        const group = i === 0 ? `<th class="group" ${alone ? 'colspan="2"' : `rowspan="${g.rows.length}"`} title="${esc(g.tip)}">${name}</th>` : "";
        const label = alone ? "" : `<th class="row" title="${esc(r.tip)}">${esc(r.label)}</th>`;
        return `<tr>${group}${label}${cells}</tr>`;
      });
      return `<tbody style="--hue:${g.hue}">${rows.join("")}</tbody>`;
    })
    .join("");
  // The group and row label columns, then one column of the same width for
  // each detector.
  const cols = `<colgroup><col class="c-group" /><col class="c-row" />${detectors.map(() => "<col />").join("")}</colgroup>`;
  document.getElementById("chart")!.innerHTML = `${cols}<thead><tr><th class="corner" colspan="2"></th>${head}</tr></thead>${body}`;
}

async function start() {
  const index = await loadIndex();
  if (index?.detectors.length) render(index.detectors);
  else document.getElementById("chart")!.innerHTML = `<tbody><tr><td class="muted">No results yet. Run bench/run.py (Python) to make them.</td></tr></tbody>`;
}

start();
