import type {
  BossId,
  DamageNumber,
  Enemy,
  Hazard,
  MetaState,
  Particle,
  PassiveId,
  Projectile,
  RunState,
  UpgradeId,
  Vec2,
  WeaponId,
} from './types'
import { tickWeapons } from './weapons'
import { tickBossPhases, tickSpawner } from './waves'
import { audio } from './audio'
import { getSample } from './samples'
import { rng } from './rng'
import {
  ALL_PASSIVE_IDS,
  ALL_WEAPON_IDS,
  dominantLineage,
  EVOLUTIONS,
  getMeta,
  PASSIVE_META,
  WEAPON_META,
  type LineageScore,
} from './upgrades'
import type { Lineage } from './types'
import { getTemplate, makeEnemy } from './enemies'

// Slot caps — tight enough that you must commit to a path. With 7 total
// slots and a biased roll toward the dominant lineage, builds settle into a
// clear main + splash pattern rather than letting you collect everything.
const MAX_WEAPONS = 3
const MAX_PASSIVES = 4

interface BaseStats {
  hp: number
  dmg: number
  speed: number
  pickup: number
}

const STATE_BASE = new WeakMap<RunState, BaseStats>()
const STATE_META = new WeakMap<RunState, MetaState>()

export function createInitialState(
  meta: MetaState,
  opts?: { mode?: 'normal' | 'daily' | 'boss' | 'endless'; bossId?: BossId },
): RunState {
  const sample = getSample(meta.activeSample)
  const baseHp = 100 + meta.permUpgrades.maxHp * 10 + sample.hpMod
  const baseDmg = (1 + meta.permUpgrades.damage * 0.05) * sample.dmgMult
  const baseSpeed = 240 * (1 + meta.permUpgrades.speed * 0.04) * sample.speedMult
  const basePickup = 130 * (1 + meta.permUpgrades.pickup * 0.15) * sample.pickupMult

  const state: RunState = {
    status: 'running',
    time: 0,
    player: {
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      hp: baseHp,
      maxHp: baseHp,
      speed: baseSpeed,
      damageMult: baseDmg,
      cooldownMult: 1,
      pickupRadius: basePickup,
      projectileScale: 1,
      iframes: 0,
    },
    weapons: [{ id: sample.starterWeapon, level: 1, cooldownLeft: 0.4, cooldownMax: 1 }],
    passives: [],
    enemies: [],
    projectiles: [],
    pickups: [],
    hazards: [],
    damageNumbers: [],
    particles: [],
    xp: 0,
    level: 1,
    xpToNext: 5,
    kills: 0,
    pendingChoices: [],
    bossSpawned: false,
    bossDefeated: false,
    shake: 0,
    cameraOffset: { x: 0, y: 0 },
    input: { up: false, down: false, left: false, right: false },
    nextEntityId: 1,
    spawnTimer: 0,
    hitFlashGlobal: 0,
    combo: 0,
    comboTimer: 0,
    comboPeak: 0,
    damageDir: null,
    damageDirTimer: 0,
    pathHistory: [],
    pathSampleTimer: 0,
    hazardSpawnTimer: 0, // first hazard fires at t=30 (gated below)
    treasureTimer: 60, // first chest at 60s
    isBossArena: opts?.mode === 'boss',
    isEndless: opts?.mode === 'endless',
  }
  STATE_BASE.set(state, { hp: baseHp, dmg: baseDmg, speed: baseSpeed, pickup: basePickup })
  STATE_META.set(state, meta)

  if (opts?.mode === 'boss' && opts.bossId) {
    setupBossArena(state, opts.bossId)
  }

  return state
}

function setupBossArena(state: RunState, bossId: BossId) {
  // Pre-spawn the boss directly so the fight starts immediately.
  const ang = rng() * Math.PI * 2
  const dist = 480
  const boss = makeEnemy(state.nextEntityId++, bossId, {
    x: Math.cos(ang) * dist,
    y: Math.sin(ang) * dist,
  })
  // Boss arena bosses run hotter than the main-game prion
  if (bossId !== 'prion') {
    boss.hp *= 1.1
    boss.maxHp *= 1.1
  }
  state.enemies.push(boss)
  state.bossSpawned = true

  // Bring the player up to a workable mid-game baseline so the focus is the
  // fight, not the buildup. Their starter weapon levels up twice and they get
  // one synergy passive based on the active sample's lineage.
  const starter = state.weapons[0]
  if (starter) {
    starter.level = 3
  }
  // Pick a synergy passive based on starter weapon lineage
  const starterMeta = WEAPON_META[starter?.id]
  if (starterMeta) {
    const passiveByLineage: Record<string, PassiveId> = {
      amplify: 'buffer',
      contain: 'labCoat',
      edit: 'pipette',
    }
    const pid = passiveByLineage[starterMeta.lineage]
    if (pid) {
      state.passives.push({ id: pid, level: 2 })
    }
  }
  // Recompute stats now that we've added a passive
  // Note: mutating state directly via the engine's recomputeStats helper
  // requires access; instead just call the same logic inline.
  recomputeStats(state)
}

function xpForLevel(level: number): number {
  if (level === 1) return 5
  if (level === 2) return 9
  if (level === 3) return 14
  return 14 + (level - 3) * 7
}

export function update(state: RunState, dtRaw: number) {
  if (state.status !== 'running') return
  const dt = Math.min(dtRaw, 1 / 30)

  state.time += dt
  if (state.player.iframes > 0) state.player.iframes -= dt
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 4)
  if (state.hitFlashGlobal > 0) state.hitFlashGlobal -= dt * 2
  if (state.comboTimer > 0) {
    state.comboTimer -= dt
    if (state.comboTimer <= 0) state.combo = 0
  }
  if (state.damageDirTimer > 0) {
    state.damageDirTimer -= dt
    if (state.damageDirTimer <= 0) state.damageDir = null
  }

  movePlayer(state, dt)
  trackPathHistory(state, dt)
  tickWeapons(state, dt)
  tickSpawner(state, dt)
  tickBossPhases(state, dt)
  tickHazards(state, dt)
  tickTreasure(state, dt)
  moveEnemies(state, dt)
  moveProjectiles(state, dt)
  resolveCollisions(state, dt)
  movePickups(state, dt)
  tickDamageNumbers(state, dt)
  tickParticles(state, dt)
  cullDistant(state)

  if (state.bossDefeated && state.status === 'running') {
    state.status = 'won'
    audio.play('win')
  }
  if (state.player.hp <= 0 && state.status === 'running') {
    state.status = 'lost'
    audio.play('lose')
  }
}

function movePlayer(state: RunState, dt: number) {
  const i = state.input
  let dx: number
  let dy: number
  if (i.analog) {
    dx = i.analog.x
    dy = i.analog.y
    const m = Math.hypot(dx, dy)
    if (m > 1) {
      dx /= m
      dy /= m
    }
  } else {
    dx = (i.right ? 1 : 0) - (i.left ? 1 : 0)
    dy = (i.down ? 1 : 0) - (i.up ? 1 : 0)
    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2
      dx *= inv
      dy *= inv
    }
  }
  state.player.vel.x = dx * state.player.speed
  state.player.vel.y = dy * state.player.speed
  state.player.pos.x += state.player.vel.x * dt
  state.player.pos.y += state.player.vel.y * dt
}

