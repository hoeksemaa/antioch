"""Python: makes the fixed benchmark scenario list, bench/scenarios.json.

Every detector runs on the same 100 scenarios. Each scenario sets every axis
of the scene (scene/src/settings.ts) and a seed, so it loads the same frames
on every run. Run this file only to make a new list; bench/run.py reads the
JSON.

How the list is made (greedy, from a fixed random seed):
- 76 deliveries (a person walks or runs up with a package) and 24 events with
  no person (8 dog, 8 passing car, 8 empty). The no-person events measure false
  alarms; person and speed do not apply to them.
- Deliveries: every pair of axis values occurs together in at least one
  scenario. Then each new scenario adds the most value triples not seen yet.
- No-person events: 24 rows cannot hold every pair (house x weather alone is
  25), so they are picked together, with the event as one more axis. Each
  event meets each value of the other axes; other pairs: as many as fit.
- Each value occurs about equally often. A tie goes to the rarest values.

    bench/.venv/bin/python bench/scenarios.py
"""

import itertools
import json
import random
from pathlib import Path

OUT = Path(__file__).parent / "scenarios.json"

# The axis values, in the order of scene/src/settings.ts. bench/run.py checks
# each scenario against what the scene loads, so a renamed value fails there.
AXES = {
    "house": ["porch", "stoop", "side", "flush", "portico"],
    "event": ["delivery", "dog", "car", "empty"],
    "light": ["day", "dusk", "night", "ir"],
    "weather": ["clear", "rain", "snow", "fog", "wind"],
    "camera": ["basic", "ring"],
    "person": ["man", "woman", "dark", "hooded", "child"],
    "speed": ["walk", "run"],
    "surfaces": ["flat", "textured"],
    "occlusion": ["none", "bins", "car"],
}
# Short names for the scenario label.
LABELS = {"ring": "fisheye", "ir": "IR", "car": "car"}
DELIVERIES = 76
NO_PERSON = {"dog": 8, "car": 8, "empty": 8}
CANDIDATES = 400  # random rows tried for each new scenario


def tuples(row: dict, factors: list[str], k: int) -> set:
    return {tuple((f, row[f]) for f in combo) for combo in itertools.combinations(factors, k)}


def pick(rng: random.Random, factors: dict, fixed: list[dict]) -> tuple[list[dict], float]:
    """One row for each entry of fixed (values set in advance, for example the
    event); the other factors (axis -> values) are picked: new pairs first,
    then new triples, then balance. Returns the rows and the share of pairs
    covered."""
    axes = {**{f: sorted({row[f] for row in fixed}) for f in fixed[0]}, **factors}
    names = list(axes)
    pairs_all = set().union(*(tuples(dict(zip(names, values)), names, 2) for values in itertools.product(*axes.values())))
    pairs_left = set(pairs_all)
    triples_seen: set = set()
    uses = {f: {v: 0 for v in values} for f, values in factors.items()}
    rows = []
    for preset in fixed:
        best, best_key = None, None
        for _ in range(CANDIDATES):
            row = {**preset, **{f: rng.choice(values) for f, values in factors.items()}}
            key = (
                len(tuples(row, names, 2) & pairs_left),
                len(tuples(row, names, 3) - triples_seen),
                -sum(uses[f][row[f]] for f in factors),
            )
            if best_key is None or key > best_key:
                best, best_key = row, key
        pairs_left -= tuples(best, names, 2)
        triples_seen |= tuples(best, names, 3)
        for f in factors:
            uses[f][best[f]] += 1
        rows.append(best)
    return rows, 1 - len(pairs_left) / len(pairs_all)


def main():
    rng = random.Random(2026_10_27)
    person_axes = {a: v for a, v in AXES.items() if a != "event"}
    rows, delivery_pairs = pick(rng, person_axes, [{"event": "delivery"}] * DELIVERIES)
    assert delivery_pairs == 1, "the deliveries must cover every pair"
    scene_axes = {a: v for a, v in AXES.items() if a not in ("event", "person", "speed")}
    # Person and speed have no effect without a person; they keep the scene's
    # defaults so the query is complete.
    events = [{"event": e, "person": "man", "speed": "walk"} for e, n in NO_PERSON.items() for _ in range(n)]
    more, event_pairs = pick(rng, scene_axes, events)
    rows += more
    rng.shuffle(rows)  # mix the events, so a partial run already covers all of them
    seeds = rng.sample(range(1, 1_000_000), len(rows))
    scenarios = []
    for i, (row, seed) in enumerate(zip(rows, seeds), 1):
        settings = {a: row[a] for a in AXES}
        shown = [settings["house"], settings["event"], settings["light"], settings["weather"], settings["camera"]]
        if settings["event"] == "delivery":
            shown += [settings["person"], settings["speed"]]
        shown += [settings["surfaces"], settings["occlusion"]]
        scenarios.append({
            "id": f"s{i:03d}",
            "name": " · ".join(LABELS.get(v, v) for v in shown),
            "settings": settings,
            "seed": seed,
            "query": "&".join(f"{a}={v}" for a, v in settings.items()) + f"&seed={seed}",
        })
    OUT.write_text(json.dumps({"made_by": "bench/scenarios.py", "scenarios": scenarios}, indent=1) + "\n")

    print(f"Wrote {len(scenarios)} scenarios to {OUT}")
    print(f"  pairs covered: deliveries {delivery_pairs:.0%}, no-person events {event_pairs:.0%}")
    for axis, values in AXES.items():
        counts = {v: sum(s["settings"][axis] == v for s in scenarios) for v in values}
        print(f"  {axis:<10} " + "  ".join(f"{v} {n}" for v, n in counts.items()))


if __name__ == "__main__":
    main()
