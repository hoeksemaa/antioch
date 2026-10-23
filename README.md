# Doorbell camera benchmark (unofficial Antioch demo)

A doorbell camera on a simulated front porch, in many environments. It benchmarks one detection task: find the person before they reach the door.

Unofficial demo by [John Hoeksema](https://johnhoeksema.com) for the Member of Technical Staff, Core Platform role at Antioch. Not affiliated with Antioch. All scenes and results are simulated and uncalibrated.

Live: not deployed yet.

## Stack

- **3D scene: Three.js**, in `scene/` (Vite + TypeScript). It runs in the browser, so the same scene is the public demo and the replay viewer.
- **Detection: Python**, in `bench/` (not started). Plan: Python opens the scene in headless Chromium (Playwright), captures doorbell frames from `?view=doorbell`, and runs a torchvision COCO person detector on them. Thus one renderer makes both the benchmark frames and the replay.
- **Hosting: Vercel** serves `scene/` as a static site. The Python benchmark runs outside Vercel and writes its results as JSON for the site to read.

Why this split: Three.js is fast to build and runs in any browser. Python does the detection, the scoring, and the runs, which is where the Core Platform post puts its weight.

## Run the scene

```sh
cd scene
npm install
npm run dev
```

Open http://localhost:5173. Drag to orbit and scroll to zoom. Press `V` to switch between the overview and the doorbell camera. Press `1`–`5` (or click a button) to switch houses.

URL parameters:
- `?house=<id>` picks the house (ids below).
- `?view=doorbell` shows the doorbell camera alone, with no overlays. Frame capture will use this view, for example `?house=stoop&view=doorbell`.

## Houses (v1)

Five static, daytime houses. Each has its own entry, approach path, and doorbell position, so the same scenario runs against different geometry.

| id | House | Entry | Visitor approach | Doorbell (as seen from the street) |
|---|---|---|---|---|
| `porch` | One story | Raised porch, 3 front steps, railings | Straight walk from the sidewalk | Right of the door, 1.22 m above the porch floor |
| `stoop` | Attached row houses | Tall stoop, 10 risers, iron rails | Straight up the stoop from a close sidewalk | Left door trim, about 2.9 m above the yard |
| `side` | Bungalow | Porch behind a 0.75 m knee wall, steps on the left end | Up the side walk, then onto the porch from the side | Left of the door, turned toward the side steps |
| `flush` | Modern, with garage | No porch: a pad at ground level, a canopy | Up the driveway, then along a walk across the front | Right of the door, low, turned toward the driveway |
| `portico` | Two story, set far back | Small portico on two columns, 1 step | Through a gate in a picket fence, on a walk that bends | Left of the door, a bit higher |

- Doorbell camera: 16:9, 70° vertical field of view. It is a plain perspective camera; real doorbells use a fisheye lens.
- Units are meters. The front wall of each house is the plane z = 0, and the street is in the +z direction.
- Code: `scene/src/houses.ts` (one function for each house), `parts.ts` (shared building parts), `street.ts` (street and neighbors).

## Deploy (later)

A Vercel project with Root Directory `scene`. Vercel detects Vite; the output is `dist/`.

## Status

v1: five static houses. No person and no detection yet.