function moveEnemies(state: RunState, dt: number) {
  const target = state.player.pos
  for (const e of state.enemies) {
    if (e.contactCooldown > 0) e.contactCooldown -= dt
    if (e.hitFlash > 0) e.hitFlash -= dt * 4

    const rawDx = target.x - e.pos.x
    const rawDy = target.y - e.pos.y
    const d = Math.hypot(rawDx, rawDy) || 1
    let dx = rawDx / d
    let dy = rawDy / d

    if (e.kind === 'radical') {
      const t = state.time * 4 + e.id
      const pdx = -dy
      const pdy = dx
      const wig = Math.sin(t) * 0.45
      dx += pdx * wig
      dy += pdy * wig
    }

    if (e.kind === 'lance') {
      tickLance(state, e, dx, dy, d, dt)
      continue
    }

    if (e.kind === 'tracker') {
      tickTracker(state, e, dx, dy, d, dt)
      continue
    }

    e.pos.x += dx * e.speed * dt + e.knockback.x * dt
    e.pos.y += dy * e.speed * dt + e.knockback.y * dt

    e.knockback.x *= Math.pow(0.0001, dt)
    e.knockback.y *= Math.pow(0.0001, dt)

    if (e.kind === 'endotoxin') {
      e.shootCooldown = (e.shootCooldown ?? 3) - dt
      if (e.shootCooldown <= 0 && d < 700) {
        e.shootCooldown = 3 + rng() * 1.5
        const speed = 220
        const proj: Projectile = {
          id: state.nextEntityId++,
          pos: { ...e.pos },
          vel: { x: dx * speed, y: dy * speed },
          damage: e.damage * 0.6,
          radius: 6,
          ttl: 4,
          pierce: 0,
          kind: 'pcr',
          hits: new Set(),
        }
        ;(proj as Projectile & { enemyShot: true }).enemyShot = true
        state.projectiles.push(proj)
      }
    }
  }
}

function tickLance(_state: RunState, e: Enemy, dx: number, dy: number, d: number, dt: number) {
  // Phase 0 approach, 1 telegraph, 2 charge, 3 recover
  e.shootCooldown = (e.shootCooldown ?? 0) - dt
  e.knockback.x *= Math.pow(0.0001, dt)
  e.knockback.y *= Math.pow(0.0001, dt)

  if (e.bossPhase === 0) {
    e.pos.x += dx * e.speed * dt + e.knockback.x * dt
    e.pos.y += dy * e.speed * dt + e.knockback.y * dt
    if (d < 240) {
      e.bossPhase = 1
      e.shootCooldown = 0.8 // telegraph duration
      // lock direction
      e.vel.x = dx
      e.vel.y = dy
    }
  } else if (e.bossPhase === 1) {
    // telegraph: stop moving
    if ((e.shootCooldown ?? 0) <= 0) {
      e.bossPhase = 2
      e.shootCooldown = 0.45 // charge duration
    }
  } else if (e.bossPhase === 2) {
    // charge along locked direction
    const chargeSpeed = 760
    e.pos.x += e.vel.x * chargeSpeed * dt
    e.pos.y += e.vel.y * chargeSpeed * dt
    if ((e.shootCooldown ?? 0) <= 0) {
      e.bossPhase = 3
      e.shootCooldown = 1.4 // recover duration
    }
  } else {
    // recover: shuffle slowly
    e.pos.x += dx * (e.speed * 0.4) * dt
    e.pos.y += dy * (e.speed * 0.4) * dt
    if ((e.shootCooldown ?? 0) <= 0) {
      e.bossPhase = 0
    }
  }
}

function tickTracker(state: RunState, e: Enemy, dx: number, dy: number, d: number, dt: number) {
  // Maintain ~360px range from player
  const ideal = 360
  const margin = 40
  let moveX = 0
  let moveY = 0
  if (d < ideal - margin) {
    moveX = -dx
    moveY = -dy
  } else if (d > ideal + margin) {
    moveX = dx
    moveY = dy
  } else {
    // strafe perpendicular
    moveX = -dy * 0.6
    moveY = dx * 0.6
  }
  e.pos.x += moveX * e.speed * dt + e.knockback.x * dt
  e.pos.y += moveY * e.speed * dt + e.knockback.y * dt
  e.knockback.x *= Math.pow(0.0001, dt)
  e.knockback.y *= Math.pow(0.0001, dt)

  e.shootCooldown = (e.shootCooldown ?? 1.5) - dt
  if (e.shootCooldown <= 0 && d < 800) {
    e.shootCooldown = 1.6 + rng() * 0.6
    // Predictive aim: where the player will be in ~0.5s
    const lead = 0.5
    const aimX = state.player.pos.x + state.player.vel.x * lead
    const aimY = state.player.pos.y + state.player.vel.y * lead
    let ax = aimX - e.pos.x
    let ay = aimY - e.pos.y
    const am = Math.hypot(ax, ay) || 1
    ax /= am
    ay /= am
    const speed = 320
    const proj: Projectile = {
      id: state.nextEntityId++,
      pos: { ...e.pos },
      vel: { x: ax * speed, y: ay * speed },
      damage: e.damage * 0.7,
      radius: 5,
      ttl: 3,
      pierce: 0,
      kind: 'pcr',
      hits: new Set(),
    }
    ;(proj as Projectile & { enemyShot: true }).enemyShot = true
    state.projectiles.push(proj)
  }
}

function trackPathHistory(state: RunState, dt: number) {
  state.pathSampleTimer -= dt
  if (state.pathSampleTimer > 0) return
  state.pathSampleTimer = 0.3
  state.pathHistory.push({ pos: { ...state.player.pos }, t: state.time })
  // Keep only recent ~16s of history
  while (state.pathHistory.length > 0 && state.time - state.pathHistory[0].t > 16) {
    state.pathHistory.shift()
  }
}

function tickHazards(state: RunState, dt: number) {
  const WARNING_DURATION = 1.0
  // Tick existing
  for (const h of state.hazards) {
    h.ttl -= dt
    h.pulsePhase += dt
    h.damageInterval -= dt
    // First WARNING_DURATION seconds the puddle is visible but harmless
    const isWarning = h.maxTtl - h.ttl < WARNING_DURATION
    if (isWarning) continue
    const dx = state.player.pos.x - h.pos.x
    const dy = state.player.pos.y - h.pos.y
    if (dx * dx + dy * dy < h.radius * h.radius) {
      if (h.damageInterval <= 0) {
        h.damageInterval = 0.5
        if (state.player.iframes <= 0) {
          // Contain x5: hazards do half damage
          const dmg = state.lineagePerks?.con5 ? 2 : 4
          state.player.hp -= dmg
          state.player.iframes = 0.12
          state.shake = Math.max(state.shake, 0.15)
          state.hitFlashGlobal = Math.max(state.hitFlashGlobal, 0.3)
          spawnDamageNumber(state, state.player.pos, dmg)
          audio.play('playerHit')
        }
      }
    }
  }
  state.hazards = state.hazards.filter((h) => h.ttl > 0)

  // Spawn from player path history once unlocked
  if (state.time < 30) return
  state.hazardSpawnTimer -= dt
  if (state.hazardSpawnTimer > 0) return
  if (state.hazards.length >= 6) {
    state.hazardSpawnTimer = 0.5
    return
  }
  // Cadence eases in, then ramps up
  const interval =
    state.time < 90 ? 11 : state.time < 180 ? 8 : state.time < 300 ? 6 : 4
  state.hazardSpawnTimer = interval

  // Pick a position from path history that's 4–10s old
  const candidates = state.pathHistory.filter((p) => {
    const age = state.time - p.t
    return age >= 4 && age <= 10
  })
  if (candidates.length === 0) return
  const sample = candidates[Math.floor(rng() * candidates.length)]
  const ang = rng() * Math.PI * 2
  const off = 20
  state.hazards.push({
    id: state.nextEntityId++,
    pos: {
      x: sample.pos.x + Math.cos(ang) * off,
      y: sample.pos.y + Math.sin(ang) * off,
    },
    radius: 55 + rng() * 15,
    ttl: 9,
    maxTtl: 9,
    pulsePhase: 0,
    damageInterval: 0,
  })
}

