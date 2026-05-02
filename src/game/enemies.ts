import type { Enemy, EnemyKind, Vec2 } from './types'
import { rng } from './rng'

interface EnemyTemplate {
  hp: number
  damage: number
  speed: number
  radius: number
  xp: number
  color: string
  outline: string
  shape: 'blob' | 'spike' | 'ring' | 'crystal' | 'cube' | 'arrow' | 'antenna'
}

export const ENEMY_TEMPLATES: Record<EnemyKind, EnemyTemplate> = {
  bacteria: {
    hp: 8,
    damage: 8,
    speed: 38,
    radius: 11,
    xp: 1,
    color: '#ff4d6d',
    outline: '#1a0410',
    shape: 'blob',
  },
  plasmid: {
    hp: 4,
    damage: 6,
    speed: 62,
    radius: 8,
    xp: 1,
    color: '#ff7a8a',
    outline: '#1a0410',
    shape: 'ring',
  },
  denaturant: {
    hp: 60,
    damage: 14,
    speed: 22,
    radius: 22,
    xp: 6,
    color: '#9f1239',
    outline: '#350a14',
    shape: 'blob',
  },
  denaturantSpawn: {
    hp: 12,
    damage: 7,
    speed: 32,
    radius: 9,
    xp: 1,
    color: '#be1a3f',
    outline: '#350a14',
    shape: 'blob',
  },
  radical: {
    hp: 12,
    damage: 10,
    speed: 88,
    radius: 9,
    xp: 2,
    color: '#fb7185',
    outline: '#1a0410',
    shape: 'spike',
  },
  mycoplasma: {
    hp: 3,
    damage: 4,
    speed: 70,
    radius: 6,
    xp: 1,
    color: '#fda4af',
    outline: '#1a0410',
    shape: 'ring',
  },
  endotoxin: {
    hp: 30,
    damage: 9,
    speed: 28,
    radius: 14,
    xp: 3,
    color: '#dc2626',
    outline: '#350a14',
    shape: 'crystal',
  },
  lance: {
    hp: 55,
    damage: 17,
    speed: 38,
    radius: 13,
    xp: 4,
    color: '#fb7185',
    outline: '#3a0a14',
    shape: 'arrow',
  },
  tracker: {
    hp: 24,
    damage: 11,
    speed: 22,
    radius: 12,
    xp: 3,
    color: '#f97316',
    outline: '#3a1a04',
    shape: 'antenna',
  },
  prion: {
    hp: 1500,
    damage: 22,
    speed: 32,
    radius: 56,
    xp: 80,
    color: '#7f1d1d',
    outline: '#0a0204',
    shape: 'cube',
  },
  lysate: {
    hp: 2000,
    damage: 18,
    speed: 26,
    radius: 64,
    xp: 90,
    color: '#9f1239',
    outline: '#350a14',
    shape: 'blob',
  },
  mirrorPlasmid: {
    hp: 1400,
    damage: 16,
    speed: 56,
    radius: 26,
    xp: 70,
    color: '#a855f7',
    outline: '#1e0d3a',
    shape: 'crystal',
  },
}

export function getTemplate(kind: EnemyKind): EnemyTemplate {
  return ENEMY_TEMPLATES[kind]
}

export function makeEnemy(id: number, kind: EnemyKind, pos: Vec2, hpMult = 1): Enemy {
  const t = getTemplate(kind)
  const enemy: Enemy = {
    id,
    kind,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    hp: t.hp * hpMult,
    maxHp: t.hp * hpMult,
    damage: t.damage,
    speed: t.speed,
    radius: t.radius,
    contactCooldown: 0,
    hitFlash: 0,
    knockback: { x: 0, y: 0 },
  }
  if (kind === 'endotoxin') {
    enemy.shootCooldown = 2.5 + rng() * 1.5
  }
  if (kind === 'tracker') {
    enemy.shootCooldown = 1.4 + rng() * 1.0
  }
  if (kind === 'lance') {
    enemy.bossPhase = 0 // 0 approach, 1 telegraph, 2 charge, 3 recover
    enemy.shootCooldown = 0
  }
  if (kind === 'denaturant') {
    enemy.splitInto = { kind: 'denaturantSpawn', count: 4 }
  }
  if (kind === 'prion') {
    enemy.isBoss = true
    enemy.bossPhase = 0
  }
  if (kind === 'lysate') {
    enemy.isBoss = true
    enemy.bossPhase = 0
    enemy.shootCooldown = 5
  }
  if (kind === 'mirrorPlasmid') {
    enemy.isBoss = true
    enemy.bossPhase = 0
    enemy.shootCooldown = 1.2
  }
  return enemy
}
