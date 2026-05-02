import type { MetaState, SampleId, WeaponId } from './types'

const STORAGE_KEY = 'particle-accelerator:meta'

const DEFAULT_META: MetaState = {
  credits: 0,
  totalRuns: 0,
  bestTime: 0,
  wins: 0,
  unlockedSamples: ['wildType'],
  activeSample: 'wildType',
  unlockedWeapons: ['pcr'],
  permUpgrades: {
    maxHp: 0,
    damage: 0,
    speed: 0,
    pickup: 0,
  },
  dailyRecords: {},
  achievements: [],
  tier2Reached: [],
  evolutionsTriggered: [],
  bossRecords: {},
  endlessRecord: 0,
  onboarded: false,
}

export function loadMeta(): MetaState {
  if (typeof window === 'undefined') return { ...DEFAULT_META }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_META }
    const parsed = JSON.parse(raw) as Partial<MetaState>
    return {
      ...DEFAULT_META,
      ...parsed,
      permUpgrades: {
        ...DEFAULT_META.permUpgrades,
        ...(parsed.permUpgrades ?? {}),
      },
      unlockedSamples:
        (parsed.unlockedSamples as SampleId[]) ?? DEFAULT_META.unlockedSamples,
      activeSample: (parsed.activeSample as SampleId) ?? DEFAULT_META.activeSample,
      unlockedWeapons: (parsed.unlockedWeapons as WeaponId[]) ?? DEFAULT_META.unlockedWeapons,
      dailyRecords: parsed.dailyRecords ?? DEFAULT_META.dailyRecords,
      achievements: parsed.achievements ?? DEFAULT_META.achievements,
      tier2Reached: parsed.tier2Reached ?? DEFAULT_META.tier2Reached,
      evolutionsTriggered: parsed.evolutionsTriggered ?? DEFAULT_META.evolutionsTriggered,
      bossRecords: parsed.bossRecords ?? DEFAULT_META.bossRecords,
      endlessRecord: parsed.endlessRecord ?? DEFAULT_META.endlessRecord,
      onboarded: parsed.onboarded ?? DEFAULT_META.onboarded,
    }
  } catch {
    return { ...DEFAULT_META }
  }
}

export function saveMeta(meta: MetaState) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meta))
  } catch {
    /* ignore */
  }
}

export function resetMeta() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
