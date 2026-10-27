"""Python: opens the Three.js scene (scene/) in headless Chromium and captures
doorbell frames.

For each time t, it asks the scene (window.bench, in scene/src/bench.ts) to
render that frame and to report the ground truth, then takes a screenshot.

Frames are cached in bench/frames/<scenario>/ (PNG, as Chromium wrote them),
so every detector reads the exact same pixels and a second detector does not
render again. The cache key is the scenario query, the frame rate, the scene
URL, and the last git commit of scene/ (not counting the results and the
Benchmarks page files, which the capture does not load); a change to any of
them renders again.
"""

import json
import subprocess
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

FRAMES = Path(__file__).parent / "frames"
# The page is the size of the doorbell image, so the frame fills it exactly.
# Both sizes have the same number of pixels (921,600).
SIZES = {"basic": (1280, 720), "ring": (960, 960)}
# The real GPU (Metal on a Mac): about 0.2 s for each frame, against about 5 s
# with software rendering.
GPU = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]

Box = tuple[float, float, float, float]  # x0, y0, x1, y1 as fractions of the image


@dataclass
class Frame:
    scenario: str
    t: float  # s from the start of the event loop
    image: Image.Image
    phase: str  # approach, drop, leave, or gone; none for events with no person
    truth: Box | None  # where the person is; None when out of view or no person
    distance: float | None  # doorbell to person, on the ground, m; None with no person


# Files in scene/ that the capture page does not load.
NOT_CAPTURE = ["scene/public/results", "scene/benchmarks.html", "scene/src/benchmarks.ts", "scene/src/benchmarks.css"]


def scene_version() -> str:
    """The last git commit that changed what the capture page loads (empty
    outside git)."""
    root = Path(__file__).parent.parent
    paths = ["scene", *(f":(exclude){p}" for p in NOT_CAPTURE)]
    out = subprocess.run(["git", "log", "-1", "--format=%H", "--", *paths], cwd=root, capture_output=True, text=True)
    return out.stdout.strip()


class Scene:
    """One headless browser for a whole benchmark run."""

    def __init__(self, url: str, gpu: bool = True, recapture: bool = False):
        self.url = url.rstrip("/")
        self.gpu = gpu
        self.recapture = recapture  # ignore the cache
        self.version = scene_version()

    def __enter__(self):
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(args=GPU if self.gpu else [])
        return self

    def __exit__(self, *exc):
        self._browser.close()
        self._playwright.stop()

    def frames(self, scenario: dict, fps: float) -> tuple[list[Frame], bool]:
        """Every frame of one event loop at the given frame rate, and True if
        they came from the cache. The scenario's seed sets every random
        choice in the scene, so the same scenario gives the same frames."""
        key = {"query": scenario["query"], "fps": fps, "url": self.url, "scene": self.version}
        folder = FRAMES / scenario["id"]
        index = folder / "frames.json"
        if index.exists() and not self.recapture:
            cached = json.loads(index.read_text())
            if cached["key"] == key:
                return [self._frame(scenario, folder, f) for f in cached["frames"]], True

        # A page that reloads or crashes during a capture (for example the dev
        # server after a file change) gets one more try.
        try:
            records = self._capture(scenario, fps, folder)
        except PlaywrightError as error:
            print(f"  {scenario['id']}: capture failed ({str(error).splitlines()[0]}); trying again", flush=True)
            records = self._capture(scenario, fps, folder)
        index.write_text(json.dumps({"key": key, "frames": records}))
        return [self._frame(scenario, folder, f) for f in records], False

    def _capture(self, scenario: dict, fps: float, folder: Path) -> list[dict]:
        width, height = SIZES[scenario["settings"]["camera"]]
        page = self._browser.new_page(viewport={"width": width, "height": height})
        try:
            page.goto(f"{self.url}/?{scenario['query']}&view=doorbell&t=0")
            page.wait_for_function("window.bench !== undefined", timeout=60_000)
            # The scene falls back to a default for an unknown value; a
            # benchmark must not run on a scene it did not ask for.
            loaded = page.evaluate("window.bench.settings()")
            wrong = {a: (v, loaded.get(a)) for a, v in {**scenario["settings"], "seed": scenario["seed"]}.items() if loaded.get(a) != v}
            if wrong:
                raise ValueError(f"{scenario['id']}: the scene loaded other settings (asked, got): {wrong}")
            duration = page.evaluate("window.bench.duration()")
            page.evaluate("window.bench.render(0)")
            page.screenshot()  # the first frame after a load can differ; drop it
            folder.mkdir(parents=True, exist_ok=True)
            for old in folder.glob("*.png"):
                old.unlink()
            records = []
            for i in range(int(duration * fps)):
                truth = page.evaluate("t => window.bench.render(t)", i / fps)
                name = f"{i:04d}.png"
                (folder / name).write_bytes(page.screenshot())
                records.append({"file": name, "t": truth["t"], "phase": truth["phase"], "box": truth["box"], "distance": truth["distance"]})
        finally:
            page.close()
        return records

    @staticmethod
    def _frame(scenario: dict, folder: Path, f: dict) -> Frame:
        image = Image.open(BytesIO((folder / f["file"]).read_bytes())).convert("RGB")
        box = tuple(f["box"]) if f["box"] else None
        return Frame(scenario["id"], f["t"], image, f["phase"], box, f["distance"])
