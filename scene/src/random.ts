// Three.js (browser): the scene's one source of randomness. Every random
// choice in the scene must use rng(), so the same seed (?seed=, default 0)
// gives the same scene on every run. Nothing is random yet.

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

export let rng = mulberry32(0);

// Called before each house is built, so a house and a seed always give the
// same choices, in any order.
export function reseed(seed: number) {
  rng = mulberry32(seed);
}
