// Simulations page: one symbol for each axis in settings.ts, for the label
// column of the controls panel. Each is a 16 × 16 outline that takes the
// text color (stroke="currentColor").

import type { AxisId } from "./settings";

const SHAPES: Record<AxisId, string> = {
  // A house with eaves and a door.
  house: `<path d="M1.75 7.5 8 2.25l6.25 5.25"/><path d="M3.5 6.1v7.4h9V6.1"/><path d="M6.75 13.5V10.25h2.5v3.25"/>`,
  // The scene that plays out: a play button in a frame.
  event: `<rect x="1.5" y="3.25" width="13" height="9.5" rx="2.5"/><path d="M6.6 5.9v4.2l3.6-2.1Z" fill="currentColor"/>`,
  // The sun.
  light: `<circle cx="8" cy="8" r="2.75"/><path d="M8 1.25v1.5M8 13.25v1.5M1.25 8h1.5M13.25 8h1.5M3.23 3.23l1.06 1.06M11.71 11.71l1.06 1.06M3.23 12.77l1.06-1.06M11.71 4.29l1.06-1.06"/>`,
  // A cloud with rain.
  weather: `<path d="M4.75 10.25h6.5a2.5 2.5 0 0 0 .2-4.99 3.75 3.75 0 0 0-7.1.37 2.32 2.32 0 0 0 .4 4.62Z"/><path d="M5.5 12.5l-.6 1.5M8.25 12.5l-.6 1.5M11 12.5l-.6 1.5"/>`,
  // A camera body and lens.
  camera: `<rect x="1.5" y="4.25" width="13" height="9.25" rx="2"/><circle cx="8" cy="8.9" r="2.6"/><path d="M5.5 4.25 6.5 2.5h3l1 1.75"/>`,
  // Head and shoulders.
  person: `<circle cx="8" cy="5" r="2.75"/><path d="M2.75 14.25c0-3 2.35-4.75 5.25-4.75s5.25 1.75 5.25 4.75"/>`,
  // A speed gauge.
  speed: `<path d="M2.25 10.5a5.75 5.75 0 0 1 11.5 0"/><path d="M8 10.5l3-3.75"/><circle cx="8" cy="10.5" r="0.9" fill="currentColor" stroke="none"/>`,
  // A textured tile.
  surfaces: `<rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2"/><path d="M2.75 8.75l6-6M3.75 12.25l8.5-8.5M7.25 13.25l6-6"/>`,
  // Out of sight: an eye with a slash.
  occlusion: `<path d="M1.5 8S3.9 3.75 8 3.75 14.5 8 14.5 8 12.1 12.25 8 12.25 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2"/><path d="M2.75 2.75l10.5 10.5"/>`,
};

export function icon(id: AxisId) {
  return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SHAPES[id]}</svg>`;
}
