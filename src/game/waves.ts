import type { Enemy, EnemyKind, Projectile, RunState, Vec2 } from './types'
import { makeEnemy } from './enemies'
import { rng } from './rng'

interface WaveSlice {
  fromTime: number
  pool: Partial<Record<EnemyKind, number>>
  baseRate: number
  hpMult: number
}

const WAVES: WaveSlice[] = [
  // 0-25s: dense bacteria swarm — first level-up should land in ~15s
  { fromTime: 0, pool: { bacteria: 1 }, baseRate: 1.6, hpMult: 1 },
  // 25-60s: plasmids mix in, ramps fast
  { fromTime: 25, pool: { bacteria: 2, plasmid: 2 }, baseRate: 2.2, hpMult: 1.05 },
  // 60-110s: mycoplasma + radicals — first real threat
  { fromTime: 60, pool: { bacteria: 1, plasmid: 2, mycoplasma: 2, radical: 1 }, baseRate: 2.7, hpMult: 1.2 },
  // 110-170s: first denaturant + first lance charges break circle patterns
  { fromTime: 110, pool: { plasmid: 2, mycoplasma: 2, radical: 2, denaturant: 1, lance: 1 }, baseRate: 3.1, hpMult: 1.4 },
  // 170-230s: endotoxin + tracker shooters — must dodge projectiles, can't move predictably
  { fromTime: 170, pool: { plasmid: 1, radical: 2, mycoplasma: 2, endotoxin: 2, denaturant: 1, lance: 1, tracker: 2 }, baseRate: 3.5, hpMult: 1.7 },
  // 230-300s: peak mid-game pressure
  { fromTime: 230, pool: { radical: 3, mycoplasma: 2, endotoxin: 2, denaturant: 2, lance: 2, tracker: 2 }, baseRate: 3.9, hpMult: 2.1 },
  // 300-380s: hard tier
  { fromTime: 300, pool: { radical: 3, endotoxin: 3, denaturant: 3, lance: 3, tracker: 3, plasmid: 1 }, baseRate: 4.3, hpMult: 2.6 },
  // 380-470s: pre-boss climax
  { fromTime: 380, pool: { radical: 4, endotoxin: 4, denaturant: 3, lance: 3, tracker: 3 }, baseRate: 4.8, hpMult: 3.2 },
]

export const RUN_DURATION = 480
export const BOSS_TIME = 470

function currentWave(time: number): WaveSlice {
  let active = WAVES[0]
  for (const w of WAVES) {
    if (time >= w.fromTime) active = w
  }
  return active
}

function pickKind(pool: Partial<Record<EnemyKind, number>>): EnemyKind {
  let total = 0
  for (const k in pool) total += pool[k as EnemyKind] ?? 0
  let r = rng() * total
  for (const k in pool) {
    r -= pool[k as EnemyKind] ?? 0
    if (r <= 0) return k as EnemyKind
  }
  return 'bacteria'
}

function pointAroundPlayer(player: Vec2, minDist: number, maxDist: number): Vec2 {
  const angle = rng() * Math.PI * 2
  const dist = minDist + rng() * (maxDist - minDist)
  return {
    x: player.x + Math.cos(angle) * dist,
    y: player.y + Math.sin(angle) * dist,
  }
}

