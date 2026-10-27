// The Python benchmark's results (scene/public/results/, made by bench/run.py)
// as the Benchmark and Analysis pages read them: the types of index.json and
// of the per-frame files, and small helpers.

import type { AxisId } from "./settings";

export type Pair = [number, number]; // [detected, in view]

export interface Summary {
  frames: number;
  seconds: number; // scene time
  in_view: number;
  detected: number;
  first_seen_m: number | null;
  false_alarms: number;
  ms_per_frame?: number; // detector time
  scenarios?: number;
  by_distance: Record<string, Pair>;
}

export interface Detector {
  id: string;
  name: string;
  source: string;
  settings: { min_score: number; min_iou: number; fps: number; device?: string };
  results: Record<string, Summary>;
  all: Summary;
  by_setting: Record<string, Record<string, Summary>>;
}

export interface Scenario {
  id: string;
  name: string;
  settings: Record<AxisId, string>;
  seed: number;
  query: string;
}

export interface Index {
  updated: string;
  scenarios: Scenario[];
  detectors: Detector[];
}

// One scored frame of one scenario for one detector.
export interface Frame {
  t: number;
  phase: string;
  d: number | null; // doorbell to person, m; null with no person
  truth: number[] | null;
  dets: number[][]; // [x0, y0, x1, y1, score]
  hit: boolean | null;
  fa: number;
}

export const base = import.meta.env.BASE_URL;
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "–");
export const perMinute = (s: Summary) => (s.seconds ? (s.false_alarms / s.seconds) * 60 : 0);
export const noPerson = (s: Scenario) => s.settings.event !== "delivery";
export const NO_PERSON_EVENTS = ["dog", "car", "empty"];

// The detector with the best detection rate over all deliveries.
export function bestDetector(detectors: Detector[]) {
  const rate = (s?: Summary) => (s && s.in_view ? s.detected / s.in_view : -1);
  return [...detectors].sort((a, b) => rate(b.all) - rate(a.all))[0];
}

export function sum(rows: Summary[]): Summary {
  const add = (k: "frames" | "seconds" | "in_view" | "detected" | "false_alarms") => rows.reduce((n, r) => n + r[k], 0);
  return { frames: add("frames"), seconds: add("seconds"), in_view: add("in_view"), detected: add("detected"), false_alarms: add("false_alarms"), first_seen_m: null, by_distance: {} };
}

export async function loadIndex(): Promise<Index | null> {
  try {
    const res = await fetch(`${base}results/index.json`);
    return res.ok ? await res.json() : null;
  } catch {
    return null; // no results yet: the page says so
  }
}
