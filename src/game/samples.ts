import type { SampleDef, SampleId } from './types'

export const SAMPLES: Record<SampleId, SampleDef> = {
  wildType: {
    id: 'wildType',
    name: 'Wild-type',
    short: 'WT',
    description: 'Balanced reference sample. The control.',
    cost: 0,
    hpMod: 0,
    dmgMult: 1,
    speedMult: 1,
    pickupMult: 1,
    starterWeapon: 'pcr',
    color: '#4a82ff',
    shape: 'circle',
  },
  plasmid: {
    id: 'plasmid',
    name: 'Engineered Plasmid',
    short: 'PLM',
    description: 'Light, fast, fragile. Built for evasion.',
    cost: 350,
    hpMod: -10,
    dmgMult: 1.0,
    speedMult: 1.22,
    pickupMult: 1.1,
    starterWeapon: 'crispr',
    color: '#aff048',
    shape: 'ring',
  },
  stemCell: {
    id: 'stemCell',
    name: 'Pluripotent Stem Cell',
    short: 'STM',
    description: 'Hardy generalist. More HP, slower, larger pickup.',
    cost: 800,
    hpMod: 30,
    dmgMult: 0.95,
    speedMult: 0.95,
    pickupMult: 1.25,
    starterWeapon: 'centrifuge',
    color: '#f472b6',
    shape: 'circle',
  },
  taggedAb: {
    id: 'taggedAb',
    name: 'Fluorescent Antibody',
    short: 'TAG',
    description: 'Sharp damage, broader awareness, more fragile.',
    cost: 1500,
    hpMod: -10,
    dmgMult: 1.15,
    speedMult: 1.0,
    pickupMult: 1.15,
    starterWeapon: 'antibody',
    color: '#fbbf24',
    shape: 'crystal',
  },
}

export const ALL_SAMPLE_IDS = Object.keys(SAMPLES) as SampleId[]

export function getSample(id: SampleId): SampleDef {
  return SAMPLES[id] ?? SAMPLES.wildType
}