function tickTreasure(state: RunState, dt: number) {
  if (state.bossSpawned) return
  state.treasureTimer -= dt
  if (state.treasureTimer > 0) return
  state.treasureTimer = 90 // every 90s
  // Don't pile up
  if (state.pickups.find((p) => p.kind === 'treasure')) return

  const ang = rng() * Math.PI * 2
  const dist = 700
  state.pickups.push({
    id: state.nextEntityId++,
    pos: {
      x: state.player.pos.x + Math.cos(ang) * dist,
      y: state.player.pos.y + Math.sin(ang) * dist,
    },
    kind: 'treasure',
    value: 1,
    radius: 14,
    bobOffset: rng() * Math.PI * 2,
    ttl: 35,
  })
}

function moveProjectiles(state: RunState, dt: number) {
  for (const p of state.projectiles) {
    p.ttl -= dt
    if (p.kind === 'centrifuge' || p.kind === 'ultracentrifuge') {
      const spin = p.kind === 'ultracentrifuge' ? 4.2 : 3.2
      p.orbitAngle = (p.orbitAngle ?? 0) + dt * spin
      p.pos.x = state.player.pos.x + Math.cos(p.orbitAngle) * (p.orbitRadius ?? 60)
      p.pos.y = state.player.pos.y + Math.sin(p.orbitAngle) * (p.orbitRadius ?? 60)
      if (Math.random() < dt * 2.4) p.hits.clear()
    } else if (p.kind === 'massSpec' || p.kind === 'tandemMs') {
      p.beamAngle = (p.beamAngle ?? 0) + dt * (p.kind === 'tandemMs' ? 1.7 : 1.4)
      p.pos.x = state.player.pos.x
      p.pos.y = state.player.pos.y
    } else if (
      p.kind === 'crispr' ||
      p.kind === 'antibody' ||
      p.kind === 'cas12a' ||
      p.kind === 'polyclonal' ||
      p.kind === 'qpcr'
    ) {
      const target = p.targetId
        ? state.enemies.find((e) => e.id === p.targetId)
        : nearestEnemyTo(state, p.pos, 600)
      if (target) {
        const ax = target.pos.x - p.pos.x
        const ay = target.pos.y - p.pos.y
        const d = Math.hypot(ax, ay) || 1
        const baseTurn =
          p.kind === 'cas12a'
            ? 9
            : p.kind === 'crispr'
              ? 6
              : p.kind === 'polyclonal'
                ? 7
                : p.kind === 'qpcr'
                  ? 1.4
                  : 4
        // Edit x5: homing turn rate boosted (lock-on doesn't break)
        const turn = state.lineagePerks?.edit5 ? baseTurn * 1.6 : baseTurn
        const speed = Math.hypot(p.vel.x, p.vel.y) || 280
        const desiredVx = (ax / d) * speed
        const desiredVy = (ay / d) * speed
        p.vel.x += (desiredVx - p.vel.x) * Math.min(1, turn * dt)
        p.vel.y += (desiredVy - p.vel.y) * Math.min(1, turn * dt)
        p.targetId = target.id
      } else {
        p.targetId = undefined
      }
      p.pos.x += p.vel.x * dt
      p.pos.y += p.vel.y * dt
    } else {
      p.pos.x += p.vel.x * dt
      p.pos.y += p.vel.y * dt
    }
  }
  state.projectiles = state.projectiles.filter((p) => p.ttl > 0 && p.pierce >= 0)
}

function nearestEnemyTo(state: RunState, from: Vec2, max = 600): Enemy | undefined {
  let best: Enemy | undefined
  let bestD = max * max
  for (const e of state.enemies) {
    const dx = e.pos.x - from.x
    const dy = e.pos.y - from.y
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      best = e
    }
  }
  return best
}

function resolveCollisions(state: RunState, dt: number) {
  for (const p of state.projectiles) {
    const isEnemyShot = (p as Projectile & { enemyShot?: boolean }).enemyShot
    if (isEnemyShot) {
      const dx = state.player.pos.x - p.pos.x
      const dy = state.player.pos.y - p.pos.y
      if (dx * dx + dy * dy < (p.radius + 12) * (p.radius + 12)) {
        if (state.player.iframes <= 0) {
          state.player.hp -= p.damage
          state.player.iframes = 0.4
          state.shake = Math.max(state.shake, 0.3)
          state.hitFlashGlobal = 1
          audio.play('playerHit')
          // Damage direction = from projectile origin toward player
          const dnorm = Math.hypot(-dx, -dy) || 1
          state.damageDir = { x: -dx / dnorm, y: -dy / dnorm }
          state.damageDirTimer = 0.8
          state.combo = 0
          state.comboTimer = 0
        }
        p.ttl = 0
      }
      continue
    }

    if (p.kind === 'massSpec' || p.kind === 'tandemMs') {
      const ang = p.beamAngle ?? 0
      const len = p.beamLength ?? 200
      const ex = state.player.pos.x + Math.cos(ang) * len
      const ey = state.player.pos.y + Math.sin(ang) * len
      const dmgRate = p.kind === 'tandemMs' ? 8 : 6
      for (const e of state.enemies) {
        if (p.hits.has(e.id)) continue
        const close = pointToSegmentDist(e.pos, state.player.pos, { x: ex, y: ey })
        if (close < e.radius + 8) {
          damageEnemy(state, e, p.damage * dt * dmgRate, ang)
          p.hits.add(e.id)
        }
      }
      if (Math.random() < dt * 8) p.hits.clear()
      continue
    }

    if (p.kind === 'electrophoresis' || p.kind === 'capillary') {
      const dir = p.sweepDir
      for (const e of state.enemies) {
        if (p.hits.has(e.id)) continue
        if (dir === 1) {
          if (Math.abs(e.pos.y - p.pos.y) < (p.bandHeight ?? 90) / 2 && e.pos.x < p.pos.x + 30) {
            damageEnemy(state, e, p.damage, 0)
            p.hits.add(e.id)
          }
        } else if (dir === 2) {
          if (Math.abs(e.pos.x - p.pos.x) < (p.bandHeight ?? 90) / 2 && e.pos.y < p.pos.y + 30) {
            damageEnemy(state, e, p.damage, Math.PI / 2)
            p.hits.add(e.id)
          }
        }
      }
      continue
    }

    if (p.kind === 'cryoVial' || p.kind === 'liquidN2') {
      for (const e of state.enemies) {
        if (p.hits.has(e.id)) continue
        const dx = e.pos.x - p.pos.x
        const dy = e.pos.y - p.pos.y
        if (dx * dx + dy * dy < p.radius * p.radius) {
          damageEnemy(state, e, p.damage, Math.atan2(dy, dx))
          p.hits.add(e.id)
          e.knockback.x *= p.kind === 'liquidN2' ? 0.1 : 0.3
          e.knockback.y *= p.kind === 'liquidN2' ? 0.1 : 0.3
        }
      }
      continue
    }

    for (const e of state.enemies) {
      if (p.pierce < 0) break
      if (p.hits.has(e.id)) continue
      const dx = e.pos.x - p.pos.x
      const dy = e.pos.y - p.pos.y
      const r = e.radius + p.radius
      if (dx * dx + dy * dy < r * r) {
        const ang = Math.atan2(dy, dx)
        damageEnemy(state, e, p.damage, ang)
        p.hits.add(e.id)
        p.pierce -= 1
        spawnHitParticle(state, e.pos, weaponColor(p.kind))
      }
    }
  }
  state.projectiles = state.projectiles.filter((p) => p.pierce >= 0 && p.ttl > 0)

  if (state.player.iframes <= 0) {
    for (const e of state.enemies) {
      if (e.contactCooldown > 0) continue
      const dx = e.pos.x - state.player.pos.x
      const dy = e.pos.y - state.player.pos.y
      const r = e.radius + 12
      if (dx * dx + dy * dy < r * r) {
        state.player.hp -= e.damage
        state.player.iframes = 0.5
        e.contactCooldown = 0.6
        state.shake = Math.max(state.shake, 0.25)
        state.hitFlashGlobal = 0.8
        audio.play('playerHit')
        const dnorm = Math.hypot(dx, dy) || 1
        state.damageDir = { x: dx / dnorm, y: dy / dnorm }
        state.damageDirTimer = 0.8
        state.combo = 0
        state.comboTimer = 0
        break
      }
    }
  }
}

