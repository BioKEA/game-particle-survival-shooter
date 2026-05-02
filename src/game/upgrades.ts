import type { EvolutionDef, Lineage, UpgradeMeta, WeaponId, PassiveId } from './types'

export const LINEAGES: Record<
  Lineage,
  {
    name: string
    tagline: string
    color: string
    bg: string
    threshold1: number
    threshold2: number
    bonus3: string
    bonus5: string
  }
> = {
  amplify: {
    name: 'Amplify',
    tagline: 'Burst damage. Cycle faster, hit harder.',
    color: '#ff6b6b',
    bg: 'rgba(255,107,107,0.12)',
    threshold1: 3,
    threshold2: 4,
    bonus3: '+25% weapon damage',
    bonus5: '−15% weapon cooldowns',
  },
  contain: {
    name: 'Contain',
    tagline: 'Area control. Slow them, hold the chamber.',
    color: '#5eead4',
    bg: 'rgba(94,234,212,0.12)',
    threshold1: 3,
    threshold2: 4,
    bonus3: '+30 max HP, +15% pickup',
    bonus5: 'Hazards damage 50% less',
  },
  edit: {
    name: 'Edit',
    tagline: 'Precision. Track and excise the right target.',
    color: '#c084fc',
    bg: 'rgba(192,132,252,0.12)',
    threshold1: 3,
    threshold2: 4,
    bonus3: '+12% speed',
    bonus5: 'Homing turn rate +60%',
  },
}

