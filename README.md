# Doorbell camera benchmark (unofficial Antioch demo)

A doorbell camera on a simulated front porch, in many environments. It benchmarks one detection task: find the person before they reach the door.

Unofficial demo by [John Hoeksema](https://johnhoeksema.com) for the Member of Technical Staff, Core Platform role at Antioch. Not affiliated with Antioch. All scenes and results are simulated and uncalibrated.

Live: https://antioch-demo-hoeksema.vercel.app (Simulations) and https://antioch-demo-hoeksema.vercel.app/benchmarks (Benchmarks).

## Stack: which parts are Three.js and which are Python

| Part | Language | Folder | What it does |
|---|---|---|---|
| 3D scene | **Three.js** (TypeScript, in the browser) | `scene/src/` (`viewer.ts`, `houses.ts`, `delivery.ts`, …) | Houses, the delivery person and package, the doorbell camera, the overview |
| Scenario axes | TypeScript (browser) | `scene/src/settings.ts`, `lights.ts`, `sensor.ts` | The axes (house, light, and more to come), with a v1 baseline value and a showcase value for each |
| Simulations page | **Three.js** viewer plus buttons | `scene/index.html`, `scene/src/main.ts`, `simulations.ts` | The scene browser: overview with the doorbell inset, one row of buttons per axis, a seed, keys 1–5 and V. Also capture mode for Python |
| Benchmark hook | **Three.js** (TypeScript, in the browser) | `scene/src/bench.ts` | `window.bench`: renders the frame at time t and returns the ground truth (person box, distance, phase) |
| Frame capture | **Python** | `bench/capture.py` | Opens the scene in headless Chromium (Playwright), calls `window.bench`, takes screenshots |
| Detectors | **Python** | `bench/detector.py` | Registry of detectors; add one entry to add a detector |
| Scoring and results | **Python** | `bench/run.py` | Matches detections to the ground truth; writes `scene/public/results/` |
| Benchmarks page | TypeScript (browser) with the Three.js viewer | `scene/benchmarks.html`, `scene/src/benchmarks.ts` | Detectors × scenarios matrix, and a replay of the selected cell with the boxes on the doorbell camera |
| Hosting | Vercel | `scene/` | Serves the Three.js scene as a static site. Python does not run on Vercel |

```
Python (bench/)                                   Three.js (scene/, in headless Chromium)
run.py  -- window.bench.render(t) -------------->  renders the doorbell frame at time t
        <-- ground truth: person box, distance ---  projects the person onto the camera image
capture.py  -- screenshot ----------------------->  (the frame)
detector.py  finds "person" boxes in the frame
run.py  scores each frame: hit, miss, false alarm
```

Each source file starts with a comment that says "Three.js (browser)" or "Python".

Why this split: Three.js is fast to build and runs in any browser, so the same scene is the public demo and the replay viewer. Python does the detection, the scoring, and the runs, which is where the Core Platform post puts its weight.

## Run the scene

```sh
cd scene
npm install
npm run dev
```

Two pages, with the same header (Simulations, Benchmarks, View source, View creator):
- **Simulations** (http://localhost:5173): the 3D scene. Drag to orbit and scroll to zoom. Click a button in each axis row to change the scenario. Press `1`–`5` to switch houses, and `V` to switch between the overview (with the doorbell camera inset) and the doorbell camera.
- **Benchmarks** (http://localhost:5173/benchmarks.html; live: `/benchmarks`): the detector results (see below).

Capture mode (`/?view=doorbell`) shows the doorbell camera alone, in the full window, with no page around it. The Python benchmark uses this mode, for example `?house=stoop&view=doorbell`.

URL parameters:
- One parameter per axis in `scene/src/settings.ts`, for example `?house=<id>` (ids below). On Benchmarks, `?detector=<id>` picks the detector.
- A missing axis takes a default. On Simulations, it is the axis's showcase value. In capture mode and in the Benchmarks replay, it is the v1 baseline value, so old results still match the scene.
- `?t=<seconds>` freezes the delivery at that time, for example `?house=porch&view=doorbell&t=16`.
- `?seed=<n>` seeds every random choice in the scene. Seed 0 (the default) is the canonical scene, with no jitter. Another seed moves the delivery's start point (±2 m) and speed (±10%). Each module takes its own named stream from `scene/src/random.ts`, so a change on one axis does not change the random values of another module.
- `window.sim.stats()` gives the draw calls and triangles of the last frame (all passes), for the browser budget checks. Static meshes that share a material are merged into one mesh, so a frame costs about 90–110 draw calls.

## Houses

Five daytime houses. Each has its own entry, approach path, and doorbell position, so the same scenario runs against different geometry.

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

## Light (`?light=`)

| id | Light | Shadow light | Other lights |
|---|---|---|---|
| `day` | Sun at 44°, sky with light clouds | Sun | Sky ambient light |
| `dusk` | Low warm sun toward the street, into the doorbell camera | Sun | Porch light, street lamps, some lit windows |
| `night` | Dark sky, dim moonlight | Porch light | Street lamps, some lit windows |
| `ir` | Night with the porch light off | None | IR light at the doorbell (falls off with distance); the doorbell image is monochrome. The overview does not show the IR light |

- The sky is the three.js Sky shader, drawn once per load into a cube map: the background, and (through PMREM) the ambient light. It has no download.
- `v1` (not a button) is the v1 light: a flat blue background, a hemisphere light, and the sun. Capture mode and Benchmarks use it when `?light=` is missing.
- The doorbell image goes through a sensor pass (`scene/src/sensor.ts`) when an effect is on; for now the only effect is IR monochrome.
- Code: `scene/src/lights.ts`.

## Delivery (v2)

In each house, one person carries one package along that house's route: from the sidewalk, up the approach, to a drop spot that the doorbell can see. The person sets the package down, turns around, and walks back. Then the loop starts again.

- The person and the package are the same in every house for now. Both are future variation: body, clothing, skin tone, gait, and package size and color.
- The person is a jointed figure made of capsules, about 1.78 m tall. Walking speed is 1.4 m/s.
- The motion is a pure function of time (`scene/src/delivery.ts`), so the frame at time t is the same on every run.
- Each house gives its `route` (a polyline; y is the floor height under the feet) and its `drop` spot in `houses.ts`. Stairs are ramps in the route, so the feet do not land on each step.

## Run the benchmark (Python)

One-time setup, from the repo root:

```sh
uv venv --python 3.12 bench/.venv
uv pip install --python bench/.venv/bin/python -r bench/requirements.txt
bench/.venv/bin/python -m playwright install chromium
```

Start the scene (`cd scene && npm run dev`), then:

```sh
bench/.venv/bin/python bench/run.py                       # all detectors, all scenarios, 2 frames per second
bench/.venv/bin/python bench/run.py --scenarios porch stoop --detectors ssdlite
bench/.venv/bin/python bench/run.py --images              # also write marked-up frames to bench/out/
bench/.venv/bin/python bench/run.py --seed random         # a new seed (saved with the results)
bench/.venv/bin/python bench/run.py --url https://antioch-demo-hoeksema.vercel.app
```

How it scores (v1):
- **Detectors:** pretrained on COCO (real photos), from torchvision: `frcnn-mobilenet` (`fasterrcnn_mobilenet_v3_large_fpn`) and `ssdlite` (`ssdlite320_mobilenet_v3_large`). Only "person" boxes with a score of at least 0.5 count.
- **Ground truth:** the scene projects every vertex of the person onto the doorbell image and takes the box around them. The box covers the whole body, also the parts behind walls or rails.
- **Hit:** a person box overlaps the true box with IoU ≥ 0.3. The usual value is 0.5; 0.3 allows for the hidden body parts.
- **Miss:** the person is in view, but no person box matches.
- **False alarm:** a person box that does not match the person.
- **Detection rate:** hits ÷ frames with the person in view, overall and by distance (0–3, 3–6, 6–9, 9–12, 12+ m, on the ground from the doorbell).
- **First seen:** the distance at the first hit while the person walks up.
- **Seed:** every run uses seed 0 unless you pass `--seed`. The seed goes to Python, torch, and the scene (`&seed=`), and it is saved with the results, so the same seed gives the same results and the Benchmarks page replays the same frames.

Output (in git, so the deployed page shows it):
- `scene/public/results/index.json`: one summary for each detector and scenario. The Benchmarks matrix reads only this file.
- `scene/public/results/<detector>/<scenario>.json`: every frame, with the true box and every detection. The page loads it when you click a cell.

A run replaces the results for the detectors and scenarios it runs and keeps the others. With `--images`, marked-up frames also go to `bench/out/<detector>/<scenario>/` (not in git).

## Benchmarks page

Styled after antioch.com:
- **Matrix:** rows are scenarios, columns are detectors, and each cell is the detection rate. The best rate in each row is green, and the ring shows it as an arc. The last row is all scenarios together. Click a cell to pick that scenario and detector.
- **Replay:** the Three.js scene itself, with the true box (white, dashed) and the detector's boxes (yellow) on the doorbell camera. The scene is deterministic, so each frame is the same frame that the detector saw.
- **Timeline:** play, pause, and step (space, ← →); one strip for each detector (green: hit, red: miss, gray: person out of view). Click a frame to go to it.
- **Distance table:** detection rate by distance for each detector.

`/results` and `/results.html` (the old results page) redirect to `/benchmarks` (`scene/vercel.json`).

## Deploy

Vercel project `antioch-demo-hoeksema`, with Root Directory `scene`. Vercel detects Vite; the output is `dist/`. GitHub is connected, so each merge to `main` deploys to production. A manual deploy is `vercel deploy --prod --yes` from the repo root.

## Status

v5: two pages (Simulations and Benchmarks), five houses with a package delivery, and a Python person-detection benchmark with two detectors.
