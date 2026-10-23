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

Open http://localhost:5173. Drag to orbit and scroll to zoom. Press `V` to switch between the overview and the doorbell camera.

http://localhost:5173/?view=doorbell shows the doorbell camera alone, with no overlays. Frame capture will use this view.

## Scene (v0)

- Static and daytime: a house with a small porch, a front walk, a street, and houses across the street.
- Doorbell camera: right of the door, 1.22 m above the porch floor, 16:9, 70° vertical field of view. It is a plain perspective camera; real doorbells use a fisheye lens.
- Units are meters. The front wall is the plane z = 0, and the street is in the +z direction.

## Deploy (later)

A Vercel project with Root Directory `scene`. Vercel detects Vite; the output is `dist/`.

## Status

v0: a static porch scene. No person and no detection yet.
