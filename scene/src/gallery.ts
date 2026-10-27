// Gallery page entry (TypeScript in the browser, gallery.html).
// - The replay (replay.ts) of any benchmark scene, frame by frame.
// - The notable frames that bench/gallery.py (Python) picked from the run,
//   from public/notable/gallery.json: one picture each, with no text. A click
//   on a picture loads that frame in the replay.

import { startReplay, type Replay } from "./replay";
import { base, bestDetector, esc, loadIndex } from "./results";
import "./analytics";
import "./style.css";
import "./gallery.css";

interface Picture {
  thumb: string;
  focus: string | null;
  reason: string;
  scenario: { id: string };
  frame: { t: number };
}

const $ = (id: string) => document.getElementById(id)!;

async function start() {
  const params = new URLSearchParams(location.search);
  let replay: Replay | null = null;
  // The URL keeps the replay's scene and detector.
  function saveUrl() {
    const r = replay?.state();
    const p = new URLSearchParams(r ? { replay: r.scenario, detector: r.detector } : {});
    history.replaceState(null, "", p.size ? `?${p}` : location.pathname);
  }

  const index = await loadIndex();
  if (index?.detectors.length && index.scenarios.length) {
    const best = bestDetector(index.detectors).id;
    const t = params.get("t");
    const first = { scenario: params.get("replay") ?? index.scenarios[0].id, detector: params.get("detector") ?? best, t: t !== null ? Number(t) : undefined };
    if (!index.scenarios.some((s) => s.id === first.scenario)) first.scenario = index.scenarios[0].id;
    replay = await startReplay(index, first, saveUrl);
  } else {
    $("replay").hidden = true;
  }

  let pictures: Picture[] = [];
  try {
    const res = await fetch(`${base}notable/gallery.json`);
    if (res.ok) pictures = (await res.json()).pictures;
  } catch {
    // No gallery yet: the grid stays empty.
  }
  $("shots").innerHTML = pictures
    .map(
      (p) =>
        `<button type="button" class="shot" title="${esc(p.reason)}" data-replay="${esc(p.scenario.id)}" data-detector="${esc(p.focus ?? "")}" data-t="${p.frame.t}">` +
        `<img src="${base}notable/${p.thumb}" alt="${esc(p.reason)}" loading="lazy" /></button>`,
    )
    .join("");
  // A click on a picture: load that frame in the replay above.
  $("shots").addEventListener("click", async (event) => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-replay]");
    if (!b || !replay) return;
    for (const x of $("shots").querySelectorAll(".shot.on")) x.classList.remove("on");
    b.classList.add("on");
    await replay.select(b.dataset.replay!, b.dataset.detector || replay.state().detector, Number(b.dataset.t));
    $("replay").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

start();
