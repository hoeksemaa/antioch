"""Python: the benchmark. Captures frames from the Three.js scene, runs each
person detector on each frame, and scores it against the scene's ground truth.

The scenarios are the fixed list in bench/scenarios.json (100 mixes of all
the scene's axes, each with its own seed; see bench/scenarios.py), so every
detector runs on the same frames.

Start the scene first (Three.js, in scene/): cd scene && npm run dev
Then, from the repo root:
    bench/.venv/bin/python bench/run.py                          # all detectors, all scenarios
    bench/.venv/bin/python bench/run.py --detectors ssdlite
    bench/.venv/bin/python bench/run.py --limit 5                # the first 5 scenarios only
    bench/.venv/bin/python bench/run.py --scenarios s001 s007
    bench/.venv/bin/python bench/run.py --url https://antioch-demo-hoeksema.vercel.app

Progress: one line for each scenario and detector, printed as soon as it is
scored, so a terminal (or a chat that watches the output) can follow the run:
    [ 12/100] s012 ssdlite  46% (21/46)  FA 0  | so far 58% | stoop · ... | 62 frames, 14 s, about 22 min left
At the end it prints the results by setting (each value of each axis).

Writes the results for the Benchmarks page to scene/public/results/:
index.json (one summary for each detector and scenario, and by setting) and
<detector>/<scenario>.json (every frame). A new run replaces the results for
the detectors and scenarios it runs and keeps the others; results for
scenarios that are not in the list are dropped. --images also writes
marked-up frames to bench/out/<detector>/<scenario>/ (green: true box, red:
detections).
"""

import argparse
import json
import random
import time
from datetime import datetime, timezone
from pathlib import Path

import torch
from PIL import ImageDraw

from capture import Box, Frame, Scene
from detector import DETECTORS, PersonDetector
from scenarios import AXES

BANDS = [(0, 3), (3, 6), (6, 9), (9, 12), (12, None)]  # distance bands, m
# A detection matches the person when its overlap with the true box (IoU) is
# at least this. It is lower than the usual 0.5 because the true box also
# covers body parts that walls or rails hide.
MIN_IOU = 0.3
SCENARIOS = Path(__file__).parent / "scenarios.json"
RESULTS = Path(__file__).parent.parent / "scene" / "public" / "results"
IMAGES = Path(__file__).parent / "out"
# Axes that apply only when a person is in the scene.
PERSON_AXES = {"person", "speed"}


def iou(a: Box, b: Box) -> float:
    w = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    h = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = w * h
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def score(frame: Frame, detections: list[tuple[Box, float]]) -> dict:
    """hit is None when the person is out of view (or there is no person),
    else True or False. Every person box that does not match the person is a
    false alarm."""
    if frame.truth is None:
        return {"hit": None, "fa": len(detections)}
    best = max((iou(frame.truth, box) for box, _ in detections), default=0.0)
    hit = best >= MIN_IOU
    return {"hit": hit, "fa": len(detections) - int(hit)}


def band_name(lo: float, hi: float | None) -> str:
    return f"{lo}-{hi} m" if hi is not None else f"{lo}+ m"


def summarize(frames: list[dict], fps: float) -> dict:
    in_view = [f for f in frames if f["hit"] is not None]
    first = next((f for f in frames if f["phase"] == "approach" and f["hit"]), None)
    bands = {}
    for lo, hi in BANDS:
        rows = [f for f in in_view if f["d"] >= lo and (hi is None or f["d"] < hi)]
        bands[band_name(lo, hi)] = [sum(f["hit"] for f in rows), len(rows)]
    return {
        "frames": len(frames),
        "seconds": round(len(frames) / fps, 2),  # scene time
        "in_view": len(in_view),
        "detected": sum(f["hit"] for f in in_view),
        "first_seen_m": round(first["d"], 1) if first else None,
        "false_alarms": sum(f["fa"] for f in frames),
        "by_distance": bands,  # band: [detected, in view]
    }


