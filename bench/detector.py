"""Python: off-the-shelf person detectors, trained on real photos (COCO).

They know nothing about the simulation. Each one stands in for the product's
own detection model, which is the system under test. To add a detector, add
one entry to DETECTORS.
"""

import torch
from PIL import Image
from torchvision.models.detection import (
    FasterRCNN_MobileNet_V3_Large_FPN_Weights,
    SSDLite320_MobileNet_V3_Large_Weights,
    fasterrcnn_mobilenet_v3_large_fpn,
    ssdlite320_mobilenet_v3_large,
)

from capture import Box

# id: (display name, torchvision builder, torchvision weights)
DETECTORS = {
    "frcnn-mobilenet": (
        "Faster R-CNN MobileNetV3",
        fasterrcnn_mobilenet_v3_large_fpn,
        FasterRCNN_MobileNet_V3_Large_FPN_Weights.DEFAULT,
    ),
    "ssdlite": (
        "SSDlite320 MobileNetV3",
        ssdlite320_mobilenet_v3_large,
        SSDLite320_MobileNet_V3_Large_Weights.DEFAULT,
    ),
}


class PersonDetector:
    def __init__(self, id: str, min_score: float = 0.5):
        self.id = id
        self.name, builder, weights = DETECTORS[id]
        self.source = f"torchvision {builder.__name__} ({weights})"
        self.model = builder(weights=weights).eval()
        self.preprocess = weights.transforms()
        self.person = weights.meta["categories"].index("person")
        self.min_score = min_score

    @torch.inference_mode()
    def __call__(self, image: Image.Image) -> list[tuple[Box, float]]:
        """Person boxes (fractions of the image) with their confidence scores."""
        out = self.model([self.preprocess(image)])[0]
        w, h = image.size
        return [
            ((x0 / w, y0 / h, x1 / w, y1 / h), score)
            for (x0, y0, x1, y1), label, score in zip(
                out["boxes"].tolist(), out["labels"].tolist(), out["scores"].tolist()
            )
            if label == self.person and score >= self.min_score
        ]
