# Doorbell camera benchmark (unofficial Antioch demo)

A browser simulation of a doorbell camera on a porch, in many environments. It benchmarks one detection task: find the person before they reach the door.

Unofficial demo by [John Hoeksema](https://johnhoeksema.com) for the Member of Technical Staff, Core Platform role at Antioch. Not affiliated with Antioch. All scenes and results are simulated and uncalibrated.

Live: not deployed yet.

## Plan

- Scene: Three.js porch, with the camera at doorbell height.
- Detector: TensorFlow.js COCO-SSD, class "person".
- Benchmark: a seeded grid of scenarios (lighting × weather × start distance × speed). The sim gives the ground truth, so no hand labels.
- Results: detection rate for each environment, and a baseline vs. candidate model comparison.

## Status

Setup only. No code yet.