export function tickSpawner(state: RunState, dt: number) {
  // Boss arena skips the wave director entirely — boss + its summons only.
  if (state.isBossArena) return
  if (state.bossSpawned) {
    // boss summons handled in moveEnemies via boss phase logic
    return
  }
  // Endless mode: the prion never spawns and difficulty keeps ramping
  // past the standard 8-min run.
  if (state.time >= BOSS_TIME && !state.isEndless) {
    spawnBoss(state)
    return
  }
  const wave = currentWave(state.time)
  const cap = 260
  if (state.enemies.length >= cap) return

  state.spawnTimer -= dt
  if (state.spawnTimer > 0) return

  // Endless escalation: past t=470, scale spawn rate further by elapsed time.
  let rate = wave.baseRate * (1 + state.time / 600)
  if (state.isEndless && state.time > BOSS_TIME) {
    rate *= 1 + (state.time - BOSS_TIME) / 90
  }
  const interval = 1 / rate
  state.spawnTimer = interval

  // Closer first wave so kills happen near player and XP is gatherable
  const minDist = state.time < 30 ? 380 : 460
  const maxDist = state.time < 30 ? 520 : 700

  const burst = state.time < 20 ? 2 : 1 + Math.floor(state.time / 70)
  let effHp = wave.hpMult
  if (state.isEndless && state.time > BOSS_TIME) {
    effHp *= 1 + (state.time - BOSS_TIME) / 120
  }
  for (let i = 0; i < burst; i++) {
    const kind = pickKind(wave.pool)
    const pos = pointAroundPlayer(state.player.pos, minDist, maxDist)
    state.enemies.push(makeEnemy(state.nextEntityId++, kind, pos, effHp))
  }

  // Periodic ring of mycoplasma every ~45s after 90s
  if (state.time > 90 && Math.floor(state.time / 45) !== Math.floor((state.time - dt) / 45)) {
    const count = 16
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const dist = 600
      const pos = {
        x: state.player.pos.x + Math.cos(angle) * dist,
        y: state.player.pos.y + Math.sin(angle) * dist,
      }
      state.enemies.push(makeEnemy(state.nextEntityId++, 'mycoplasma', pos, wave.hpMult))
    }
  }

  // Mid-run "elite" denaturant burst at 4 minutes
  if (
    state.time > 240 &&
    Math.floor(state.time / 60) !== Math.floor((state.time - dt) / 60)
  ) {
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + rng() * 0.4
      const pos = {
        x: state.player.pos.x + Math.cos(angle) * 700,
        y: state.player.pos.y + Math.sin(angle) * 700,
      }
      state.enemies.push(makeEnemy(state.nextEntityId++, 'denaturant', pos, wave.hpMult * 1.2))
    }
  }
}

function spawnBoss(state: RunState) {
  state.bossSpawned = true
  // Clear most enemies for dramatic boss entry
  state.enemies = state.enemies.filter((e) => e.isBoss)
  const angle = rng() * Math.PI * 2
  const pos = {
    x: state.player.pos.x + Math.cos(angle) * 480,
    y: state.player.pos.y + Math.sin(angle) * 480,
  }
  const boss = makeEnemy(state.nextEntityId++, 'prion', pos, 1)
  state.enemies.push(boss)
  state.shake = 1
  state.hitFlashGlobal = 1
}

export function tickBossPhases(state: RunState, dt: number) {
  const boss = state.enemies.find((e) => e.isBoss)
  if (!boss) return

  if (boss.kind === 'prion') tickPrion(state, boss, dt)
  else if (boss.kind === 'lysate') tickLysate(state, boss, dt)
  else if (boss.kind === 'mirrorPlasmid') tickMirrorPlasmid(state, boss, dt)
}

function tickPrion(state: RunState, boss: Enemy, dt: number) {
  const hpRatio = boss.hp / boss.maxHp
  const desiredPhase = hpRatio > 0.66 ? 0 : hpRatio > 0.33 ? 1 : 2

  if ((boss.bossPhase ?? 0) !== desiredPhase) {
    boss.bossPhase = desiredPhase
    if (desiredPhase >= 1) boss.speed = 44
    if (desiredPhase >= 2) boss.speed = 60
    state.shake = 0.8
    state.hitFlashGlobal = 0.8
    boss.shootCooldown = 0
  }

  if (desiredPhase >= 1) {
    boss.shootCooldown = (boss.shootCooldown ?? 4) - dt
    if (boss.shootCooldown <= 0) {
      boss.shootCooldown = desiredPhase === 1 ? 4 : 5
      const count = desiredPhase === 1 ? 3 : 2
      const kind: EnemyKind = desiredPhase === 1 ? 'mycoplasma' : 'endotoxin'
      for (let i = 0; i < count; i++) {
        const ang = rng() * Math.PI * 2
        const r = boss.radius + 24
        const pos = {
          x: boss.pos.x + Math.cos(ang) * r,
          y: boss.pos.y + Math.sin(ang) * r,
        }
        const child = makeEnemy(state.nextEntityId++, kind, pos)
        child.knockback.x = Math.cos(ang) * 240
        child.knockback.y = Math.sin(ang) * 240
        state.enemies.push(child)
      }
    }
  }
}

