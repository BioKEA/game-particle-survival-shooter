// Deterministic RNG for daily seeds. When unset, falls back to Math.random.
// Mulberry32 — fast, small, good enough distribution for spawn / loot decisions.

let _rng: () => number = Math.random

export function setSeed(seed: number) {
  let state = seed >>> 0
  _rng = () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function clearSeed() {
  _rng = Math.random
}

export function rng(): number {
  return _rng()
}

// Hash a string deterministically into a 32-bit unsigned int.
export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  }
  return h >>> 0
}

export function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todaySeed(): number {
  return hashString(todayKey())
}

export function shortSeed(seed: number): string {
  return seed.toString(16).toUpperCase().slice(0, 6).padStart(6, '0')
}
