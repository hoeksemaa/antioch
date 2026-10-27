"""Python: off-the-shelf person detectors, trained on real photos (COCO).

They know nothing about the simulation. Each one stands in for the product's
own detection model, which is the system under test. To add a detector, add
one entry to DETECTORS.

Two libraries, one interface (an image in, person boxes out):
- torchvision: frcnn-mobilenet and ssdlite (the v1 pair, small and fast),
  and frcnn-resnet50 (a strong two-stage model).
- Ultralytics: yolo11x (a one-stage CNN, the usual industry choice) and
  rtdetr-x (a transformer). Their weights download once into bench/weights/.
  Ultralytics is AGPL-3.0.
"""

from dataclasses import dataclass
from pathlib import Path

import torch
from PIL import Image
from torchvision.models import detection as tv

from capture import Box

WEIGHTS = Path(__file__).parent / "weights"


@dataclass(frozen=True)
class Spec:
    name: str  # display name
    library: str  # "torchvision" or "ultralytics"
    model: str  # torchvision builder name, or Ultralytics weights file
    weights: str = ""  # torchvision weights enum


DETECTORS = {
    "frcnn-mobilenet": Spec("Faster R-CNN MobileNetV3", "torchvision", "fasterrcnn_mobilenet_v3_large_fpn", "FasterRCNN_MobileNet_V3_Large_FPN_Weights"),
    "ssdlite": Spec("SSDlite320 MobileNetV3", "torchvision", "ssdlite320_mobilenet_v3_large", "SSDLite320_MobileNet_V3_Large_Weights"),
    "frcnn-resnet50": Spec("Faster R-CNN ResNet-50 v2", "torchvision", "fasterrcnn_resnet50_fpn_v2", "FasterRCNN_ResNet50_FPN_V2_Weights"),
    "yolo11x": Spec("YOLO11x", "ultralytics", "yolo11x.pt"),
    "rtdetr-x": Spec("RT-DETR-x", "ultralytics", "rtdetr-x.pt"),
}


class PersonDetector:
    """Person boxes (fractions of the image) with their confidence scores.
    Only boxes with a score of at least min_score count."""

    def __init__(self, id: str, min_score: float = 0.5, device: str = "cpu"):
        self.id = id
        self.spec = DETECTORS[id]
        self.name = self.spec.name
        self.min_score = min_score
        self.device = device
        if self.spec.library == "torchvision":
            weights = getattr(tv, self.spec.weights).DEFAULT
            self.source = f"torchvision {self.spec.model} ({weights})"
            self.model = getattr(tv, self.spec.model)(weights=weights).eval().to(device)
            self.preprocess = weights.transforms()
            self.person = weights.meta["categories"].index("person")
        else:
            from ultralytics import RTDETR, YOLO, settings

            settings.update({"sync": False})  # no usage analytics
            WEIGHTS.mkdir(exist_ok=True)
            loader = RTDETR if self.spec.model.startswith("rtdetr") else YOLO
            self.model = loader(str(WEIGHTS / self.spec.model))
            self.source = f"Ultralytics {self.spec.model} (COCO)"
            self.person = 0  # COCO class 0

    @torch.inference_mode()
    def __call__(self, image: Image.Image) -> list[tuple[Box, float]]:
        w, h = image.size
        if self.spec.library == "torchvision":
            out = self.model([self.preprocess(image).to(self.device)])[0]
            return [
                ((x0 / w, y0 / h, x1 / w, y1 / h), score)
                for (x0, y0, x1, y1), label, score in zip(
                    out["boxes"].tolist(), out["labels"].tolist(), out["scores"].tolist()
                )
                if label == self.person and score >= self.min_score
            ]
        # The frame's own size (long side, a multiple of 32): no downscale, so
        # far people keep their pixels.
        size = -(-max(w, h) // 32) * 32
        result = self.model.predict(image, imgsz=size, conf=self.min_score, classes=[self.person], device=self.device, verbose=False)[0]
        return [(tuple(box), score) for box, score in zip(result.boxes.xyxyn.tolist(), result.boxes.conf.tolist())]