def total(summaries: list[dict]) -> dict:
    """Sums of the counts, for "all scenarios" and for each setting."""
    out = {key: sum(s[key] for s in summaries) for key in ["frames", "in_view", "detected", "false_alarms"]}
    out["seconds"] = round(sum(s["seconds"] for s in summaries), 2)
    out["scenarios"] = len(summaries)
    firsts = sorted(s["first_seen_m"] for s in summaries if s["first_seen_m"] is not None)
    out["first_seen_m"] = firsts[len(firsts) // 2] if firsts else None  # median
    out["by_distance"] = {
        band_name(lo, hi): [sum(s["by_distance"][band_name(lo, hi)][i] for s in summaries) for i in (0, 1)]
        for lo, hi in BANDS
    }
    return out


def by_setting(results: dict, scenarios: list[dict]) -> dict:
    """axis -> value -> totals over the scenarios with that value. Person and
    speed count only the deliveries (the other events have no person)."""
    out = {}
    for axis, values in AXES.items():
        rows = {v: [] for v in values}
        for s in scenarios:
            if s["id"] in results and not (axis in PERSON_AXES and s["settings"]["event"] != "delivery"):
                rows[s["settings"][axis]].append(results[s["id"]])
        out[axis] = {value: total(r) for value, r in rows.items() if r}
    return out


def save_image(frame: Frame, detections: list[tuple[Box, float]], result: dict, folder: Path):
    image = frame.image.copy()
    draw = ImageDraw.Draw(image)
    w, h = image.size
    scale = lambda b: (b[0] * w, b[1] * h, b[2] * w, b[3] * h)
    if frame.truth:
        draw.rectangle(scale(frame.truth), outline=(40, 220, 90), width=3)
    for box, s in detections:
        x0, y0, x1, y1 = scale(box)
        draw.rectangle((x0, y0, x1, y1), outline=(235, 50, 50), width=3)
        draw.text((x0 + 4, y0 + 4), f"person {s:.2f}", fill=(235, 50, 50))
    status = {True: "hit", False: "miss", None: "out"}[result["hit"]]
    distance = f"{frame.distance:.1f} m" if frame.distance is not None else "no person"
    draw.text((10, 10), f"{frame.scenario}  t={frame.t:.1f}s  {frame.phase}  {distance}  {status}", fill=(255, 255, 255))
    image.save(folder / f"{frame.t:06.2f}-{status}.jpg", quality=85)


def pct(n: int, d: int) -> str:
    return f"{100 * n / d:.0f}%" if d else "-"


def per_minute(s: dict) -> str:
    return f"{s['false_alarms'] / s['seconds'] * 60:.1f}/min" if s["seconds"] else "-"


def minutes(seconds: float) -> str:
    return f"{seconds / 60:.0f} min" if seconds >= 90 else f"{seconds:.0f} s"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default="http://localhost:5173", help="where the Three.js scene runs")
    parser.add_argument("--scenarios", nargs="+", help="scenario ids (default: all in bench/scenarios.json)")
    parser.add_argument("--limit", type=int, help="run only the first N scenarios")
    parser.add_argument("--detectors", nargs="+", default=list(DETECTORS), choices=list(DETECTORS))
    parser.add_argument("--fps", type=float, default=2, help="frames per second of scene time")
    parser.add_argument("--min-score", type=float, default=0.5, help="detector confidence threshold")
    parser.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu", help="torch device for the detectors")
    parser.add_argument("--images", action="store_true", help="also write marked-up frames to bench/out/")
    parser.add_argument("--recapture", action="store_true", help="render the frames again, not from bench/frames/")
    parser.add_argument("--software", action="store_true", help="render without the GPU (slow)")
    args = parser.parse_args()
    random.seed(0)
    torch.manual_seed(0)
    # No torch.use_deterministic_algorithms: on MPS it makes the detectors
    # about 180 times slower. Two runs on MPS gave the same boxes without it.

    preset = json.loads(SCENARIOS.read_text())["scenarios"]
    chosen = [s for s in preset if not args.scenarios or s["id"] in args.scenarios][: args.limit]
    detectors = [PersonDetector(d, args.min_score, args.device) for d in args.detectors]
    index_file = RESULTS / "index.json"
    index = json.loads(index_file.read_text()) if index_file.exists() else {"detectors": []}
    started = time.time()
    summaries = {d.id: {} for d in detectors}
    print(f"{len(chosen)} scenarios × {len(detectors)} detectors ({', '.join(d.id for d in detectors)}) on {args.device}, {args.fps} fps, min score {args.min_score}, IoU >= {MIN_IOU}", flush=True)

    with Scene(args.url, gpu=not args.software, recapture=args.recapture) as scene:
        for n, scenario in enumerate(chosen, 1):
            began = time.time()
            frames, cached = scene.frames(scenario, args.fps)
            for detector in detectors:
                records = []
                for frame in frames:
                    detections = detector(frame.image)
                    result = score(frame, detections)
                    records.append({
                        "t": frame.t,
                        "phase": frame.phase,
                        "d": round(frame.distance, 2) if frame.distance is not None else None,
                        "truth": [round(v, 4) for v in frame.truth] if frame.truth else None,
                        "dets": [[*(round(v, 4) for v in box), round(s, 3)] for box, s in detections],
                        **result,
                    })
                    if args.images:
                        folder = IMAGES / detector.id / scenario["id"]
                        folder.mkdir(parents=True, exist_ok=True)
                        save_image(frame, detections, result, folder)
                out = RESULTS / detector.id / f"{scenario['id']}.json"
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_text(json.dumps({"fps": args.fps, "frames": records}, separators=(",", ":")))
                s = summaries[detector.id][scenario["id"]] = summarize(records, args.fps)
                so_far = total(list(summaries[detector.id].values()))
                left = (time.time() - started) / n * (len(chosen) - n)
                found = f"{pct(s['detected'], s['in_view']):>4} ({s['detected']}/{s['in_view']})" if s["in_view"] else "no person"
                print(
                    f"[{n:3d}/{len(chosen)}] {scenario['id']} {detector.id:<15} {found:<14} FA {s['false_alarms']:<3}"
                    f"| so far {pct(so_far['detected'], so_far['in_view']):>4} | {scenario['name']} "
                    f"| {len(frames)} frames{' (cached)' if cached else ''}, {time.time() - began:.0f} s, about {minutes(left)} left",
                    flush=True,
                )

    # Merge into the index: keep results this run did not touch, for the
    # scenarios in the list; drop the rest.
    ids = {s["id"] for s in preset}
    index["scenarios"] = preset
    index["updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    kept = []
    for d in index["detectors"]:
        if d["id"] in summaries or d["id"] not in DETECTORS:
            continue
        old = {k: v for k, v in d.get("results", {}).items() if k in ids}
        if old:
            kept.append({**d, "results": old})
    for detector in detectors:
        old = next((d for d in index["detectors"] if d["id"] == detector.id), {})
        results = {k: v for k, v in old.get("results", {}).items() if k in ids}
        results.update(summaries[detector.id])
        kept.append({
            "id": detector.id,
            "name": detector.name,
            "source": detector.source,
            "settings": {"min_score": args.min_score, "min_iou": MIN_IOU, "fps": args.fps, "device": args.device},
            "run": index["updated"],
            "results": results,
        })
    for d in kept:
        d["results"] = {s["id"]: d["results"][s["id"]] for s in preset if s["id"] in d["results"]}
        d["all"] = total(list(d["results"].values()))
        d["by_setting"] = by_setting(d["results"], preset)
    # Columns on the results page follow the order of DETECTORS.
    order = list(DETECTORS)
    index["detectors"] = sorted(kept, key=lambda d: order.index(d["id"]))
    RESULTS.mkdir(parents=True, exist_ok=True)
    index_file.write_text(json.dumps(index, indent=1))

    print(f"\nResults by setting ({time.time() - started:.0f} s). Detection rate: person in view, deliveries only. FA: false alarms per minute, no-person events only.\n", flush=True)
    shown = [d for d in index["detectors"] if d["id"] in summaries]
    print(f"{'setting':<11}{'value':<10}" + "".join(f"{d['id']:>17}" for d in shown))
    for axis, values in shown[0]["by_setting"].items():
        for value in values:
            cells = ""
            for d in shown:
                s = d["by_setting"][axis].get(value)
                cells += f"{(per_minute(s) if axis == 'event' and value != 'delivery' else pct(s['detected'], s['in_view'])) if s else '-':>17}"
            print(f"{axis:<11}{value:<10}{cells}")
    print(f"{'all':<11}{'':<10}" + "".join(f"{pct(d['all']['detected'], d['all']['in_view']):>17}" for d in shown))
    print(f"\nWrote {RESULTS}/", flush=True)


if __name__ == "__main__":
    main()
