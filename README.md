# Doorbell camera benchmark (unofficial Antioch demo)

A doorbell camera on a simulated front porch, in many environments. It benchmarks one detection task: find the person before they reach the door.

Unofficial demo by [John Hoeksema](https://johnhoeksema.com) for the Member of Technical Staff, Core Platform role at Antioch. Not affiliated with Antioch. All scenes and results are simulated and uncalibrated.

Live: https://antioch-demo-hoeksema.vercel.app (Simulations), https://antioch-demo-hoeksema.vercel.app/benchmarks (Benchmarks), and https://antioch-demo-hoeksema.vercel.app/gallery (Gallery).

## Stack: which parts are Three.js and which are Python

| Part | Language | Folder | What it does |
|---|---|---|---|
| 3D scene | **Three.js** (TypeScript, in the browser) | `scene/src/` (`viewer.ts`, `houses.ts`, `delivery.ts`, …) | Houses, the delivery person and package, the doorbell camera, the overview |
| Scenario axes | TypeScript (browser) | `scene/src/settings.ts`, `lights.ts`, `weather.ts`, `camera.ts`, `sensor.ts`, `people.ts`, `surfaces.ts`, `props.ts`, `events.ts` | The axes: house, event, light, weather, camera, person, speed, surfaces, occlusion, with a v1 baseline value and a showcase value for each |
| Simulations page | **Three.js** viewer plus buttons | `scene/index.html`, `scene/src/main.ts`, `simulations.ts` | The scene browser: overview with the doorbell inset at the bottom right, and a panel above it with one row of buttons per axis, each named by a symbol (`icons.ts`). Click the inset (or press V) for the doorbell view; click again to go back. Keys 1–5 switch houses. Also capture mode for Python |
| Benchmark hook | **Three.js** (TypeScript, in the browser) | `scene/src/bench.ts` | `window.bench`: renders the frame at time t and returns the ground truth (person box, distance, phase) |
| Scenario list | **Python** | `bench/scenarios.py` → `bench/scenarios.json` | The fixed 100 scenarios that every detector runs on |
| Frame capture | **Python** | `bench/capture.py` | Opens the scene in headless Chromium (Playwright), calls `window.bench`, takes screenshots, caches them in `bench/frames/` |
| Detectors | **Python** | `bench/detector.py` | 5 detectors (torchvision and Ultralytics); add one entry to add a detector |
| Scoring and results | **Python** | `bench/run.py` | Matches detections to the ground truth; writes `scene/public/results/` |
| Benchmarks page | TypeScript (browser) with the Three.js viewer | `scene/benchmarks.html`, `scene/src/benchmarks.ts` | Summary, results by setting, the scenario list, and a replay of the selected cell with the boxes on the doorbell camera |
| Gallery page | TypeScript (browser) | `scene/gallery.html`, `scene/src/gallery.ts` | The notable frames from `bench/gallery.py` (`scene/public/notable/`), in groups, with every setting and each detector's result |
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

Three pages, with the same header: the title at the left, and one bar with Simulations, Benchmarks, Gallery, View source, and View creator:
- **Simulations** (http://localhost:5173): the 3D scene. Drag to orbit and scroll to zoom. Click a button in each axis row (the panel at the top right) to change the scenario. A symbol names each row; the `?` button opens a panel with the keys and the symbol names. Press `1`–`5` to switch houses. Click the doorbell camera inset, or press `V`, for the doorbell camera view; click that view, or press `V` or `Esc`, to go back to the overview.
- **Benchmarks** (http://localhost:5173/benchmarks.html; live: `/benchmarks`): the detector results (see below).
- **Gallery** (http://localhost:5173/gallery.html; live: `/gallery`): the notable frames from the benchmark run (see below).

Capture mode (`/?view=doorbell`) shows the doorbell camera alone, in the full window, with no page around it. The Python benchmark uses this mode, for example `?house=stoop&view=doorbell`.

URL parameters:
- One parameter per axis in `scene/src/settings.ts`, for example `?house=<id>` (ids below). On Benchmarks, `?detector=<id>` picks the detector.
- A missing axis takes a default. On Simulations, it is the axis's showcase value. In capture mode, it is the baseline value. The benchmark scenarios set every axis, so the Benchmarks replay loads each scenario exactly.
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

- Doorbell camera: see Camera below.
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

## Weather (`?weather=`)

| id | Weather | What changes |
|---|---|---|
| `clear` | Clear | Nothing (the baseline) |
| `rain` | Rain | Gray overcast sky, dimmer sun; 16k streaks; wet, glossy ground (lamps reflect at night); drops glow near the doorbell in IR; drops on the fisheye camera's lens |
| `snow` | Snow | Overcast; 7k flakes; white lawn, roofs, and bushes; dark shoveled paths |
| `fog` | Fog | Exponential fog in the light's haze color |
| `wind` | Windy fall day | Trees and bushes sway (and their shadows move), fall colors, 300 blowing leaves |

- Rain, snow, and leaves are one particle draw each, moved in the vertex shader from the time t and the seed. Far drops fade, so they do not flicker.
- The weather swaps materials on its own copies (wet, snowy, windy) before the static meshes merge.
- Code: `scene/src/weather.ts`; lens drops in `scene/src/sensor.ts`.

## Camera (`?camera=`)

| id | Camera | Image |
|---|---|---|
| `basic` | The v1 camera: a plain perspective camera | 16:9, 70° vertical; no sensor effects |
| `ring` | A square fisheye, like a wide-angle video doorbell | About 150° corner to corner, 115° side to side (stereographic); auto exposure, noise, vignette, lens softness, compression blocks, bloom, lens flare |

- The fisheye camera renders the scene through a 140° perspective camera into an HDR target at 1.5× the output size, then the sensor pass (`scene/src/sensor.ts`) maps it to the fisheye and adds the effects. A real doorbell fisheye is 150° × 150°; one perspective render cannot reach that, because the corners would need rays more than 90° off the axis.
- Auto exposure reads a center-weighted mean from a small mip of the target, so it needs no state from earlier frames. The noise depends on the pixel and the time t. Thus a frame at time t is the same on every run.
- In low light, the gain goes up: more noise, and 8 × 8 compression blocks. The sun and lit street lamps flare when they are in view and not behind something.
- `window.bench` boxes go through the same fisheye mapping (`scene/src/camera.ts`).

## Person and speed (`?person=`, `?speed=`)

| id | Person | Height |
|---|---|---|
| `man` | Shirt and trousers | 1.80 m |
| `woman` | Shirt and trousers | 1.66 m |
| `dark` | The man in dark clothes (a hard case at night) | 1.80 m |
| `hooded` | Outfit with the hood up | 1.80 m |
| `child` | The woman scaled to child height (the free pack has no child body) | 1.20 m |

- Capture mode and Benchmarks use `man` when `?person=` is missing. The v1 capsule figure (the mannequin) is gone.
- Speed: `walk` 1.4 m/s, `run` 4.5 m/s. The run speed matches the stride of the free jog clip, so the feet stay planted.
- The rigged people are CC0 Quaternius assets, assembled offline into `scene/public/people/` (see `LICENSE.txt` there). The page loads a person's file (1.4–2.3 MB) only when it is on screen.
- Animation: walk or jog clips matched to the speed, idle at the pauses, and a crouch for the drop. Two-bone IK puts the hands on the package. All of it comes from the delivery time t, so frames repeat.
- Another seed changes the height (±4%) and tints the clothes.
- Code: `scene/src/people.ts`. `window.bench` boxes come from the skinned vertices.

## Scene (`?event=`)

The site calls this axis Scene (what plays out in front of the doorbell); its URL parameter and id stay `event`.

| id | Scene | Person in view |
|---|---|---|
| `delivery` | The person carries the package to the door (the baseline) | Yes |
| `dog` | A dog trots up the walk, sniffs near the steps, and trots back | No |
| `car` | An SUV drives past; at dusk, night, and IR its headlights and taillights are on | No |
| `empty` | Nothing moves but the weather (with `weather=wind`: swaying trees and moving shadows) | No |

- For `dog`, `car`, and `empty`, `window.bench` reports phase `none`, no person box, and no distance, so every detection is a false alarm.
- The dog (Quaternius Farm Animal Pack, CC0) has no walk clip; its legs trot in code, and its idle clip plays while it sniffs. The cars are from the Quaternius Realistic Car Pack (CC0); see `scene/public/props/LICENSE.txt`.
- Code: `scene/src/events.ts`.

## Surfaces and occlusion (`?surfaces=`, `?occlusion=`)

- `surfaces=flat` is the v1 look (one color per material). `surfaces=textured` gives walls, roofs, decks, walks, foundations, the street, and the lawn CC0 Poly Haven textures (`scene/public/surfaces/`, about 3 MB): a 1K color map, and 512 px normal and AO/roughness maps. UVs are in meters, so a tile has the same size on every wall. Siding takes each house's paint color.
- Each material carries its surface kind (`userData.surface`, set in `parts.ts`); the static merge keeps one draw call per material, so textures add no draw calls.
- `occlusion=bins` puts two curbside wheelie bins between the doorbell and the walk. `occlusion=car` parks a sedan (Quaternius, CC0): in the no-porch house's driveway it hides the approach; at the other houses it is at the curb.
- GPU-compressed (KTX2) textures were not possible here (no KTX encoder), so the color maps are WebP.
- Code: `scene/src/surfaces.ts`, `scene/src/props.ts`.

## Delivery (v2)

In each house, one person carries one package along that house's route: from the sidewalk, up the approach, to a drop spot that the doorbell can see. The person sets the package down, turns around, and walks back. Then the loop starts again.

- The person and the package are the same in every house for now. Both are future variation: body, clothing, skin tone, gait, and package size and color.
- The person is a rigged person (see Person and speed). Walking speed is 1.4 m/s.
- The motion is a pure function of time (`scene/src/delivery.ts`), so the frame at time t is the same on every run.
- Each house gives its `route` (a polyline; y is the floor height under the feet) and its `drop` spot in `houses.ts`. Stairs are ramps in the route, so the feet do not land on each step.

## Run the benchmark (Python)

One-time setup, from the repo root:

```sh
uv venv --python 3.12 bench/.venv
uv pip install --python bench/.venv/bin/python -r bench/requirements.txt
bench/.venv/bin/python -m playwright install chromium
```

Start the scene (`cd scene && npm run dev`), or use the live site with `--url`. The dev server reloads the page when a file in `scene/` changes, and a reload stops the run; for a long run, use the live site or a build (`npm run build && npx vite preview`). Then:

```sh
bench/.venv/bin/python bench/run.py                         # all 5 detectors, all 100 scenarios, 2 frames per second
bench/.venv/bin/python bench/run.py --detectors ssdlite yolo11x
bench/.venv/bin/python bench/run.py --limit 5               # the first 5 scenarios only
bench/.venv/bin/python bench/run.py --scenarios s001 s007
bench/.venv/bin/python bench/run.py --images                # also write marked-up frames to bench/out/
bench/.venv/bin/python bench/run.py --url https://antioch-demo-hoeksema.vercel.app
```

Progress: one line for each scenario and detector, printed as soon as it is scored, then a table by setting at the end:

```
[ 12/100] s012 ssdlite  46% (21/46)  FA 0  | so far 58% | stoop · delivery · night · rain · fisheye · hooded · walk · textured · bins | 62 frames, 14 s, about 22 min left
```

Detectors (all trained on COCO, real photos; only "person" boxes with a score of at least 0.5 count):

| id | Model | Library | Type |
|---|---|---|---|
| `frcnn-mobilenet` | Faster R-CNN MobileNetV3 (`fasterrcnn_mobilenet_v3_large_fpn`) | torchvision | Two-stage, small (v1) |
| `ssdlite` | SSDlite320 MobileNetV3 (`ssdlite320_mobilenet_v3_large`) | torchvision | One-stage, mobile, fastest (v1) |
| `frcnn-resnet50` | Faster R-CNN ResNet-50 v2 (`fasterrcnn_resnet50_fpn_v2`) | torchvision | Two-stage, strong |
| `yolo11x` | YOLO11x | Ultralytics (AGPL-3.0) | One-stage CNN, the usual industry choice |
| `rtdetr-x` | RT-DETR-x | Ultralytics (AGPL-3.0) | Transformer |

- The Ultralytics weights (about 240 MB) download once into `bench/weights/` (not in git). The Ultralytics usage analytics are off.
- The Ultralytics models run at the frame's own size (no downscale), so far people keep their pixels. The torchvision models use their own resize.
- Device: MPS (the Mac GPU) when it is there, else the CPU (`--device`). MPS and the CPU gave the same boxes, and two MPS runs gave the same boxes.
- Detector time per frame on an M1 Pro (MPS), over the full run: `frcnn-mobilenet` 108 ms, `ssdlite` 109 ms, `yolo11x` 307 ms, `frcnn-resnet50` 315 ms, `rtdetr-x` 352 ms.

Scenarios: the fixed list in `bench/scenarios.json`, made by `bench/scenarios.py`. Every detector runs on the same 100 scenarios:
- 76 deliveries and 24 events with no person (8 dog, 8 passing car, 8 empty). The no-person events measure false alarms.
- Each scenario sets every axis and its own seed. In the deliveries, every pair of axis values occurs together at least once. Each value occurs about equally often.
- The run checks each scenario against the settings that the scene reports (`window.bench.settings()`), so a renamed value fails and does not fall back to a default.

Frames:
- The page is the size of the doorbell image: 1280 × 720 for `basic`, 960 × 960 for `ring` (the same number of pixels).
- Chromium renders on the real GPU (Metal): about 0.2 s for each frame, against about 5 s without it (`--software`).
- `bench/frames/<scenario>/` caches the PNG frames, so every detector reads the exact same pixels and a second detector does not render again. The cache key is the query, the frame rate, the URL, and the last git commit of `scene/` (not counting the results and the Benchmarks page files). The full list is about 4.3 GB. `--recapture` renders again.

How it scores:
- **Ground truth:** the scene projects every vertex of the person onto the doorbell image (through the fisheye mapping for `ring`) and takes the box around them. The box covers the whole body, also the parts behind walls or rails.
- **Hit:** a person box overlaps the true box with IoU ≥ 0.3. The usual value is 0.5; 0.3 allows for the hidden body parts.
- **Miss:** the person is in view, but no person box matches.
- **False alarm (FA):** a person box that does not match the person. In the no-person events, every person box is a false alarm.
- **Detection rate:** hits ÷ frames with the person in view, overall, by distance (0–3, 3–6, 6–9, 9–12, 12+ m, on the ground from the doorbell), and by setting.
- **By setting:** for each value of each axis, the totals over the scenarios with that value. Person and speed count only the deliveries.
- **First seen:** the distance at the first hit while the person walks up (by setting: the median).

Output (in git, so the deployed page shows it):
- `scene/public/results/index.json`: the scenario list, and for each detector a summary of each scenario, of all scenarios, and by setting.
- `scene/public/results/<detector>/<scenario>.json`: every frame, with the true box and every detection.

A run replaces the results for the detectors and scenarios it runs and keeps the others. Results for scenarios that are not in the list are dropped.

Notable frames: after a run, `bench/.venv/bin/python bench/gallery.py` picks frames (every detector missed a near person, only one detector hit, the farthest hits, low light on the fisheye, false alarms, the best and worst scenarios) and saves them in `scene/public/notable/`, with a 480 px copy of each in `thumbs/` for the Gallery page. Each picture shows the true box and every detector's boxes, with a caption band: the reason, the scenario, every setting, the time, the distance, and each detector's result. A JSON file next to each picture has the same data and links to the frame on the live site. [`scene/public/notable/README.md`](scene/public/notable/README.md) shows them by category on GitHub.

More data in each frame record: `low` (person boxes from 0.1 up to the threshold, not counted, for other thresholds later), `iou` (the best overlap of a counted box with the true box), and `ms` (detector time). With `--images`, marked-up frames also go to `bench/out/<detector>/<scenario>/` (not in git).

## Benchmarks page

Styled after antioch.com:
- **Summary:** for each detector, the detection rate, the rate by distance, the median first-seen distance, false alarms per minute with no person, and the time per frame (the best in each row is green); the largest differences within one setting for the best detector; scoring notes; and links to the data files. All of it comes from `results/index.json`.
- **By setting:** one row for each value of each axis (for example Light: Dusk), one column for each detector. A cell is the detection rate over the scenarios with that value; for the events with no person (dog, passing car, empty) it is false alarms per minute. The best detector in each row is green. Click a row to list only its scenarios.
- **Scenarios:** the 100 scenarios (or those of the chosen setting) × the detectors. Click a cell to replay that scenario and detector.
- **Replay:** the Three.js scene itself, with the true box (white, dashed) and the detector's boxes (yellow) on the doorbell camera. The scene is deterministic, so each frame is the same frame that the detector saw.
- **Timeline:** play, pause, and step (space, ← →); one strip for each detector (green: hit, red: miss, gray: person out of view, orange: false alarm in a scene with no person). Click a frame to go to it.
- **Distance table:** detection rate by distance for each detector.

`/results` and `/results.html` (the old results page) redirect to `/benchmarks` (`scene/vercel.json`).

## Gallery page

The notable frames from `bench/gallery.py`, in groups (filter at the top). Each card has the picture (click for full size), the reason, the scenario, every setting, the time, the distance, each detector's result, and links: Open frame (the exact frame live, in capture mode) and Replay (the scenario on the Benchmarks page).

## Results (2026-10-27)

All 5 detectors on the 100 fixed scenarios (24,140 detector frames; 1 h 43 min on an M1 Pro from the frame cache).

| | frcnn-resnet50 | rtdetr-x | yolo11x | frcnn-mobilenet | ssdlite |
|---|---|---|---|---|---|
| Detection rate (deliveries) | **74%** | 67% | 65% | 48% | 15% |
| Day / dusk / night / IR | 82 / 78 / 69 / 67% | 72 / 75 / 65 / 58% | 74 / 67 / 63 / 58% | 61 / 50 / 47 / 36% | 19 / 17 / 14 / 13% |
| Basic / fisheye | 83 / 65% | 71 / 64% | 78 / 53% | 53 / 43% | 17 / 14% |
| Child height | 56% | 50% | 43% | 30% | 7% |
| At 12+ m | 62% | 53% | 49% | 15% | 0% |
| False alarms, no-person events | 3.9/min | 2.5/min | **1.4/min** | 5.7/min | 0.0/min |
| Time per frame (MPS) | 315 ms | 352 ms | 307 ms | 108 ms | 109 ms |

- The fisheye costs the strong detectors 7–25 points. IR and night are the hardest light; dusk is only a little below day.
- Child height is the hardest person: the package hides most of the body.
- The dog causes the most false alarms (scores up to 0.97 for "person").
- SSDlite makes no false alarms because it finds few people.
- Scoring limits: the true box covers hidden body parts, and a person behind a tree or mostly outside the frame counts as in view. Both lower every detector's rate.

## Deploy

Vercel project `antioch-demo-hoeksema`, with Root Directory `scene`. Vercel detects Vite; the output is `dist/`. GitHub is connected, so each merge to `main` deploys to production. A manual deploy is `vercel deploy --prod --yes` from the repo root.

## Status

v9: three pages (Simulations, Benchmarks, Gallery); nine scenario axes; a Python person-detection benchmark with five detectors on 100 fixed scenarios, and 67 notable frames.