function weaponColor(kind: WeaponId): string {
  return WEAPON_META[kind]?.color ?? '#ffffff'
}

function pointToSegmentDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  return Math.hypot(p.x - cx, p.y - cy)
}

function damageEnemy(state: RunState, e: Enemy, dmg: number, fromAngle: number) {
  e.hp -= dmg
  e.hitFlash = 1
  e.knockback.x += Math.cos(fromAngle) * 60
  e.knockback.y += Math.sin(fromAngle) * 60
  spawnDamageNumber(state, e.pos, Math.round(dmg))
  audio.play('hit')
  if (e.hp <= 0) killEnemy(state, e)
}

function killEnemy(state: RunState, e: Enemy) {
  state.kills += 1
  state.combo += 1
  state.comboTimer = 2.0
  if (state.combo > state.comboPeak) state.comboPeak = state.combo
  state.enemies = state.enemies.filter((x) => x !== e)
  audio.play('kill')
  const t = getTemplate(e.kind)
  state.pickups.push({
    id: state.nextEntityId++,
    pos: { x: e.pos.x, y: e.pos.y },
    kind: 'xp',
    value: t.xp,
    radius: 8,
    bobOffset: Math.random() * Math.PI * 2,
  })
  if (!e.isBoss && rng() < 0.012) {
    state.pickups.push({
      id: state.nextEntityId++,
      pos: { x: e.pos.x + 12, y: e.pos.y },
      kind: 'heal',
      value: 20,
      radius: 10,
      bobOffset: Math.random() * Math.PI * 2,
    })
  }
  if (!e.isBoss && rng() < 0.006) {
    state.pickups.push({
      id: state.nextEntityId++,
      pos: { x: e.pos.x - 12, y: e.pos.y },
      kind: 'magnet',
      value: 1,
      radius: 10,
      bobOffset: Math.random() * Math.PI * 2,
    })
  }
  if (e.splitInto) {
    for (let i = 0; i < e.splitInto.count; i++) {
      const ang = (i / e.splitInto.count) * Math.PI * 2 + rng() * 0.4
      const dist = 18
      const child = makeEnemy(state.nextEntityId++, e.splitInto.kind, {
        x: e.pos.x + Math.cos(ang) * dist,
        y: e.pos.y + Math.sin(ang) * dist,
      })
      child.knockback.x = Math.cos(ang) * 200
      child.knockback.y = Math.sin(ang) * 200
      state.enemies.push(child)
    }
  }
  for (let i = 0; i < (e.isBoss ? 60 : 6); i++) {
    const ang = Math.random() * Math.PI * 2
    const sp = 80 + Math.random() * 200
    state.particles.push({
      pos: { x: e.pos.x, y: e.pos.y },
      vel: { x: Math.cos(ang) * sp, y: Math.sin(ang) * sp },
      ttl: 0.4 + Math.random() * 0.4,
      maxTtl: 0.6,
      color: t.color,
      size: 2 + Math.random() * 3,
    })
  }
  if (e.isBoss) {
    state.bossDefeated = true
    state.shake = 1.5
  }
}

function spawnHitParticle(state: RunState, pos: Vec2, color: string) {
  for (let i = 0; i < 2; i++) {
    const ang = Math.random() * Math.PI * 2
    const sp = 60 + Math.random() * 80
    state.particles.push({
      pos: { x: pos.x, y: pos.y },
      vel: { x: Math.cos(ang) * sp, y: Math.sin(ang) * sp },
      ttl: 0.25,
      maxTtl: 0.25,
      color,
      size: 1.5 + Math.random() * 1.5,
    })
  }
}

function spawnDamageNumber(state: RunState, pos: Vec2, amount: number) {
  if (state.damageNumbers.length > 70) return
  const dn: DamageNumber = {
    pos: { x: pos.x + (Math.random() - 0.5) * 14, y: pos.y - 10 },
    text: String(amount),
    ttl: 0.6,
    vy: -45,
    color: amount >= 50 ? '#fde68a' : '#eef2f6',
  }
  state.damageNumbers.push(dn)
}

function movePickups(state: RunState, dt: number) {
  for (const p of state.pickups) {
    if (p.value === -1) continue
    if (p.ttl !== undefined) {
      p.ttl -= dt
      if (p.ttl <= 0) {
        ;(p as { value: number }).value = -1
        continue
      }
    }
    const dx = state.player.pos.x - p.pos.x
    const dy = state.player.pos.y - p.pos.y
    const d = Math.hypot(dx, dy)
    // Treasure isn't magnetized — player must come to it
    if (p.kind !== 'treasure' && d < state.player.pickupRadius) {
      const pull = 280 + (1 - d / state.player.pickupRadius) * 720
      const nx = dx / (d || 1)
      const ny = dy / (d || 1)
      p.pos.x += nx * pull * dt
      p.pos.y += ny * pull * dt
    }
    const collectRange = p.kind === 'treasure' ? 28 : 20
    if (d < collectRange) {
      collectPickup(state, p)
    }
  }
  state.pickups = state.pickups.filter((p) => p.value !== -1)
}

function collectPickup(
  state: RunState,
  p: { kind: 'xp' | 'heal' | 'magnet' | 'bomb' | 'treasure'; value: number },
) {
  if (p.kind === 'xp') {
    addXp(state, p.value)
    audio.play('pickup')
  } else if (p.kind === 'heal') {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + p.value)
    audio.play('heal')
  } else if (p.kind === 'magnet') {
    for (const x of state.pickups) {
      if (x.kind === 'xp') {
        x.pos.x = state.player.pos.x
        x.pos.y = state.player.pos.y
      }
    }
    audio.play('heal')
  } else if (p.kind === 'treasure') {
    // Big XP burst — almost guaranteed level-up
    addXp(state, 25)
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 15)
    audio.play('levelUp')
    state.shake = 0.6
    // Sparkle particles
    for (let i = 0; i < 30; i++) {
      const ang = rng() * Math.PI * 2
      const sp = 80 + rng() * 220
      state.particles.push({
        pos: { x: state.player.pos.x, y: state.player.pos.y },
        vel: { x: Math.cos(ang) * sp, y: Math.sin(ang) * sp },
        ttl: 0.5 + rng() * 0.5,
        maxTtl: 0.8,
        color: '#fbbf24',
        size: 2 + rng() * 2,
      })
    }
  }
  ;(p as { value: number }).value = -1
}

export function addXp(state: RunState, amount: number) {
  state.xp += amount
  while (state.xp >= state.xpToNext) {
    state.xp -= state.xpToNext
    state.level += 1
    state.xpToNext = xpForLevel(state.level)
    queueLevelUp(state)
  }
}

function queueLevelUp(state: RunState) {
  const choices = generateChoices(state, 3)
  if (choices.length === 0) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 20)
    return
  }
  state.pendingChoices = choices
  state.status = 'levelup'
  audio.play('levelUp')
}

export function getLineageScores(state: RunState): LineageScore {
  const scores: LineageScore = { amplify: 0, contain: 0, edit: 0 }
  for (const w of state.weapons) {
    const m = WEAPON_META[w.id]
    if (m) scores[m.lineage] += 1
  }
  for (const p of state.passives) {
    const m = PASSIVE_META[p.id]
    if (m) scores[m.lineage] += 1
  }
  return scores
}

function weightedDistinctPick(
  pool: { id: UpgradeId; weight: number }[],
  count: number,
): UpgradeId[] {
  const remaining = pool.slice()
  const out: UpgradeId[] = []
  while (out.length < count && remaining.length > 0) {
    let total = 0
    for (const e of remaining) total += e.weight
    if (total <= 0) break
    let r = rng() * total
    let pickIdx = 0
    for (let i = 0; i < remaining.length; i++) {
      r -= remaining[i].weight
      if (r <= 0) {
        pickIdx = i
        break
      }
    }
    out.push(remaining[pickIdx].id)
    remaining.splice(pickIdx, 1)
  }
  return out
}