export const WEAPON_META: Record<WeaponId, UpgradeMeta> = {
  pcr: {
    id: 'pcr',
    kind: 'weapon',
    name: 'PCR Amplifier',
    short: 'PCR',
    description: (lvl) =>
      lvl === 1
        ? 'Fires an amplified primer at the nearest contaminant.'
        : `Lvl ${lvl}: +1 primer per cycle, faster amplification.`,
    maxLevel: 6,
    color: '#5eead4',
    lineage: 'amplify',
  },
  crispr: {
    id: 'crispr',
    kind: 'weapon',
    name: 'CRISPR-Cas9',
    short: 'CR9',
    description: (lvl) =>
      lvl === 1
        ? 'Edits a tracked sequence — homes in on a target and excises it.'
        : `Lvl ${lvl}: shorter guide-RNA design time, more strands per edit.`,
    maxLevel: 6,
    color: '#c084fc',
    lineage: 'edit',
  },
  centrifuge: {
    id: 'centrifuge',
    kind: 'weapon',
    name: 'Centrifuge Spin',
    short: 'CTF',
    description: (lvl) =>
      lvl === 1
        ? 'Orbiting rotor flings contaminants away from the sample.'
        : `Lvl ${lvl}: more rotors, higher RPM, wider radius.`,
    maxLevel: 6,
    color: '#fbbf24',
    lineage: 'contain',
  },
  electrophoresis: {
    id: 'electrophoresis',
    kind: 'weapon',
    name: 'Gel Electrophoresis',
    short: 'GEL',
    description: (lvl) =>
      lvl === 1
        ? 'Sweeping voltage band — shocks anything caught in the field.'
        : `Lvl ${lvl}: wider band, higher voltage, faster sweep.`,
    maxLevel: 5,
    color: '#34d399',
    lineage: 'contain',
  },
  massSpec: {
    id: 'massSpec',
    kind: 'weapon',
    name: 'Mass Spec Laser',
    short: 'MS',
    description: (lvl) =>
      lvl === 1
        ? 'Rotating ionizing beam — vaporizes anything it sweeps across.'
        : `Lvl ${lvl}: longer beam, faster sweep, more damage.`,
    maxLevel: 5,
    color: '#f472b6',
    lineage: 'amplify',
  },
  antibody: {
    id: 'antibody',
    kind: 'weapon',
    name: 'Antibody Swarm',
    short: 'AB',
    description: (lvl) =>
      lvl === 1
        ? 'Releases a tagged antibody that hunts down nearby contaminants.'
        : `Lvl ${lvl}: more antibodies per release, longer half-life.`,
    maxLevel: 5,
    color: '#22d3ee',
    lineage: 'edit',
  },
  cryoVial: {
    id: 'cryoVial',
    kind: 'weapon',
    name: 'Cryogenic Vial',
    short: 'CRY',
    description: (lvl) =>
      lvl === 1
        ? 'Drops a flash-freezing vial near a contaminant — slows and damages.'
        : `Lvl ${lvl}: larger AoE, colder freeze, more vials.`,
    maxLevel: 5,
    color: '#7dd3fc',
    lineage: 'contain',
  },
  // Evolutions — single-level terminal upgrades
  qpcr: {
    id: 'qpcr',
    kind: 'weapon',
    name: 'qPCR Cycler',
    short: 'qPCR',
    description: () => 'Evolved PCR. 5-primer spread, ultra-fast cycle, weak homing.',
    maxLevel: 1,
    color: '#06b6d4',
    lineage: 'amplify',
    isEvolution: true,
  },
  cas12a: {
    id: 'cas12a',
    kind: 'weapon',
    name: 'Cas12a Array',
    short: 'C12',
    description: () => 'Evolved CRISPR. Multi-target — edits 4 sequences in parallel.',
    maxLevel: 1,
    color: '#a855f7',
    lineage: 'edit',
    isEvolution: true,
  },
  ultracentrifuge: {
    id: 'ultracentrifuge',
    kind: 'weapon',
    name: 'Ultracentrifuge',
    short: 'ULT',
    description: () => 'Evolved Centrifuge. 14 rotors at extreme radius, devastating spin.',
    maxLevel: 1,
    color: '#f59e0b',
    lineage: 'contain',
    isEvolution: true,
  },
  capillary: {
    id: 'capillary',
    kind: 'weapon',
    name: 'Capillary Electrophoresis',
    short: 'CAP',
    description: () => 'Evolved Gel. Cross-axis sweep — both bands fire every cycle.',
    maxLevel: 1,
    color: '#10b981',
    lineage: 'contain',
    isEvolution: true,
  },
  tandemMs: {
    id: 'tandemMs',
    kind: 'weapon',
    name: 'Tandem Mass Spec',
    short: 'tMS',
    description: () => 'Evolved Mass Spec. Twin opposing beams — full perimeter sweep.',
    maxLevel: 1,
    color: '#ec4899',
    lineage: 'amplify',
    isEvolution: true,
  },
  polyclonal: {
    id: 'polyclonal',
    kind: 'weapon',
    name: 'Polyclonal Swarm',
    short: 'POLY',
    description: () => 'Evolved Antibody. 8 homing antibodies, ricochet between targets.',
    maxLevel: 1,
    color: '#0ea5e9',
    lineage: 'edit',
    isEvolution: true,
  },
  liquidN2: {
    id: 'liquidN2',
    kind: 'weapon',
    name: 'Liquid N₂ Bath',
    short: 'LN2',
    description: () => 'Evolved Cryo. Cryogenic field — massive AoE, prolonged freeze.',
    maxLevel: 1,
    color: '#38bdf8',
    lineage: 'contain',
    isEvolution: true,
  },
}

