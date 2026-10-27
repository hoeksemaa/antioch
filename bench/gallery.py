"""Python: picks notable frames from a benchmark run and saves them as
pictures with all their settings, in scene/public/notable/ (the site's
Gallery page shows the thumbs; GitHub shows README.md there).

Run it after bench/run.py (it reads scene/public/results/ and the frame cache
in bench/frames/):
    bench/.venv/bin/python bench/gallery.py

Each picture is the doorbell frame with the true box (white, dashed) and the
counted boxes of every detector (one color each), and a caption band under it:
why the frame is notable, the scenario, every axis setting, the time, the
distance, and each detector's result (the site shows no seed; the JSON has
it). Next to each picture, a JSON
file has the same data, plus links that open the exact frame on the live site.
thumbs/ has a 640 px copy of each frame for the Gallery page: the boxes only,
with no caption band and no score tags. gallery.json lists
every picture (and the category titles); README.md shows them by category.
hero.jpg and hero.json are the picture at the top of the Benchmark page: one
clear frame (HERO) with the best detector's box.

Categories (a frame appears once; a later category takes its next best frame):
- all-missed-close: the person is in view and near (< 6 m), and every
  detector misses. The largest true boxes first.
- only-one-hit: exactly one detector finds the person. The farthest first.
- farthest-hit: each detector's farthest hits.
- hard-all-hit: dusk, night, or IR on the fisheye, and every detector hits.
- light: for each light, the farthest frame where most detectors hit, and the
  nearest frame where all miss.
- child-missed: child height, every detector misses.
- false-alarm-no-person: person boxes in scenes with no person (dog, passing
  car, empty). The highest scores first.
- false-alarm-delivery: person boxes away from the person in a delivery.
- best-and-worst: the scenarios with the highest and lowest mean detection
  rate.
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from run import iou

ROOT = Path(__file__).parent
RESULTS = ROOT.parent / "scene" / "public" / "results"
FRAMES = ROOT / "frames"
OUT = ROOT.parent / "scene" / "public" / "notable"
THUMB = 640  # px wide
# Category id: (title, what it shows), in page order.
CATEGORIES = {
    "all-missed-close": ("Every detector missed a near person", "The person is in view and less than 6 m away, and no detector finds them. Largest true boxes first."),
    "only-one-hit": ("Only one detector found the person", "Exactly one detector hits. Farthest first."),
    "farthest-hit": ("Farthest hits", "Each detector's farthest hits."),
    "hard-all-hit": ("Low light on the fisheye: every detector hit", "Dusk, night, or IR on the fisheye camera, and all detectors find the person."),
    "light": ("One pair for each light", "For each light: the farthest frame where most detectors hit, and the nearest frame where all miss."),
    "child-missed": ("Child height: every detector missed", "The weakest person setting."),
    "false-alarm-no-person": ("False alarms with no person", "Person boxes in scenes with a dog, a passing car, or nobody. Highest scores first."),
    "false-alarm-delivery": ("Boxes away from the person", "Counted person boxes that do not match the true box. Some are on the visible part of a partly hidden person."),
    "best-and-worst": ("Best and worst scenarios", "The scenarios with the highest and lowest mean detection rate (a middle frame)."),
}
SITE = "https://antioch-demo-hoeksema.vercel.app"
MIN_IOU = 0.3
COLORS = {  # one for each detector
    "frcnn-mobilenet": (76, 140, 230),
    "ssdlite": (245, 133, 24),
    "frcnn-resnet50": (230, 60, 90),
    "yolo11x": (170, 100, 230),
    "rtdetr-x": (255, 205, 50),
}
FONT = "/System/Library/Fonts/Menlo.ttc"
# The Benchmark page picture: a raised porch on a clear day, the person 3 m
# away with the package; every detector finds them.
HERO = ("s098", 29)


def font(size: int):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def load():
    index = json.loads((RESULTS / "index.json").read_text())
    scenarios = {s["id"]: s for s in index["scenarios"]}
    detectors = [d["id"] for d in index["detectors"]]
    frames = {}  # (scenario, detector) -> per-frame records
    for d in detectors:
        for sid in scenarios:
            f = RESULTS / d / f"{sid}.json"
            if f.exists():
                frames[(sid, d)] = json.loads(f.read_text())["frames"]
    return index, scenarios, detectors, frames


def pick(index, scenarios, detectors, frames):
    """[(category, reason, scenario id, frame index, focus detector or None)] in category order."""
    chosen, seen = [], set()

    def add(category, reason, sid, i, focus=None):
        if (sid, i) not in seen:
            seen.add((sid, i))
            chosen.append((category, reason, sid, i, focus))

    def rows(sid):
        """For each frame: the truth (from the first detector) and each detector's record."""
        per = [frames.get((sid, d), []) for d in detectors]
        if not per[0] or any(len(p) != len(per[0]) for p in per):
            return []  # not every detector has run on this scenario
        return [(per[0][i], {d: per[k][i] for k, d in enumerate(detectors)}) for i in range(len(per[0]))]

    deliveries = [s for s in scenarios.values() if s["settings"]["event"] == "delivery"]
    no_person = [s for s in scenarios.values() if s["settings"]["event"] != "delivery"]
    area = lambda b: (b[2] - b[0]) * (b[3] - b[1])

    def best_per_scenario(test, key, pool, limit, category, reason, focus=None):
        found = []
        for s in pool:
            best = None
            for i, (truth, per) in enumerate(rows(s["id"])):
                if (s["id"], i) in seen:
                    continue  # already in an earlier category; take the next best frame
                if test(s, truth, per) and (best is None or key(truth, per) > key(*best[1:])):
                    best = (i, truth, per)
            if best:
                found.append((key(*best[1:]), s["id"], best[0], best[1], best[2]))
        for _, sid, i, truth, per in sorted(found, reverse=True)[:limit]:
            add(category, reason(truth, per), sid, i, focus)

    hits = lambda per: [d for d in detectors if per[d]["hit"]]
    in_view = lambda truth: truth["truth"] is not None

    best_per_scenario(
        lambda s, t, p: in_view(t) and t["d"] < 6 and not hits(p), lambda t, p: area(t["truth"]), deliveries, 10,
        "all-missed-close", lambda t, p: f"all {len(detectors)} detectors missed at {t['d']:.1f} m")
    for d in detectors:
        best_per_scenario(
            lambda s, t, p, d=d: in_view(t) and hits(p) == [d], lambda t, p: t["d"], deliveries, 3,
            "only-one-hit", lambda t, p, d=d: f"only {d} found the person, at {t['d']:.1f} m", d)
    for d in detectors:
        best_per_scenario(
            lambda s, t, p, d=d: in_view(t) and p[d]["hit"], lambda t, p: t["d"], deliveries, 2,
            "farthest-hit", lambda t, p, d=d: f"{d}: one of its farthest hits, at {t['d']:.1f} m", d)
    hard = [s for s in deliveries if s["settings"]["light"] in ("dusk", "night", "ir") and s["settings"]["camera"] == "ring"]
    best_per_scenario(
        lambda s, t, p: in_view(t) and len(hits(p)) == len(detectors), lambda t, p: t["d"], hard, 6,
        "hard-all-hit", lambda t, p: f"every detector hit in low light on the fisheye, at {t['d']:.1f} m")
    for light in ("day", "dusk", "night", "ir"):
        pool = [s for s in deliveries if s["settings"]["light"] == light]
        best_per_scenario(
            lambda s, t, p: in_view(t) and len(hits(p)) >= len(detectors) - 1, lambda t, p: t["d"], pool, 1,
            "light", lambda t, p, light=light: f"light {light}: {len(hits(p))} of {len(detectors)} hit, at {t['d']:.1f} m (farthest such frame)")
        best_per_scenario(
            lambda s, t, p: in_view(t) and not hits(p), lambda t, p: -t["d"], pool, 1,
            "light", lambda t, p, light=light: f"light {light}: all missed, at {t['d']:.1f} m (nearest such frame)")
    child = [s for s in deliveries if s["settings"]["person"] == "child"]
    best_per_scenario(
        lambda s, t, p: in_view(t) and not hits(p), lambda t, p: area(t["truth"]), child, 3,
        "child-missed", lambda t, p: f"child height: all missed at {t['d']:.1f} m")
    for d in detectors:
        best_per_scenario(
            lambda s, t, p, d=d: bool(p[d]["dets"]), lambda t, p, d=d: max(b[4] for b in p[d]["dets"]), no_person, 2,
            "false-alarm-no-person", lambda t, p, d=d: f"{d}: a person box at {max(b[4] for b in p[d]['dets']):.2f} with no person in the scene", d)

    def stray(t, p):
        """The highest score of a counted box away from the person."""
        return max((b[4] for d in detectors for b in p[d]["dets"] if iou(t["truth"], b[:4]) < MIN_IOU), default=0)

    best_per_scenario(
        lambda s, t, p: in_view(t) and stray(t, p) > 0, stray, deliveries, 6,
        "false-alarm-delivery", lambda t, p: f"a person box at {stray(t, p):.2f} away from the person")
    rates = []
    for s in deliveries:
        r = [d for d in index["detectors"] if s["id"] in d["results"]]
        mean = sum(x["results"][s["id"]]["detected"] / max(1, x["results"][s["id"]]["in_view"]) for x in r) / max(1, len(r))
        rates.append((mean, s["id"]))
    rates.sort()
    for mean, sid in rates[-2:][::-1] + rates[:2]:
        seen_rows = [(i, t) for i, (t, p) in enumerate(rows(sid)) if in_view(t)]
        if seen_rows:
            i, t = seen_rows[len(seen_rows) // 2]
            add("best-and-worst", f"{'best' if mean >= rates[-2][0] else 'worst'} scenario: mean detection rate {mean:.0%} (a middle frame)", sid, i)
    return chosen


def dashed(draw, box, fill, width=3, dash=10):
    x0, y0, x1, y1 = box
    for a, b, horizontal in [((x0, y0), (x1, y0), True), ((x0, y1), (x1, y1), True), ((x0, y0), (x0, y1), False), ((x1, y0), (x1, y1), False)]:
        length = (b[0] - a[0]) if horizontal else (b[1] - a[1])
        for s in range(0, int(length), dash * 2):
            e = min(s + dash, length)
            p, q = ((a[0] + s, a[1]), (a[0] + e, a[1])) if horizontal else ((a[0], a[1] + s), (a[0], a[1] + e))
            draw.line([p, q], fill=fill, width=width)


def marked(scenario, i, per, detectors, tags=True):
    """The doorbell frame with the true box (white, dashed) and each
    detector's counted boxes, with a score tag under each box (when tags)."""
    folder = FRAMES / scenario["id"]
    cached = json.loads((folder / "frames.json").read_text())["frames"][i]
    image = Image.open(folder / cached["file"]).convert("RGB")
    w, h = image.size
    draw = ImageDraw.Draw(image)
    scale = lambda b: (b[0] * w, b[1] * h, b[2] * w, b[3] * h)
    small = font(15)
    truth = per[detectors[0]]["truth"]
    if truth:
        dashed(draw, scale(truth), (255, 255, 255))
    for k, d in enumerate(detectors):
        for b in per[d]["dets"]:
            x0, y0, x1, y1 = scale(b[:4])
            pad = k * 2  # boxes in the same place stay visible
            draw.rectangle((x0 - pad, y0 - pad, x1 + pad, y1 + pad), outline=COLORS.get(d, (255, 255, 255)), width=2)
            if tags:
                draw.text((x0 - pad + 3, y1 + pad + 2 + 16 * k), f"{d} {b[4]:.2f}", fill=COLORS.get(d, (255, 255, 255)), font=small)
    return image


def render(category, reason, scenario, i, per, detectors):
    """The marked frame with a caption band under it."""
    image = marked(scenario, i, per, detectors)
    w, h = image.size
    s = dict(scenario["settings"])
    if s["event"] != "delivery":  # no person: person and speed do not apply
        s.pop("person"), s.pop("speed")
    f0 = per[detectors[0]]
    where = f"{f0['d']:.1f} m" if f0["d"] is not None else "no person"
    gray = (190, 190, 185)
    lines = [
        [(f"{category}: {reason}", (255, 255, 255))],
        [(f"{scenario['id']} · t {f0['t']:.1f} s · frame {i + 1} · {f0['phase']} · {where}", gray)],
        [(f"{a} {v}" + (" · " if k < len(s) - 1 else ""), gray) for k, (a, v) in enumerate(s.items())],
        [],
    ]
    for d in detectors:
        r = per[d]
        state = "hit" if r["hit"] else "miss" if r["hit"] is False else "no person"
        top = max((b[4] for b in r["dets"]), default=None)
        low = max((b[4] for b in r.get("low", [])), default=None)
        text = f"{d} {state}" + (f" {top:.2f}" if top is not None else "") + (f" (low {low:.2f})" if low is not None and top is None else "") + (f" · FA {r['fa']}" if r["fa"] else "") + "   "
        lines[3].append((text, COLORS.get(d, (255, 255, 255))))
    big = font(17)
    # Wrap each line at its pieces, so nothing runs off the right edge.
    measure = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    wrapped = []
    for line in lines:
        row, x = [], 12
        for text, color in line:
            width = measure.textlength(text, font=big)
            if row and x + width > w - 12:
                wrapped.append(row)
                row, x = [], 12
            row.append((text, color))
            x += width
        wrapped.append(row)
    band = Image.new("RGB", (w, 22 * len(wrapped) + 18), (24, 24, 24))
    bd = ImageDraw.Draw(band)
    y = 9
    for line in wrapped:
        x = 12
        for text, color in line:
            bd.text((x, y), text, fill=color, font=big)
            x += bd.textlength(text, font=big)
        y += 22
    sheet = Image.new("RGB", (w, h + band.height))
    sheet.paste(image, (0, 0))
    sheet.paste(band, (0, h))
    return sheet


def hero(scenarios, best, frames):
    sid, i = HERO
    folder = FRAMES / sid
    cached = json.loads((folder / "frames.json").read_text())["frames"][i]
    image = Image.open(folder / cached["file"]).convert("RGB")
    w, h = image.size
    draw = ImageDraw.Draw(image)
    f = frames[(sid, best)][i]
    big = font(18)
    for b in f["dets"]:  # the site's detection style: a yellow box and a yellow tag
        x0, y0, x1, y1 = b[0] * w, b[1] * h, b[2] * w, b[3] * h
        draw.rectangle((x0, y0, x1, y1), outline=(255, 204, 51), width=3)
        text = f"person {b[4]:.2f}"
        tw = draw.textlength(text, font=big)
        draw.rectangle((x0 - 1.5, y0 - 26, x0 + tw + 10, y0), fill=(255, 204, 51))
        draw.text((x0 + 4, y0 - 24), text, fill=(17, 17, 17), font=big)
    image.save(OUT / "hero.jpg", quality=88)
    scenario = scenarios[sid]
    item = {
        "picture": "hero.jpg",
        "detector": best,
        "score": max((b[4] for b in f["dets"]), default=None),
        "scenario": {k: scenario[k] for k in ("id", "name", "settings")},
        "frame": {"index": i, "t": f["t"], "distance_m": f["d"]},
    }
    (OUT / "hero.json").write_text(json.dumps(item, indent=1))


def main():
    index, scenarios, detectors, frames = load()
    chosen = pick(index, scenarios, detectors, frames)
    OUT.mkdir(exist_ok=True)
    for old in list(OUT.glob("*/*.jpg")) + list(OUT.glob("*/*.json")) + list(OUT.glob("thumbs/*/*.jpg")):
        old.unlink()
    # The detector a replay opens with, when no detector is the subject.
    best = max(index["detectors"], key=lambda d: d["all"]["detected"] / max(1, d["all"]["in_view"]))["id"]
    items = []
    for n, (category, reason, sid, i, focus) in enumerate(chosen, 1):
        scenario = scenarios[sid]
        per = {d: frames[(sid, d)][i] for d in detectors}
        name = f"{n:03d}-{sid}-f{i:04d}"
        (OUT / category).mkdir(exist_ok=True)
        picture = render(category, reason, scenario, i, per, detectors)
        picture.save(OUT / category / f"{name}.jpg", quality=88)
        (OUT / "thumbs" / category).mkdir(parents=True, exist_ok=True)
        thumb = marked(scenario, i, per, detectors, tags=False)
        thumb.resize((THUMB, round(thumb.height * THUMB / thumb.width)), Image.LANCZOS).save(OUT / "thumbs" / category / f"{name}.jpg", quality=82)
        f0 = per[detectors[0]]
        item = {
            "picture": f"{category}/{name}.jpg",
            "thumb": f"thumbs/{category}/{name}.jpg",
            "focus": focus,
            "category": category,
            "reason": reason,
            "scenario": {k: scenario[k] for k in ("id", "name", "settings", "seed", "query")},
            "frame": {"index": i, "t": f0["t"], "phase": f0["phase"], "distance_m": f0["d"], "truth": f0["truth"]},
            "detectors": {d: {k: per[d].get(k) for k in ("hit", "iou", "fa", "dets", "low", "ms")} for d in detectors},
            "links": {
                "frame": f"{SITE}/?{scenario['query']}&view=doorbell&t={f0['t']}",
                "replay": f"{SITE}/gallery?replay={sid}&detector={focus or best}&t={f0['t']}",
                "picture": f"{SITE}/notable/{category}/{name}.jpg",
            },
        }
        (OUT / category / f"{name}.json").write_text(json.dumps(item, indent=1))
        items.append(item)
    categories = [{"id": c, "title": t, "about": a} for c, (t, a) in CATEGORIES.items() if any(x["category"] == c for x in items)]
    (OUT / "gallery.json").write_text(json.dumps({"made_by": "bench/gallery.py", "detectors": detectors, "colors": COLORS, "categories": categories, "pictures": items}, indent=1))

    md = ["# Notable frames", "", f"Made by `bench/gallery.py` from the benchmark results ({len(items)} pictures). True box: white, dashed. Detector boxes: " + ", ".join(f"{d} (rgb{COLORS[d]})" for d in detectors if d in COLORS) + ". Each picture has a JSON file with the same name: every setting, the frame, each detector's boxes, and links to the frame on the live site.", ""]
    for category in dict.fromkeys(i["category"] for i in items):
        md += [f"## {CATEGORIES[category][0]}", "", CATEGORIES[category][1], ""]
        for item in (x for x in items if x["category"] == category):
            md += [f"**{item['reason']}**  ", f"`{item['scenario']['id']}` {item['scenario']['name']} · t {item['frame']['t']} s · [frame]({item['links']['frame']}) · [replay]({item['links']['replay']})", "", f"![{item['reason']}]({item['picture']})", ""]
    (OUT / "README.md").write_text("\n".join(md))
    hero(scenarios, best, frames)
    counts = {}
    for item in items:
        counts[item["category"]] = counts.get(item["category"], 0) + 1
    print(f"Wrote {len(items)} pictures to {OUT}/: " + ", ".join(f"{c} {n}" for c, n in counts.items()))


if __name__ == "__main__":
    main()