function generateChoices(state: RunState, count: number): UpgradeId[] {
  const owned = new Set<string>([
    ...state.weapons.map((w) => w.id),
    ...state.passives.map((p) => p.id),
  ])
  const meta = STATE_META.get(state)
  const unlocked = new Set<string>(meta?.unlockedWeapons ?? ['pcr'])

  // Evolutions take priority — surface them as soon as prereqs are met
  const evoChoices: UpgradeId[] = []
  for (const evo of EVOLUTIONS) {
    if (owned.has(evo.id)) continue
    const sourceWeapon = state.weapons.find((w) => w.id === evo.source)
    if (!sourceWeapon) continue
    const sourceMeta = WEAPON_META[evo.source]
    if (sourceWeapon.level < sourceMeta.maxLevel) continue
    if (!state.passives.find((p) => p.id === evo.requires)) continue
    evoChoices.push(evo.id)
  }

  // Build a tagged pool with weights. Existing items (level-up) weight higher
  // than NEW items, so the player isn't constantly offered new things to spread
  // across.
  const tagged: { id: UpgradeId; lineage: Lineage; weight: number }[] = []
  for (const w of state.weapons) {
    const m = WEAPON_META[w.id]
    if (m.isEvolution) continue
    if (w.level < m.maxLevel)
      tagged.push({ id: w.id, lineage: m.lineage, weight: 3 })
  }
  for (const p of state.passives) {
    const m = PASSIVE_META[p.id]
    if (p.level < m.maxLevel)
      tagged.push({ id: p.id, lineage: m.lineage, weight: 3 })
  }
  if (state.weapons.length < MAX_WEAPONS) {
    for (const id of ALL_WEAPON_IDS) {
      const m = WEAPON_META[id]
      if (m.isEvolution) continue
      if (!owned.has(id) && unlocked.has(id))
        tagged.push({ id, lineage: m.lineage, weight: 1.4 })
    }
  }
  if (state.passives.length < MAX_PASSIVES) {
    for (const id of ALL_PASSIVE_IDS) {
      const m = PASSIVE_META[id]
      if (!owned.has(id)) tagged.push({ id, lineage: m.lineage, weight: 1.4 })
    }
  }

  // Lineage bias: dominant lineage weighted up, off-lineage with zero presence
  // weighted way down. Once you've committed to a path, the rolls protect that
  // commitment instead of fighting it.
  const scores = getLineageScores(state)
  const dominant = dominantLineage(scores)
  const total = scores.amplify + scores.contain + scores.edit
  const weighted: { id: UpgradeId; weight: number }[] = []
  // Bias kicks in as soon as the player has any commitment — your starter
  // weapon matters from level 2 onward.
  for (const e of tagged) {
    let w = e.weight
    if (dominant && total >= 1) {
      if (e.lineage === dominant) w *= 2.0
      else if (scores[e.lineage] === 0) w *= 0.55
      else w *= 0.9
    }
    weighted.push({ id: e.id, weight: w })
  }

  const out: UpgradeId[] = [...evoChoices]
  const remainingCount = Math.max(0, count - out.length)
  if (remainingCount > 0) {
    const picks = weightedDistinctPick(weighted, remainingCount)
    for (const id of picks) {
      if (!out.includes(id)) out.push(id)
    }
  }
  return out.slice(0, count)
}

export function applyUpgrade(state: RunState, id: UpgradeId) {
  const meta = getMeta(id)
  if (!meta) return
  if (meta.kind === 'weapon') {
    const wid = id as WeaponId
    // Evolution: replace source weapon
    if (meta.isEvolution) {
      const evo = EVOLUTIONS.find((e) => e.id === wid)
      if (evo) {
        state.weapons = state.weapons.filter((w) => w.id !== evo.source)
      }
      state.weapons.push({ id: wid, level: 1, cooldownLeft: 0.2, cooldownMax: 1 })
    } else {
      const existing = state.weapons.find((w) => w.id === wid)
      if (existing) existing.level += 1
      else state.weapons.push({ id: wid, level: 1, cooldownLeft: 0.3, cooldownMax: 1 })
    }
  } else {
    const pid = id as PassiveId
    const existing = state.passives.find((p) => p.id === pid)
    if (existing) existing.level += 1
    else state.passives.push({ id: pid, level: 1 })
  }
  // Recompute on every pick — lineage scores affect bonuses, weapon picks
  // count toward those scores.
  recomputeStats(state)
  state.pendingChoices = []
  state.status = 'running'
}

function recomputeStats(state: RunState) {
  const base = STATE_BASE.get(state)
  if (!base) return
  const lvl = (id: PassiveId) => state.passives.find((p) => p.id === id)?.level ?? 0

  // Lineage commitment tiers. Tier I = 3 items, Tier II = 4 items. The max
  // non-evolution items per lineage is 4 (or 5 for Contain), so Tier II is
  // achievable for every path with strong commitment.
  const scores = getLineageScores(state)
  const amp3 = scores.amplify >= 3
  const con3 = scores.contain >= 3
  const edit3 = scores.edit >= 3
  const amp5 = scores.amplify >= 4
  const con5 = scores.contain >= 4
  const edit5 = scores.edit >= 4

  const oldMax = state.player.maxHp
  state.player.maxHp = base.hp + lvl('labCoat') * 20 + (con3 ? 30 : 0)
  state.player.hp += state.player.maxHp - oldMax

  state.player.cooldownMult = (1 - lvl('catalyst') * 0.1) * (amp5 ? 0.85 : 1)
  state.player.damageMult =
    base.dmg * (1 + lvl('buffer') * 0.15) * (amp3 ? 1.25 : 1)
  state.player.projectileScale = 1 + lvl('pipette') * 0.15
  state.player.speed =
    base.speed * (1 + lvl('centrifugalForce') * 0.08) * (edit3 ? 1.12 : 1)
  state.player.pickupRadius =
    base.pickup * (1 + lvl('stirBar') * 0.25) * (con3 ? 1.15 : 1)

  // Track perks the player has unlocked so other systems can react.
  // (See tickHazards for con5 hazardDamageMult, moveProjectiles for edit5.)
  state.lineagePerks = {
    amp3,
    amp5,
    con3,
    con5,
    edit3,
    edit5,
  }
}

function tickDamageNumbers(state: RunState, dt: number) {
  for (const dn of state.damageNumbers) {
    dn.pos.y += dn.vy * dt
    dn.vy += 60 * dt
    dn.ttl -= dt
  }
  state.damageNumbers = state.damageNumbers.filter((d) => d.ttl > 0)
}

function tickParticles(state: RunState, dt: number) {
  for (const p of state.particles) {
    p.pos.x += p.vel.x * dt
    p.pos.y += p.vel.y * dt
    p.vel.x *= Math.pow(0.001, dt)
    p.vel.y *= Math.pow(0.001, dt)
    p.ttl -= dt
  }
  state.particles = state.particles.filter((p) => p.ttl > 0)
  if (state.particles.length > 220) state.particles.length = 220
}

function cullDistant(state: RunState) {
  const cx = state.player.pos.x
  const cy = state.player.pos.y
  const limit = 1400
  state.enemies = state.enemies.filter((e) => {
    const dx = e.pos.x - cx
    const dy = e.pos.y - cy
    return dx * dx + dy * dy < limit * limit || e.isBoss
  })
  state.pickups = state.pickups.filter((p) => {
    if (p.kind === 'treasure') return true
    const dx = p.pos.x - cx
    const dy = p.pos.y - cy
    return dx * dx + dy * dy < limit * limit
  })
  state.projectiles = state.projectiles.filter((p) => {
    if (
      p.kind === 'centrifuge' ||
      p.kind === 'ultracentrifuge' ||
      p.kind === 'massSpec' ||
      p.kind === 'tandemMs'
    )
      return true
    const dx = p.pos.x - cx
    const dy = p.pos.y - cy
    return dx * dx + dy * dy < (limit + 200) * (limit + 200)
  })
}

