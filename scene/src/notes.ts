// Analysis page: the notes on the benchmark scores (the markup is #notes in
// gallery.html). The largest differences within one setting for the best
// detector, how the scores are counted, and the data files. Everything comes
// from results/index.json.

import { AXES } from "./settings";
import { base, bestDetector, esc, NO_PERSON_EVENTS, perMinute, sum, type Index, type Summary } from "./results";

const $ = (id: string) => document.getElementById(id)!;
const share = (v: number) => `${Math.round(v * 100)}%`;
const label = (axis: string, value: string) => AXES.find((a) => a.id === axis)?.values.find((v) => v.id === value)?.label ?? value;

export function renderNotes(index: Index) {
  const { detectors } = index;
  if (!detectors.length) return;
  const best = bestDetector(detectors);

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

  const s = detectors[0].settings;
  $("counting").innerHTML =
    `<b>Detection rate:</b> the share of frames with the person in view in which the detector found the person. ` +
    `<b>False alarms:</b> person boxes per minute in scenes with no person (dog, passing car, empty). ` +
    `A box counts at a score of ${s.min_score} or more, and it is a hit when it overlaps the true box by an IoU of ${s.min_iou} or more. ` +
    `Frames at ${s.fps} fps` + (s.device ? `; the detectors ran on ${esc(s.device)}.` : ".");

  const scored = detectors.reduce((n, d) => n + (d.all?.frames ?? 0), 0);
  $("data").innerHTML =
    `<li class="muted">${detectors.length} detectors · ${scored.toLocaleString()} frames scored · updated ${esc(index.updated.slice(0, 10)).replace(/-/g, "\u2011")}</li>` +
    [
      [`${base}results/index.json`, "results/index.json", "every score: overall and by setting"],
      [`${base}notable/gallery.json`, "notable/gallery.json", "the notable frames, with every setting"],
      ["https://github.com/hoeksemaa/antioch/tree/main/bench", "bench/", "the Python benchmark: capture, detectors, scoring, gallery"],
    ]
      .map(([href, name, about]) => `<li><a class="mono" href="${href}">${name}</a> <small>${about}</small></li>`)
      .join("");
}
