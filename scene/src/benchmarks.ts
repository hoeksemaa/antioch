// Benchmark page entry (TypeScript in the browser): one chart of the scores of
// the Python benchmark (scene/public/results/index.json, made by bench/run.py).
// One column for each detector (its name links to the model's page, with one
// sentence on the model and its parameter count under it), and one
// colored row group for each category: the overall detection rate, by the
// distance of the person, by each setting, the false alarms, and the time to
// process one frame. The best value in each row is green. The notes and the
// replay are on the Analysis page.

import { AXES, type AxisId } from "./settings";
import { base, deliveries, esc, loadIndex, MODELS, NO_PERSON_EVENTS, noPersonScenes, perMinute, type Detector, type Summary } from "./results";
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
  // Three header rows, so each line up across the columns: the names, one
  // sentence on each model, and the parameter counts.
  const names = detectors
    .map((d) => {
      // Non-breaking hyphens, so a name wraps only at its spaces.
      const name = `${esc(d.name).replace(/-/g, "\u2011")}<span> ↗</span>`;
      const m = MODELS[d.id];
      return `<th class="name" title="${esc(d.source)}">${m ? `<a href="${m.url}" target="_blank" rel="noopener">${name}</a>` : esc(d.name)}</th>`;
    })
    .join("");
  const about = detectors.map((d) => `<th class="about">${esc(MODELS[d.id]?.about ?? "")}</th>`).join("");
  const params = detectors.map((d) => `<th class="params">${MODELS[d.id] ? `${(MODELS[d.id].params / 1e6).toFixed(1)}M parameters` : ""}</th>`).join("");
  const head = `<tr><th class="corner" colspan="2" rowspan="3"></th>${names}</tr><tr>${about}</tr><tr>${params}</tr>`;
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
        const name = `${esc(g.name)}${g.unit ? `<small>${esc(g.unit)}</small>` : ""}`;
        const group = i === 0 ? `<th class="group" rowspan="${g.rows.length}" title="${esc(g.tip)}">${name}</th>` : "";
        return `<tr>${group}<th class="row" title="${esc(r.tip)}">${esc(r.label)}</th>${cells}</tr>`;
      });
      return `<tbody style="--hue:${g.hue}">${rows.join("")}</tbody>`;
    })
    .join("");
  // The group and row label columns, then one column of the same width for
  // each detector.
  const cols = `<colgroup><col class="c-group" /><col class="c-row" />${detectors.map(() => "<col />").join("")}</colgroup>`;
  document.getElementById("chart")!.innerHTML = `${cols}<thead>${head}</thead>${body}`;
}

// The picture under the intro: one frame with the best detector's box
// (notable/hero.json, from bench/gallery.py).
async function showHero(detectors: Detector[]) {
  const res = await fetch(`${base}notable/hero.json`).catch(() => null);
  if (!res?.ok) return;
  const hero: { picture: string; detector: string; score: number | null; scenario: { settings: Record<AxisId, string> }; frame: { distance_m: number | null } } = await res.json();
  const name = detectors.find((d) => d.id === hero.detector)?.name ?? hero.detector;
  const s = hero.scenario.settings;
  const setting = (axis: AxisId) => AXES.find((a) => a.id === axis)?.values.find((v) => v.id === s[axis])?.label ?? s[axis];
  const img = document.querySelector<HTMLImageElement>("#hero img")!;
  img.src = `${base}notable/${hero.picture}`;
  img.alt = `${name} finds the person on the path to the porch`;
  const where = [setting("house"), setting("light"), setting("weather"), `${setting("camera")} camera`].join(" · ").toLowerCase();
  document.getElementById("hero-caption")!.textContent =
    `${name} finds the person` + (hero.score !== null ? ` (score ${hero.score.toFixed(2)})` : "") + (hero.frame.distance_m !== null ? `, ${hero.frame.distance_m.toFixed(1)} m away` : "") + ` · ${where}`;
  document.getElementById("hero")!.hidden = false;
}

async function start() {
  const index = await loadIndex();
  if (index?.detectors.length) showHero(index.detectors);
  if (index?.detectors.length) render(index.detectors);
  else document.getElementById("chart")!.innerHTML = `<tbody><tr><td class="muted">No results yet. Run bench/run.py (Python) to make them.</td></tr></tbody>`;
}

start();
