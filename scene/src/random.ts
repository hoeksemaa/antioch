// Three.js (browser): the scene's randomness. Every random choice in the scene
// must come from a stream here, so the same seed (?seed=, default 0) gives the
// same scene on every run.
//
// Each module takes its own named stream. Thus a change on one axis does not
// change the random values of another module.

// mulberry32: a small, fast, seedable generator. Returns numbers in [0, 1).
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a hash of a module name.
function hash(name: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

// A stream of numbers in [0, 1) for one module.
export function stream(seed: number, name: string) {
  return mulberry32(Math.imul(seed, 0x9e3779b1) ^ hash(name));
}

// A stream of jitter values in [-1, 1) for one module. Seed 0 is the
// canonical scene, so it always gives 0.
export function jitter(seed: number, name: string) {
  const next = stream(seed, name);
  return () => (seed === 0 ? 0 : 2 * next() - 1);
}