// --- Rendering ---

export function render(ctx: CanvasRenderingContext2D, state: RunState, w: number, h: number) {
  ctx.fillStyle = '#0a1424'
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  const sk = state.shake
  const shakeX = sk > 0 ? (Math.random() - 0.5) * sk * 12 : 0
  const shakeY = sk > 0 ? (Math.random() - 0.5) * sk * 12 : 0

  const camX = state.player.pos.x - w / 2 + shakeX
  const camY = state.player.pos.y - h / 2 + shakeY
  ctx.translate(-camX, -camY)

  drawGrid(ctx, camX, camY, w, h)
  drawArenaGlow(ctx, state.player.pos)

  // Hazards under everything else
  for (const h of state.hazards) drawHazard(ctx, h, state.time)

  for (const p of state.pickups) drawPickup(ctx, p, state.time)

  for (const p of state.projectiles) {
    if (p.kind === 'massSpec' || p.kind === 'tandemMs') drawMassSpec(ctx, p, state.player.pos)
    if (p.kind === 'electrophoresis' || p.kind === 'capillary') drawElectrophoresis(ctx, p)
    if (p.kind === 'cryoVial' || p.kind === 'liquidN2') drawCryoVial(ctx, p)
  }

  for (const e of state.enemies) drawEnemy(ctx, e)
  for (const p of state.particles) drawParticle(ctx, p)

  for (const p of state.projectiles) {
    if (
      p.kind === 'pcr' ||
      p.kind === 'qpcr' ||
      p.kind === 'crispr' ||
      p.kind === 'cas12a' ||
      p.kind === 'centrifuge' ||
      p.kind === 'ultracentrifuge' ||
      p.kind === 'antibody' ||
      p.kind === 'polyclonal'
    )
      drawProjectile(ctx, p)
  }

  drawPlayer(ctx, state)

  for (const dn of state.damageNumbers) {
    ctx.globalAlpha = Math.max(0, Math.min(1, dn.ttl / 0.6))
    ctx.fillStyle = dn.color
    ctx.font = '600 11px JetBrains Mono, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(dn.text, dn.pos.x, dn.pos.y)
    ctx.globalAlpha = 1
  }

  ctx.restore()

  // Treasure off-screen indicator (screen-space)
  for (const p of state.pickups) {
    if (p.kind !== 'treasure' || p.value === -1) continue
    const sx = p.pos.x - camX
    const sy = p.pos.y - camY
    const margin = 60
    const onScreen = sx > margin && sx < w - margin && sy > margin && sy < h - margin
    if (onScreen) continue
    const cx2 = w / 2
    const cy2 = h / 2
    const dx = sx - cx2
    const dy = sy - cy2
    const ang = Math.atan2(dy, dx)
    // Project onto screen-edge minus margin
    const halfW = w / 2 - 32
    const halfH = h / 2 - 32
    const tX = Math.tan(ang)
    let ix = halfW
    let iy = halfW * Math.tan(ang)
    if (Math.abs(iy) > halfH) {
      iy = halfH * Math.sign(dy)
      ix = halfH / tX
      if (Math.sign(ix) !== Math.sign(dx)) ix = -ix
    } else if (Math.sign(ix) !== Math.sign(dx)) {
      ix = -ix
      iy = -iy
    }
    const px = cx2 + ix
    const py = cy2 + iy
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(ang)
    // Diamond marker
    ctx.fillStyle = 'rgba(251,191,36,0.95)'
    ctx.beginPath()
    ctx.moveTo(14, 0)
    ctx.lineTo(0, 8)
    ctx.lineTo(-6, 0)
    ctx.lineTo(0, -8)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#0a1424'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.rotate(-ang)
    ctx.font = '600 9px JetBrains Mono, monospace'
    ctx.fillStyle = 'rgba(251,191,36,0.85)'
    ctx.textAlign = 'center'
    ctx.fillText('CHEST', 0, 24)
    ctx.restore()
  }

  if (state.hitFlashGlobal > 0) {
    ctx.fillStyle = `rgba(255,77,109,${0.18 * state.hitFlashGlobal})`
    ctx.fillRect(0, 0, w, h)
  }

  if (state.player.iframes > 0) {
    const grad = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.3,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.7,
    )
    grad.addColorStop(0, 'rgba(255,77,109,0)')
    grad.addColorStop(1, `rgba(255,77,109,${0.5 * state.player.iframes})`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number) {
  ctx.save()
  const step = 48
  const startX = Math.floor(camX / step) * step
  const startY = Math.floor(camY / step) * step
  ctx.strokeStyle = 'rgba(40,100,255,0.07)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = startX; x < camX + w + step; x += step) {
    ctx.moveTo(x, camY)
    ctx.lineTo(x, camY + h)
  }
  for (let y = startY; y < camY + h + step; y += step) {
    ctx.moveTo(camX, y)
    ctx.lineTo(camX + w, y)
  }
  ctx.stroke()
  ctx.strokeStyle = 'rgba(40,100,255,0.14)'
  ctx.beginPath()
  const major = step * 4
  const mx = Math.floor(camX / major) * major
  const my = Math.floor(camY / major) * major
  for (let x = mx; x < camX + w + major; x += major) {
    ctx.moveTo(x, camY)
    ctx.lineTo(x, camY + h)
  }
  for (let y = my; y < camY + h + major; y += major) {
    ctx.moveTo(camX, y)
    ctx.lineTo(camX + w, y)
  }
  ctx.stroke()
  ctx.restore()
}

function drawArenaGlow(ctx: CanvasRenderingContext2D, p: Vec2) {
  const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 360)
  grad.addColorStop(0, 'rgba(40,100,255,0.10)')
  grad.addColorStop(1, 'rgba(40,100,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(p.x - 360, p.y - 360, 720, 720)
}

