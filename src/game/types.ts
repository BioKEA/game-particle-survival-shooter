export type Vec2 = { x: number; y: number }

export type WeaponId =
  | 'pcr'
  | 'crispr'
  | 'centrifuge'
  | 'electrophoresis'
  | 'massSpec'
  | 'antibody'
  | 'cryoVial'
  // Evolutions
  | 'qpcr'
  | 'cas12a'
  | 'ultracentrifuge'
  | 'capillary'
  | 'tandemMs'
  | 'polyclonal'
  | 'liquidN2'

export type PassiveId =
  | 'stirBar'
  | 'labCoat'
  | 'catalyst'
  | 'buffer'
  | 'pipette'
  | 'centrifugalForce'

export type UpgradeId = WeaponId | PassiveId

export type Lineage = 'amplify' | 'contain' | 'edit'

export interface UpgradeMeta {
  id: UpgradeId
  kind: 'weapon' | 'passive'
  name: string
  short: string
  description: (level: number) => string
  maxLevel: number
  color: string
  lineage: Lineage
  isEvolution?: boolean
}

export interface WeaponState {
  id: WeaponId
  level: number
  cooldownLeft: number
  cooldownMax: number
}

export interface PassiveState {
  id: PassiveId
  level: number
}

export interface Player {
  pos: Vec2
  vel: Vec2
  hp: number
  maxHp: number
  speed: number
  damageMult: number
  cooldownMult: number
  pickupRadius: number
  projectileScale: number
  iframes: number
}

export interface Enemy {
  id: number
  kind: EnemyKind
  pos: Vec2
  vel: Vec2
  hp: number
  maxHp: number
  damage: number
  speed: number
  radius: number
  contactCooldown: number
  hitFlash: number
  knockback: Vec2
  // for shooters
  shootCooldown?: number
  // for splitters: leaves behind smaller enemies on death
  splitInto?: { kind: EnemyKind; count: number }
  // for boss
  isBoss?: boolean
  bossPhase?: number
}

export type EnemyKind =
  | 'bacteria'
  | 'plasmid'
  | 'denaturant'
  | 'denaturantSpawn'
  | 'radical'
  | 'mycoplasma'
  | 'endotoxin'
  | 'lance'
  | 'tracker'
  | 'prion'
  | 'lysate'
  | 'mirrorPlasmid'

export interface Projectile {
  id: number
  pos: Vec2
  vel: Vec2
  damage: number
  radius: number
  ttl: number
  pierce: number
  kind: WeaponId
  hits: Set<number>
  // for centrifuge orbit
  orbitAngle?: number
  orbitRadius?: number
  // for crispr homing
  targetId?: number
  // for mass spec rotating beam
  beamAngle?: number
  beamLength?: number
  // for electrophoresis sweeping band
  bandY?: number
  bandHeight?: number
  sweepDir?: number
}

export interface Pickup {
  id: number
  pos: Vec2
  kind: 'xp' | 'heal' | 'magnet' | 'bomb' | 'treasure'
  value: number
  radius: number
  bobOffset: number
  ttl?: number
}

export interface Hazard {
  id: number
  pos: Vec2
  radius: number
  ttl: number
  maxTtl: number
  pulsePhase: number
  damageInterval: number
}

export interface DamageNumber {
  pos: Vec2
  text: string
  ttl: number
  vy: number
  color: string
}

export interface Particle {
  pos: Vec2
  vel: Vec2
  ttl: number
  maxTtl: number
  color: string
  size: number
}

export type RunStatus = 'running' | 'levelup' | 'won' | 'lost'

export interface RunState {
  status: RunStatus
  time: number
  player: Player
  weapons: WeaponState[]
  passives: PassiveState[]
  enemies: Enemy[]
  projectiles: Projectile[]
  pickups: Pickup[]
  hazards: Hazard[]
  damageNumbers: DamageNumber[]
  particles: Particle[]
  xp: number
  level: number
  xpToNext: number
  kills: number
  pendingChoices: UpgradeId[]
  bossSpawned: boolean
  bossDefeated: boolean
  shake: number
  cameraOffset: Vec2
  // HUD-feeding state
  combo: number
  comboTimer: number
  comboPeak: number
  damageDir: { x: number; y: number } | null
  damageDirTimer: number
  input: {
    up: boolean
    down: boolean
    left: boolean
    right: boolean
    analog?: { x: number; y: number } | null
  }
  nextEntityId: number
  spawnTimer: number
  hitFlashGlobal: number
  // Anti-circle systems
  pathHistory: { pos: Vec2; t: number }[]
  pathSampleTimer: number
  hazardSpawnTimer: number
  treasureTimer: number
  // Lineage commitment perks — recomputed on every applyUpgrade.
  lineagePerks?: {
    amp3: boolean
    amp5: boolean
    con3: boolean
    con5: boolean
    edit3: boolean
    edit5: boolean
  }
  // Mode flags
  isBossArena?: boolean
  isEndless?: boolean
}

export type BossId = 'prion' | 'lysate' | 'mirrorPlasmid'

export interface MetaState {
  credits: number
  totalRuns: number
  bestTime: number
  wins: number
  unlockedSamples: SampleId[]
  activeSample: SampleId
  unlockedWeapons: WeaponId[]
  permUpgrades: {
    maxHp: number
    damage: number
    speed: number
    pickup: number
  }
  dailyRecords: Record<string, { time: number; level: number; kills: number; outcome: 'won' | 'lost' }>
  // Achievement IDs the player has unlocked
  achievements: string[]
  // Lineages where the player has ever reached Tier II (cross-run)
  tier2Reached: Lineage[]
  // Weapon evolution IDs the player has ever triggered (cross-run)
  evolutionsTriggered: WeaponId[]
  // Best time (seconds) the player has beaten each boss in Boss Mode
  bossRecords: Partial<Record<BossId, number>>
  // Best time survived in Endless mode (seconds beyond the boss kill)
  endlessRecord: number
  // Whether the first-run tutorial has been completed
  onboarded: boolean
}

export type SampleId = 'wildType' | 'plasmid' | 'stemCell' | 'taggedAb'

export interface SampleDef {
  id: SampleId
  name: string
  short: string
  description: string
  cost: number
  hpMod: number
  dmgMult: number
  speedMult: number
  pickupMult: number
  starterWeapon: WeaponId
  color: string
  shape: 'circle' | 'ring' | 'crystal' | 'square'
}

export interface EvolutionDef {
  id: WeaponId
  source: WeaponId
  requires: PassiveId
  name: string
  short: string
  description: string
  color: string
}
