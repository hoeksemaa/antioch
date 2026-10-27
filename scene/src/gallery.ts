// Gallery page entry (TypeScript in the browser). Shows the notable frames
// that bench/gallery.py (Python) picked from the benchmark run, from
// public/notable/gallery.json: one card for each picture, in groups, with
// every setting, each detector's result, and links to the frame and its
// replay.

import { AXES, type AxisId } from "./settings";
import "./style.css";
import "./gallery.css";

interface Result {
  hit: boolean | null;
  iou: number | null;
  fa: number;
  dets: number[][]; // [x0, y0, x1, y1, score]
  low?: number[][];
}

interface Picture {
  picture: string;
  thumb: string;
  category: string;
  focus: string | null;
  reason: string;
  scenario: { id: string; name: string; settings: Record<AxisId, string>; query: string };
  frame: { index: number; t: number; phase: string; distance_m: number | null };
  detectors: Record<string, Result>;
}

interface Gallery {
  detectors: string[];
  colors: Record<string, [number, number, number]>;
  categories: { id: string; title: string; about: string }[];
  pictures: Picture[];
}

const base = import.meta.env.BASE_URL;
const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const rgb = (c: [number, number, number] | undefined) => (c ? `rgb(${c.join(" ")})` : "currentColor");

function settings(p: Picture) {
  const s = p.scenario.settings;
  return AXES.filter((a) => !(s.event !== "delivery" && (a.id === "person" || a.id === "speed")))
    .map((a) => `<span>${esc(a.label)} <b>${esc(a.values.find((v) => v.id === s[a.id])?.label ?? s[a.id])}</b></span>`)
    .join("");
}

function result(r: Result) {
  const top = r.dets.length ? Math.max(...r.dets.map((b) => b[4])) : null;
  const low = r.low?.length ? Math.max(...r.low.map((b) => b[4])) : null;
  const state = r.hit === null ? (r.dets.length ? "fa" : "none") : r.hit ? "hit" : "miss";
  const text = { hit: "hit", miss: "miss", fa: "false alarm", none: "no box" }[state];
  const score = top !== null ? ` ${top.toFixed(2)}` : low !== null ? ` <small>(low ${low.toFixed(2)})</small>` : "";
  // "r-" classes: .hit and .miss are the timeline strip colors in style.css.
  return `<b class="r-${state}">${text}${score}</b>${r.fa && r.hit !== null ? ` <small>+${r.fa} FA</small>` : ""}`;
}

function card(p: Picture, g: Gallery) {
  const where = p.frame.distance_m !== null ? `${p.frame.distance_m.toFixed(1)} m` : "no person";
  const replay = `./benchmarks.html?scenario=${p.scenario.id}${p.focus ? `&detector=${p.focus}` : ""}`;
  const frame = `./?${p.scenario.query}&view=doorbell&t=${p.frame.t}`;
  const dets = g.detectors
    .map((d) => `<li class="${d === p.focus ? "focus" : ""}"><i style="background:${rgb(g.colors[d])}"></i><span>${esc(d)}</span>${result(p.detectors[d])}</li>`)
    .join("");
  return `<article class="shot card">
    <a class="shot-image" href="${base}notable/${p.picture}" target="_blank" rel="noopener"><img src="${base}notable/${p.thumb}" alt="${esc(p.reason)}" loading="lazy" /></a>
    <div class="shot-body">
      <div class="shot-reason">${esc(p.reason)}</div>
      <div class="mono muted">${esc(p.scenario.id)} · t ${p.frame.t.toFixed(1)} s · ${esc(p.frame.phase)} · ${where}</div>
      <div class="tags">${settings(p)}</div>
      <ul class="dets">${dets}</ul>
      <div class="links"><a href="${frame}">Open frame</a><a href="${replay}">Replay</a><a href="${base}notable/${p.picture}" target="_blank" rel="noopener">Full size</a></div>
    </div>
  </article>`;
}

async function start() {
  let g: Gallery | null = null;
  try {
    const res = await fetch(`${base}notable/gallery.json`);
    if (res.ok) g = await res.json();
  } catch {
    // No gallery yet: the page says so.
  }
  if (!g || !g.pictures.length) {
    $("groups").innerHTML = `<p class="muted">No pictures yet. Run bench/gallery.py (Python) after a benchmark run.</p>`;
    return;
  }
  const gallery = g;
  $("key").innerHTML =
    `<span><i class="truth"></i>true box</span>` + gallery.detectors.map((d) => `<span><i style="border-color:${rgb(gallery.colors[d])}"></i>${esc(d)}</span>`).join("");

  const params = new URLSearchParams(location.search);
  let group = gallery.categories.some((c) => c.id === params.get("group")) ? params.get("group") : null;

  function render() {
    const count = (id: string) => gallery.pictures.filter((p) => p.category === id).length;
    $("filters").innerHTML =
      `<button class="${group ? "" : "on"}" data-group="">All <small>${gallery.pictures.length}</small></button>` +
      gallery.categories.map((c) => `<button class="${group === c.id ? "on" : ""}" data-group="${c.id}">${esc(c.title)} <small>${count(c.id)}</small></button>`).join("");
    $("groups").innerHTML = gallery.categories
      .filter((c) => !group || c.id === group)
      .map((c) => {
        const cards = gallery.pictures.filter((p) => p.category === c.id).map((p) => card(p, gallery)).join("");
        return `<section class="group" id="${c.id}"><h2>${esc(c.title)}</h2><p class="lede">${esc(c.about)}</p><div class="grid">${cards}</div></section>`;
      })
      .join("");
    const p = new URLSearchParams();
    if (group) p.set("group", group);
    history.replaceState(null, "", p.size ? `?${p}` : location.pathname);
  }

  $("filters").addEventListener("click", (event) => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b) return;
    group = b.dataset.group || null;
    render();
  });
  render();
}

start();
