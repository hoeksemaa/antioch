"""Python: opens the Three.js scene (scene/) in headless Chromium and captures
doorbell frames.

For each time t, it asks the scene (window.bench, in scene/src/bench.ts) to
render that frame and to report the ground truth, then takes a screenshot.
"""

from dataclasses import dataclass
from io import BytesIO

from PIL import Image
from playwright.sync_api import sync_playwright

# 16:9, the doorbell camera's aspect, so the frame fills the page exactly.
WIDTH, HEIGHT = 1280, 720

Box = tuple[float, float, float, float]  # x0, y0, x1, y1 as fractions of the image


@dataclass
class Frame:
    scenario: str
    t: float  # s from the start of the delivery loop
    image: Image.Image
    phase: str  # approach, drop, leave, or gone
    truth: Box | None  # where the person is; None when out of view
    distance: float  # doorbell to person, on the ground, m


class Scene:
    """One headless browser for a whole benchmark run."""

    def __init__(self, url: str):
        self.url = url.rstrip("/")

    def __enter__(self):
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch()
        self._page = self._browser.new_page(viewport={"width": WIDTH, "height": HEIGHT})
        return self

    def __exit__(self, *exc):
        self._browser.close()
        self._playwright.stop()

    def _open(self, query: str, seed: int = 0):
        self._page.goto(f"{self.url}/?{query}&view=doorbell&seed={seed}&t=0")
        self._page.wait_for_function("window.bench !== undefined")

    def scenarios(self) -> list[dict]:
        """The scenarios that the scene offers: id, name, and query."""
        self._open("")
        return self._page.evaluate("window.bench.scenarios()")

    def frames(self, scenario: dict, fps: float, seed: int) -> list[Frame]:
        """Every frame of one delivery loop at the given frame rate. The seed
        sets every random choice in the scene, so the same seed gives the
        same frames."""
        page = self._page
        self._open(scenario["query"], seed)
        duration = page.evaluate("window.bench.duration()")
        frames = []
        for i in range(int(duration * fps)):
            truth = page.evaluate("t => window.bench.render(t)", i / fps)
            image = Image.open(BytesIO(page.screenshot())).convert("RGB")
            box = tuple(truth["box"]) if truth["box"] else None
            frames.append(Frame(scenario["id"], truth["t"], image, truth["phase"], box, truth["distance"]))
        return frames
