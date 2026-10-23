"""Python: the benchmark. Captures frames from the Three.js scene, runs each
person detector on each frame, and scores it against the scene's ground truth.

Start the scene first (Three.js, in scene/): cd scene && npm run dev
Then, from the repo root:
    bench/.venv/bin/python bench/run.py
    bench/.venv/bin/python bench/run.py --scenarios porch stoop --detectors ssdlite
    bench/.venv/bin/python bench/run.py --seed 7        # or --seed random
    bench/.venv/bin/python bench/run.py --url https://antioch-demo-hoeksema.vercel.app

Writes the results for the results page (scene/results.html) to
scene/public/results/: index.json (one summary per detector and scenario) and
<detector>/<scenario>.json (every frame). A new run replaces the results for
the detectors and scenarios it runs and keeps the others. --images also writes
marked-up frames to bench/out/<detector>/<scenario>/ (green: true box, red:
detections).

Seeds: --seed (default 0) seeds Python, torch, and every random choice in the
scene, so the same seed gives the same results. --seed random picks a new seed;
the seed is saved with the results, so that run can be replayed too.
"""

import argparse
import json
import random
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path

import torch
from PIL import ImageDraw

from capture import Box, Frame, Scene
from detector import DETECTORS, PersonDetector

BANDS = [(0, 3), (3, 6), (6, 9), (9, 12), (12, None)]  # distance bands, m
# A detection matches the person when its overlap with the true box (IoU) is
# at least this. It is lower than the usual 0.5 because the true box also
# covers body parts that walls or rails hide.
MIN_IOU = 0.3
RESULTS = Path(__file__).parent.parent / "scene" / "public" / "results"
IMAGES = Path(__file__).parent / "out"


def iou(a: Box, b: Box) -> float:
    w = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    h = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = w * h
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def score(frame: Frame, detections: list[tuple[Box, float]]) -> dict:
    """hit is None when the person is out of view, else True or False.
    Every person box that does not match the person is a false alarm."""
    if frame.truth is None:
        return {"hit": None, "fa": len(detections)}
    best = max((iou(frame.truth, box) for box, _ in detections), default=0.0)
    hit = best >= MIN_IOU
    return {"hit": hit, "fa": len(detections) - int(hit)}


def band_name(lo: float, hi: float | None) -> str:
    return f"{lo}-{hi} m" if hi is not None else f"{lo}+ m"


def summarize(frames: list[dict]) -> dict:
    in_view = [f for f in frames if f["hit"] is not None]
    first = next((f for f in frames if f["phase"] == "approach" and f["hit"]), None)
    bands = {}
    for lo, hi in BANDS:
        rows = [f for f in in_view if f["d"] >= lo and (hi is None or f["d"] < hi)]
        bands[band_name(lo, hi)] = [sum(f["hit"] for f in rows), len(rows)]
    return {
        "frames": len(frames),
        "in_view": len(in_view),
        "detected": sum(f["hit"] for f in in_view),
        "first_seen_m": round(first["d"], 1) if first else None,
        "false_alarms": sum(f["fa"] for f in frames),
        "by_distance": bands,  # band: [detected, in view]
    }


def total(summaries: list[dict]) -> dict:
    """The "all scenarios" row: sums of the counts."""
    out = {key: sum(s[key] for s in summaries) for key in ["frames", "in_view", "detected", "false_alarms"]}
    out["first_seen_m"] = None
    out["by_distance"] = {
        band_name(lo, hi): [sum(s["by_distance"][band_name(lo, hi)][i] for s in summaries) for i in (0, 1)]
        for lo, hi in BANDS
    }
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
    draw.text((10, 10), f"{frame.scenario}  t={frame.t:.1f}s  {frame.phase}  {frame.distance:.1f} m  {status}", fill=(255, 255, 255))
    image.save(folder / f"{frame.t:06.2f}-{status}.jpg", quality=85)


def pct(n: int, d: int) -> str:
    return f"{100 * n / d:.0f}%" if d else "-"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default="http://localhost:5173", help="where the Three.js scene runs")
    parser.add_argument("--scenarios", nargs="+", help="scenario ids (default: all that the scene offers)")
    parser.add_argument("--detectors", nargs="+", default=list(DETECTORS), choices=list(DETECTORS))
    parser.add_argument("--fps", type=float, default=2, help="frames per second of scene time")
    parser.add_argument("--min-score", type=float, default=0.5, help="detector confidence threshold")
    parser.add_argument("--images", action="store_true", help="also write marked-up frames to bench/out/")
    parser.add_argument("--seed", default="0", help='an integer, or "random" for a new seed (default 0)')
    args = parser.parse_args()
    seed = secrets.randbelow(2**31) if args.seed == "random" else int(args.seed)
    random.seed(seed)
    torch.manual_seed(seed)
    torch.use_deterministic_algorithms(True, warn_only=True)

    detectors = [PersonDetector(d, args.min_score) for d in args.detectors]
    index_file = RESULTS / "index.json"
    index = json.loads(index_file.read_text()) if index_file.exists() else {"scenarios": [], "detectors": []}
    started = time.time()

    with Scene(args.url) as scene:
        offered = scene.scenarios()
        chosen = [s for s in offered if not args.scenarios or s["id"] in args.scenarios]
        summaries = {d.id: {} for d in detectors}
        for scenario in chosen:
            frames = scene.frames(scenario, args.fps, seed)
            for detector in detectors:
                records = []
                for frame in frames:
                    detections = detector(frame.image)
                    result = score(frame, detections)
                    records.append({
                        "t": frame.t,
                        "phase": frame.phase,
                        "d": round(frame.distance, 2),
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
                summaries[detector.id][scenario["id"]] = summarize(records)
            print(f"  {scenario['id']}: {len(frames)} frames")

    # Merge into the index: keep results this run did not touch.
    index["scenarios"] = offered
    index["updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for detector in detectors:
        old = next((d for d in index["detectors"] if d["id"] == detector.id), None)
        kept = {k: v for k, v in (old or {}).get("results", {}).items() if k != "all"}
        results = {**kept, **summaries[detector.id]}
        results = {s["id"]: results[s["id"]] for s in offered if s["id"] in results}
        results["all"] = total(list(results.values()))
        entry = {
            "id": detector.id,
            "name": detector.name,
            "source": detector.source,
            "settings": {"min_score": args.min_score, "min_iou": MIN_IOU, "fps": args.fps, "seed": seed},
            "run": index["updated"],
            "results": results,
        }
        index["detectors"] = [entry if d["id"] == detector.id else d for d in index["detectors"]]
        if old is None:
            index["detectors"].append(entry)
    # Columns on the results page follow the order of DETECTORS.
    order = list(DETECTORS)
    index["detectors"].sort(key=lambda d: order.index(d["id"]) if d["id"] in order else len(order))
    RESULTS.mkdir(parents=True, exist_ok=True)
    index_file.write_text(json.dumps(index, indent=1))

    print(f"\nDetection rate (person in view). Seed {seed}, min score {args.min_score}, IoU >= {MIN_IOU}, {args.fps} fps, {time.time() - started:.0f} s\n")
    ids = [s["id"] for s in chosen] + ["all"]
    print(f"{'scenario':<10}" + "".join(f"{d.id:>18}" for d in detectors))
    for sid in ids:
        row = ""
        for d in detectors:
            s = next(e for e in index["detectors"] if e["id"] == d.id)["results"][sid]
            row += f"{pct(s['detected'], s['in_view']):>18}"
        print(f"{sid:<10}{row}")
    print(f"\nWrote {RESULTS}/")


if __name__ == "__main__":
    main()