// Lysate: massive denaturant that periodically expels child blobs.
// Phase escalation: faster expulsion, more children, more aggressive movement.
function tickLysate(state: RunState, boss: Enemy, dt: number) {
  const hpRatio = boss.hp / boss.maxHp
  const desiredPhase = hpRatio > 0.66 ? 0 : hpRatio > 0.33 ? 1 : 2

  if ((boss.bossPhase ?? 0) !== desiredPhase) {
    boss.bossPhase = desiredPhase
    boss.speed = 26 + desiredPhase * 14
    state.shake = 1.0
    state.hitFlashGlobal = 0.9
    boss.shootCooldown = 0
    // Phase transition: expel a burst of children right away
    const burst = desiredPhase === 1 ? 4 : 6
    for (let i = 0; i < burst; i++) {
      const ang = (i / burst) * Math.PI * 2
      const r = boss.radius + 12
      const pos = {
        x: boss.pos.x + Math.cos(ang) * r,
        y: boss.pos.y + Math.sin(ang) * r,
      }
      const child = makeEnemy(state.nextEntityId++, 'denaturantSpawn', pos)
      child.knockback.x = Math.cos(ang) * 320
      child.knockback.y = Math.sin(ang) * 320
      state.enemies.push(child)
    }
  }

  // Periodic expulsion
  boss.shootCooldown = (boss.shootCooldown ?? 5) - dt
  if (boss.shootCooldown <= 0) {
    boss.shootCooldown = 5 - desiredPhase * 1.2
    const count = 3 + desiredPhase
    for (let i = 0; i < count; i++) {
      const ang = rng() * Math.PI * 2
      const r = boss.radius + 8
      const pos = {
        x: boss.pos.x + Math.cos(ang) * r,
        y: boss.pos.y + Math.sin(ang) * r,
      }
      const child = makeEnemy(state.nextEntityId++, 'denaturantSpawn', pos)
      child.knockback.x = Math.cos(ang) * 200
      child.knockback.y = Math.sin(ang) * 200
      state.enemies.push(child)
    }
  }
}

// Mirror Plasmid: behaves like a player. Maintains mid-range, fires at the
// player, occasionally dashes. Phase escalation adds homing shots and
// orbital companions.
function tickMirrorPlasmid(state: RunState, boss: Enemy, dt: number) {
  const hpRatio = boss.hp / boss.maxHp
  const desiredPhase = hpRatio > 0.5 ? 0 : 1

  if ((boss.bossPhase ?? 0) !== desiredPhase) {
    boss.bossPhase = desiredPhase
    boss.speed = 56 + desiredPhase * 18
    state.shake = 0.9
    state.hitFlashGlobal = 0.85
    boss.shootCooldown = 0
    // Phase 1: summon two trackers as backup
    if (desiredPhase === 1) {
      for (let i = 0; i < 2; i++) {
        const ang = (i / 2) * Math.PI * 2 + rng() * 0.5
        const pos = {
          x: boss.pos.x + Math.cos(ang) * 80,
          y: boss.pos.y + Math.sin(ang) * 80,
        }
        const child = makeEnemy(state.nextEntityId++, 'tracker', pos)
        state.enemies.push(child)
      }
    }
  }

  // Maintain ~280px standoff from player (tracker-like AI)
  const dx = state.player.pos.x - boss.pos.x
  const dy = state.player.pos.y - boss.pos.y
  const dist = Math.hypot(dx, dy) || 1
  const ideal = 280
  const margin = 50
  let mvX = 0
  let mvY = 0
  const ndx = dx / dist
  const ndy = dy / dist
  if (dist < ideal - margin) {
    mvX = -ndx
    mvY = -ndy
  } else if (dist > ideal + margin) {
    mvX = ndx
    mvY = ndy
  } else {
    // strafe perpendicular
    mvX = -ndy * 0.7
    mvY = ndx * 0.7
  }
  boss.pos.x += mvX * boss.speed * dt
  boss.pos.y += mvY * boss.speed * dt

  // Fire PCR-style projectiles at the player
  boss.shootCooldown = (boss.shootCooldown ?? 1.2) - dt
  if (boss.shootCooldown <= 0 && dist < 900) {
    boss.shootCooldown = desiredPhase === 0 ? 0.85 : 0.55
    // Fire a small spread
    const count = desiredPhase === 0 ? 1 : 2
    const spread = desiredPhase === 0 ? 0 : 0.35
    const baseAng = Math.atan2(dy, dx)
    for (let i = 0; i < count; i++) {
      const off = count === 1 ? 0 : -spread / 2 + spread * (i / (count - 1))
      const a = baseAng + off
      const speed = 360
      const proj = {
        id: state.nextEntityId++,
        pos: { ...boss.pos },
        vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
        damage: boss.damage * 0.5,
        radius: 7,
        ttl: 3.5,
        pierce: 0,
        kind: 'pcr' as const,
        hits: new Set<number>(),
      }
      ;(proj as Projectile & { enemyShot: true }).enemyShot = true
      state.projectiles.push(proj)
    }
  }
}