function drawPlayer(ctx: CanvasRenderingContext2D, state: RunState) {
  const p = state.player.pos
  const t = state.time
  const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 36)
  glow.addColorStop(0, 'rgba(74,130,255,0.55)')
  glow.addColorStop(1, 'rgba(74,130,255,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(p.x, p.y, 36, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = 'rgba(74,130,255,0.10)'
  ctx.lineWidth = 1
  ctx.setLineDash([3, 5])
  ctx.beginPath()
  ctx.arc(p.x, p.y, state.player.pickupRadius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.save()
  if (state.player.iframes > 0 && Math.floor(t * 22) % 2 === 0) ctx.globalAlpha = 0.4
  // Outer ring (dark)
  ctx.fillStyle = '#0a1424'
  ctx.beginPath()
  ctx.arc(p.x, p.y, 16, 0, Math.PI * 2)
  ctx.fill()
  // Body (cobalt)
  ctx.fillStyle = '#4a82ff'
  ctx.beginPath()
  ctx.arc(p.x, p.y, 14, 0, Math.PI * 2)
  ctx.fill()
  // Inner ring
  ctx.strokeStyle = '#eef2f6'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(p.x, p.y, 14, 0, Math.PI * 2)
  ctx.stroke()
  // Highlight
  ctx.fillStyle = '#bcd2ff'
  ctx.beginPath()
  ctx.arc(p.x - 4, p.y - 4, 5, 0, Math.PI * 2)
  ctx.fill()
  // Center dot
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(p.x, p.y, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawHazard(ctx: CanvasRenderingContext2D, h: Hazard, _t: number) {
  const WARNING = 1.0
  const isWarning = h.maxTtl - h.ttl < WARNING
  const fadeIn = Math.min(1, (h.maxTtl - h.ttl) / WARNING)
  const fadeOut = h.ttl < 1.5 ? h.ttl / 1.5 : 1
  const a = Math.min(fadeIn, fadeOut)
  const pulse = 0.85 + Math.sin(h.pulsePhase * 4) * 0.08
  ctx.save()

  if (isWarning) {
    // Pre-arming: yellow telegraph ring growing into place
    const grow = fadeIn
    ctx.strokeStyle = `rgba(251,191,36,${0.85 * a})`
    ctx.lineWidth = 2.5
    ctx.setLineDash([10, 6])
    ctx.lineDashOffset = -h.pulsePhase * 24
    ctx.beginPath()
    ctx.arc(h.pos.x, h.pos.y, h.radius * grow, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = `rgba(251,191,36,${0.08 * a})`
    ctx.beginPath()
    ctx.arc(h.pos.x, h.pos.y, h.radius * grow, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }

  // Active hazard
  ctx.strokeStyle = `rgba(255,77,109,${0.55 * a})`
  ctx.lineWidth = 2
  ctx.setLineDash([6, 5])
  ctx.lineDashOffset = -h.pulsePhase * 18
  ctx.beginPath()
  ctx.arc(h.pos.x, h.pos.y, h.radius * pulse, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  const grad = ctx.createRadialGradient(h.pos.x, h.pos.y, 0, h.pos.x, h.pos.y, h.radius)
  grad.addColorStop(0, `rgba(255,77,109,${0.32 * a})`)
  grad.addColorStop(0.7, `rgba(220,40,80,${0.22 * a})`)
  grad.addColorStop(1, `rgba(120,20,40,0)`)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(h.pos.x, h.pos.y, h.radius * pulse, 0, Math.PI * 2)
  ctx.fill()
  for (let i = 0; i < 3; i++) {
    const ang = (h.pulsePhase * 0.5 + i * 2.1) % (Math.PI * 2)
    const r = h.radius * 0.55
    const x = h.pos.x + Math.cos(ang) * r
    const y = h.pos.y + Math.sin(ang) * r
    ctx.fillStyle = `rgba(255,77,109,${0.6 * a})`
    ctx.beginPath()
    ctx.arc(x, y, 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
  const t = getTemplate(e.kind)
  ctx.save()
  ctx.fillStyle = e.hitFlash > 0.05 ? '#ffffff' : t.color

  if (t.shape === 'blob') {
    ctx.beginPath()
    ctx.arc(e.pos.x, e.pos.y, e.radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = t.outline
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath()
    ctx.arc(e.pos.x - e.radius * 0.3, e.pos.y - e.radius * 0.3, e.radius * 0.25, 0, Math.PI * 2)
    ctx.fill()
  } else if (t.shape === 'ring') {
    ctx.beginPath()
    ctx.arc(e.pos.x, e.pos.y, e.radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0a1424'
    ctx.beginPath()
    ctx.arc(e.pos.x, e.pos.y, e.radius * 0.45, 0, Math.PI * 2)
    ctx.fill()
  } else if (t.shape === 'spike') {
    ctx.beginPath()
    const r = e.radius
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const rr = i % 2 === 0 ? r : r * 0.5
      const x = e.pos.x + Math.cos(a) * rr
      const y = e.pos.y + Math.sin(a) * rr
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
  } else if (t.shape === 'crystal') {
    ctx.beginPath()
    const r = e.radius
    ctx.moveTo(e.pos.x, e.pos.y - r)
    ctx.lineTo(e.pos.x + r * 0.9, e.pos.y - r * 0.2)
    ctx.lineTo(e.pos.x + r * 0.6, e.pos.y + r)
    ctx.lineTo(e.pos.x - r * 0.6, e.pos.y + r)
    ctx.lineTo(e.pos.x - r * 0.9, e.pos.y - r * 0.2)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = t.outline
    ctx.lineWidth = 1.5
    ctx.stroke()
  } else if (t.shape === 'cube') {
    const r = e.radius
    const phase = Date.now() * 0.0015
    ctx.translate(e.pos.x, e.pos.y)
    ctx.rotate(phase)
    ctx.fillStyle = e.hitFlash > 0.05 ? '#ffffff' : t.color
    ctx.fillRect(-r, -r, r * 2, r * 2)
    ctx.strokeStyle = '#0a1424'
    ctx.lineWidth = 3
    ctx.strokeRect(-r, -r, r * 2, r * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fillRect(-r * 0.7, -r * 0.7, r * 0.5, r * 0.5)
    ctx.fillRect(r * 0.2, r * 0.2, r * 0.5, r * 0.5)
    ctx.rotate(-phase)
    ctx.translate(-e.pos.x, -e.pos.y)
  } else if (t.shape === 'arrow') {
    // Lance: arrowhead pointing in vel.x/vel.y direction (set during telegraph/charge)
    const r = e.radius
    let ang = Math.atan2(e.vel.y || 0, e.vel.x || 1)
    if ((e.vel.x === 0 && e.vel.y === 0) || e.bossPhase === 0 || e.bossPhase === 3) {
      // No locked direction — point at player roughly
      ang = Math.atan2(0, 1)
    }
    // Telegraph beam during phase 1
    if (e.bossPhase === 1) {
      const len = 540
      const ex = e.pos.x + e.vel.x * len
      const ey = e.pos.y + e.vel.y * len
      ctx.save()
      ctx.strokeStyle = 'rgba(255,77,109,0.35)'
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(e.pos.x, e.pos.y)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,77,109,0.9)'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 6])
      ctx.lineDashOffset = -Date.now() * 0.02
      ctx.beginPath()
      ctx.moveTo(e.pos.x, e.pos.y)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      ctx.restore()
    }
    // Trailing streak during charge
    if (e.bossPhase === 2) {
      const tx = e.pos.x - e.vel.x * 60
      const ty = e.pos.y - e.vel.y * 60
      ctx.strokeStyle = 'rgba(255,77,109,0.5)'
      ctx.lineWidth = r * 1.2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.lineTo(e.pos.x, e.pos.y)
      ctx.stroke()
    }
    ctx.translate(e.pos.x, e.pos.y)
    ctx.rotate(ang)
    ctx.fillStyle = e.hitFlash > 0.05 ? '#ffffff' : t.color
    ctx.beginPath()
    ctx.moveTo(r, 0)
    ctx.lineTo(-r * 0.7, r * 0.7)
    ctx.lineTo(-r * 0.3, 0)
    ctx.lineTo(-r * 0.7, -r * 0.7)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = t.outline
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.rotate(-ang)
    ctx.translate(-e.pos.x, -e.pos.y)
  } else if (t.shape === 'antenna') {
    // Tracker: ring with a rotating antenna
    const r = e.radius
    ctx.fillStyle = e.hitFlash > 0.05 ? '#ffffff' : t.color
    ctx.beginPath()
    ctx.arc(e.pos.x, e.pos.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0a1424'
    ctx.beginPath()
    ctx.arc(e.pos.x, e.pos.y, r * 0.45, 0, Math.PI * 2)
    ctx.fill()
    // Rotating antenna pointing toward predicted player
    const aimAng = Math.atan2(
      e.knockback.y * 0.0001 + (e.id % 7), // pseudo-rotation tied to id for variety
      e.knockback.x * 0.0001 + 1,
    )
    const phase = Date.now() * 0.004 + e.id
    const ax = e.pos.x + Math.cos(phase) * (r + 8)
    const ay = e.pos.y + Math.sin(phase) * (r + 8)
    ctx.strokeStyle = t.color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(e.pos.x, e.pos.y)
    ctx.lineTo(ax, ay)
    ctx.stroke()
    ctx.fillStyle = '#fde047'
    ctx.beginPath()
    ctx.arc(ax, ay, 2.2, 0, Math.PI * 2)
    ctx.fill()
    void aimAng
  }

  if (e.isBoss) {
    const w = 200
    const x = e.pos.x - w / 2
    const y = e.pos.y + e.radius + 16
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(x - 2, y - 2, w + 4, 8)
    ctx.fillStyle = '#ff4d6d'
    ctx.fillRect(x, y, w * (e.hp / e.maxHp), 4)
  }
  ctx.restore()
}

function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile) {
  const isEnemyShot = (p as Projectile & { enemyShot?: boolean }).enemyShot
  if (isEnemyShot) {
    ctx.fillStyle = '#ff4d6d'
    ctx.beginPath()
    ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  const color = weaponColor(p.kind)

  // motion tail for moving projectiles (not centrifuge orbiters)
  const speed = Math.hypot(p.vel.x, p.vel.y)
  if (speed > 50 && p.kind !== 'centrifuge') {
    const nx = p.vel.x / speed
    const ny = p.vel.y / speed
    const tailLen = Math.min(28, speed * 0.04)
    const grad2 = ctx.createLinearGradient(
      p.pos.x,
      p.pos.y,
      p.pos.x - nx * tailLen,
      p.pos.y - ny * tailLen,
    )
    grad2.addColorStop(0, hexAlpha(color, 0.65))
    grad2.addColorStop(1, hexAlpha(color, 0))
    ctx.strokeStyle = grad2
    ctx.lineWidth = p.radius * 1.6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(p.pos.x, p.pos.y)
    ctx.lineTo(p.pos.x - nx * tailLen, p.pos.y - ny * tailLen)
    ctx.stroke()
  }

  const glow = ctx.createRadialGradient(p.pos.x, p.pos.y, 0, p.pos.x, p.pos.y, p.radius * 2.6)
  glow.addColorStop(0, hexAlpha(color, 0.55))
  glow.addColorStop(1, hexAlpha(color, 0))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(p.pos.x, p.pos.y, p.radius * 2.6, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(p.pos.x - p.radius * 0.3, p.pos.y - p.radius * 0.3, p.radius * 0.35, 0, Math.PI * 2)
  ctx.fill()
}

function drawMassSpec(ctx: CanvasRenderingContext2D, p: Projectile, origin: Vec2) {
  const ang = p.beamAngle ?? 0
  const len = p.beamLength ?? 200
  const ex = origin.x + Math.cos(ang) * len
  const ey = origin.y + Math.sin(ang) * len
  ctx.save()
  ctx.strokeStyle = 'rgba(244,114,182,0.16)'
  ctx.lineWidth = 18
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(origin.x, origin.y)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  ctx.strokeStyle = '#f472b6'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(origin.x, origin.y)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(origin.x, origin.y)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  ctx.restore()
}

function drawElectrophoresis(ctx: CanvasRenderingContext2D, p: Projectile) {
  const dir = p.sweepDir
  const h = p.bandHeight ?? 90
  ctx.save()
  ctx.fillStyle = 'rgba(52,211,153,0.18)'
  ctx.strokeStyle = '#34d399'
  ctx.lineWidth = 2
  if (dir === 1) {
    ctx.fillRect(p.pos.x - 1200, p.pos.y - h / 2, 2400, h)
    ctx.beginPath()
    ctx.moveTo(p.pos.x - 1200, p.pos.y)
    ctx.lineTo(p.pos.x, p.pos.y)
    ctx.stroke()
  } else {
    ctx.fillRect(p.pos.x - h / 2, p.pos.y - 1200, h, 2400)
    ctx.beginPath()
    ctx.moveTo(p.pos.x, p.pos.y - 1200)
    ctx.lineTo(p.pos.x, p.pos.y)
    ctx.stroke()
  }
  ctx.restore()
}

function drawCryoVial(ctx: CanvasRenderingContext2D, p: Projectile) {
  const a = Math.max(0, p.ttl / 1.4)
  const grad = ctx.createRadialGradient(p.pos.x, p.pos.y, 0, p.pos.x, p.pos.y, p.radius)
  grad.addColorStop(0, `rgba(125,211,252,${0.4 * a})`)
  grad.addColorStop(1, 'rgba(125,211,252,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = `rgba(125,211,252,${0.6 * a})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(p.pos.x, p.pos.y, p.radius * 0.8, 0, Math.PI * 2)
  ctx.stroke()
}

function drawPickup(
  ctx: CanvasRenderingContext2D,
  p: {
    pos: Vec2
    kind: 'xp' | 'heal' | 'magnet' | 'bomb' | 'treasure'
    bobOffset: number
    value: number
    ttl?: number
  },
  t: number,
) {
  if (p.value === -1) return
  const bob = Math.sin(t * 4 + p.bobOffset) * 2
  ctx.save()
  if (p.kind === 'xp') {
    // glow
    const glow = ctx.createRadialGradient(p.pos.x, p.pos.y + bob, 0, p.pos.x, p.pos.y + bob, 14)
    glow.addColorStop(0, 'rgba(175,240,72,0.45)')
    glow.addColorStop(1, 'rgba(175,240,72,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(p.pos.x, p.pos.y + bob, 14, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#aff048'
    ctx.beginPath()
    ctx.moveTo(p.pos.x, p.pos.y - 7 + bob)
    ctx.lineTo(p.pos.x + 6, p.pos.y + bob)
    ctx.lineTo(p.pos.x, p.pos.y + 7 + bob)
    ctx.lineTo(p.pos.x - 6, p.pos.y + bob)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 1
    ctx.stroke()
  } else if (p.kind === 'heal') {
    ctx.fillStyle = '#ff4d6d'
    ctx.fillRect(p.pos.x - 6, p.pos.y - 2 + bob, 12, 4)
    ctx.fillRect(p.pos.x - 2, p.pos.y - 6 + bob, 4, 12)
  } else if (p.kind === 'magnet') {
    ctx.strokeStyle = '#4a82ff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(p.pos.x, p.pos.y + bob, 6, 0.3, Math.PI - 0.3, false)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(p.pos.x, p.pos.y + bob, 6, Math.PI + 0.3, Math.PI * 2 - 0.3, false)
    ctx.stroke()
  } else if (p.kind === 'treasure') {
    // Pulsing golden chest
    const pulse = 0.85 + Math.sin(t * 6 + p.bobOffset) * 0.15
    // Outer glow
    const glow = ctx.createRadialGradient(p.pos.x, p.pos.y + bob, 0, p.pos.x, p.pos.y + bob, 36 * pulse)
    glow.addColorStop(0, 'rgba(251,191,36,0.55)')
    glow.addColorStop(1, 'rgba(251,191,36,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(p.pos.x, p.pos.y + bob, 36 * pulse, 0, Math.PI * 2)
    ctx.fill()
    // Body — rotating cube
    const ang = t * 1.5
    ctx.translate(p.pos.x, p.pos.y + bob)
    ctx.rotate(ang)
    const r = 9
    ctx.fillStyle = '#fbbf24'
    ctx.fillRect(-r, -r, r * 2, r * 2)
    ctx.strokeStyle = '#7c4a05'
    ctx.lineWidth = 2
    ctx.strokeRect(-r, -r, r * 2, r * 2)
    ctx.fillStyle = '#fde68a'
    ctx.fillRect(-r * 0.7, -r * 0.7, r * 0.5, r * 0.5)
    ctx.rotate(-ang)
    ctx.translate(-p.pos.x, -(p.pos.y + bob))
    // Direction arrow showing it's far away
    const dx = p.pos.x - 0 // placeholder; real player ref unavailable here
    void dx
    // Time-left ring
    if (p.ttl !== undefined) {
      const total = 35
      const frac = Math.max(0, p.ttl / total)
      ctx.strokeStyle = 'rgba(251,191,36,0.6)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(p.pos.x, p.pos.y + bob, 16, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  const a = Math.max(0, p.ttl / p.maxTtl)
  ctx.fillStyle = hexAlpha(p.color, a)
  ctx.beginPath()
  ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2)
  ctx.fill()
}

function hexAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}