export const EVOLUTIONS: EvolutionDef[] = [
  {
    id: 'qpcr',
    source: 'pcr',
    requires: 'buffer',
    name: 'qPCR Cycler',
    short: 'qPCR',
    description: 'PCR + Buffer Solution',
    color: '#06b6d4',
  },
  {
    id: 'cas12a',
    source: 'crispr',
    requires: 'pipette',
    name: 'Cas12a Array',
    short: 'C12',
    description: 'CRISPR + Pipette Precision',
    color: '#a855f7',
  },
  {
    id: 'ultracentrifuge',
    source: 'centrifuge',
    requires: 'centrifugalForce',
    name: 'Ultracentrifuge',
    short: 'ULT',
    description: 'Centrifuge + Centrifugal Force',
    color: '#f59e0b',
  },
  {
    id: 'capillary',
    source: 'electrophoresis',
    requires: 'catalyst',
    name: 'Capillary Electro',
    short: 'CAP',
    description: 'Gel + Catalyst',
    color: '#10b981',
  },
  {
    id: 'tandemMs',
    source: 'massSpec',
    requires: 'stirBar',
    name: 'Tandem MS',
    short: 'tMS',
    description: 'Mass Spec + Stir Bar',
    color: '#ec4899',
  },
  {
    id: 'polyclonal',
    source: 'antibody',
    requires: 'labCoat',
    name: 'Polyclonal Swarm',
    short: 'POLY',
    description: 'Antibody + Lab Coat',
    color: '#0ea5e9',
  },
  {
    id: 'liquidN2',
    source: 'cryoVial',
    requires: 'pipette',
    name: 'Liquid N₂ Bath',
    short: 'LN2',
    description: 'Cryo + Pipette Precision',
    color: '#38bdf8',
  },
]

export const PASSIVE_META: Record<PassiveId, UpgradeMeta> = {
  stirBar: {
    id: 'stirBar',
    kind: 'passive',
    name: 'Magnetic Stir Bar',
    short: 'STIR',
    description: (lvl) => `Lvl ${lvl}: pickup radius +${lvl * 25}%.`,
    maxLevel: 4,
    color: '#a3e635',
    lineage: 'contain',
  },
  labCoat: {
    id: 'labCoat',
    kind: 'passive',
    name: 'Kevlar Lab Coat',
    short: 'COAT',
    description: (lvl) => `Lvl ${lvl}: max HP +${lvl * 20}.`,
    maxLevel: 4,
    color: '#94a3b8',
    lineage: 'contain',
  },
  catalyst: {
    id: 'catalyst',
    kind: 'passive',
    name: 'Catalyst',
    short: 'CAT',
    description: (lvl) => `Lvl ${lvl}: weapon cooldowns −${lvl * 10}%.`,
    maxLevel: 4,
    color: '#fb923c',
    lineage: 'amplify',
  },
  buffer: {
    id: 'buffer',
    kind: 'passive',
    name: 'Buffer Solution',
    short: 'BUF',
    description: (lvl) => `Lvl ${lvl}: weapon damage +${lvl * 15}%.`,
    maxLevel: 4,
    color: '#f87171',
    lineage: 'amplify',
  },
  pipette: {
    id: 'pipette',
    kind: 'passive',
    name: 'Pipette Precision',
    short: 'PIP',
    description: (lvl) => `Lvl ${lvl}: projectile size +${lvl * 15}%.`,
    maxLevel: 4,
    color: '#e879f9',
    lineage: 'edit',
  },
  centrifugalForce: {
    id: 'centrifugalForce',
    kind: 'passive',
    name: 'Centrifugal Force',
    short: 'FRC',
    description: (lvl) => `Lvl ${lvl}: movement speed +${lvl * 8}%.`,
    maxLevel: 4,
    color: '#60a5fa',
    lineage: 'edit',
  },
}

export const ALL_WEAPON_IDS = Object.keys(WEAPON_META) as WeaponId[]
export const ALL_PASSIVE_IDS = Object.keys(PASSIVE_META) as PassiveId[]

export function getMeta(id: string): UpgradeMeta | undefined {
  return (
    WEAPON_META[id as WeaponId] ?? PASSIVE_META[id as PassiveId]
  )
}

export interface LineageScore {
  amplify: number
  contain: number
  edit: number
}

export function dominantLineage(scores: LineageScore): Lineage | null {
  const total = scores.amplify + scores.contain + scores.edit
  if (total === 0) return null
  let best: Lineage = 'amplify'
  let bestN = scores.amplify
  if (scores.contain > bestN) {
    best = 'contain'
    bestN = scores.contain
  }
  if (scores.edit > bestN) {
    best = 'edit'
    bestN = scores.edit
  }
  return best
}
