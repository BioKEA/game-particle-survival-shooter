import type { Enemy, Projectile, RunState, Vec2, WeaponState } from './types'
import { rng } from './rng'

const BASE_COOLDOWNS: Record<string, number> = {
  pcr: 0.7,
  crispr: 1.15,
  centrifuge: 6.0,
  electrophoresis: 4.5,
  massSpec: 7.0,
  antibody: 2.4,
  cryoVial: 3.5,
  // Evolutions
  qpcr: 0.32,
  cas12a: 1.0,
  ultracentrifuge: 6.0,
  capillary: 3.5,
  tandemMs: 7.0,
  polyclonal: 2.0,
  liquidN2: 2.6,
}

function nearestEnemy(state: RunState, from: Vec2, max = 1200): Enemy | undefined {
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

function highestHpEnemy(state: RunState, from: Vec2, max = 1200): Enemy | undefined {
  let best: Enemy | undefined
  let bestHp = 0
  for (const e of state.enemies) {
    const dx = e.pos.x - from.x
    const dy = e.pos.y - from.y
    if (dx * dx + dy * dy > max * max) continue
    if (e.hp > bestHp) {
      bestHp = e.hp
      best = e
    }
  }
  return best
}

function makeProjectile(state: RunState, p: Omit<Projectile, 'id' | 'hits'>): Projectile {
  return {
    ...p,
    id: state.nextEntityId++,
    hits: new Set(),
  }
}

export function tickWeapons(state: RunState, dt: number) {
  const dmgMult = state.player.damageMult
  const cdMult = state.player.cooldownMult
  const sizeMult = state.player.projectileScale

  for (const w of state.weapons) {
    w.cooldownLeft -= dt
    if (w.cooldownLeft > 0) continue
    fireWeapon(state, w, dmgMult, sizeMult)
    const next = (BASE_COOLDOWNS[w.id] ?? 1) * cdMult * cooldownLevelMod(w)
    w.cooldownLeft = next
    w.cooldownMax = next
  }

  // persistent weapon visuals/effects (centrifuge orbit & mass-spec beam) are managed inside their projectiles
  // but if their lifetime expires we need to keep them alive; handled by re-firing
}

function cooldownLevelMod(w: WeaponState): number {
  // Each level shaves a bit of cooldown
  const mods: Record<string, number[]> = {
    // PCR was [1.0, 0.92, 0.85, 0.78, 0.7, 0.62, 0.55] — combined with
    // amp5 (×0.85) and Catalyst passive (×1−0.1·level), late-game PCR
    // could fire ~6×/sec which made the screen self-clearing. Easing
    // the curve to keep PCR a viable but not dominant build.
    pcr: [1.0, 0.96, 0.92, 0.88, 0.84, 0.78, 0.72],
    crispr: [1.0, 0.92, 0.84, 0.76, 0.68, 0.6, 0.55],
    electrophoresis: [1.0, 0.92, 0.85, 0.78, 0.7, 0.65],
    massSpec: [1.0, 0.95, 0.88, 0.8, 0.72, 0.65],
    antibody: [1.0, 0.92, 0.84, 0.78, 0.72, 0.66],
    cryoVial: [1.0, 0.92, 0.85, 0.78, 0.72, 0.66],
    centrifuge: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  }
  const arr = mods[w.id] ?? [1]
  return arr[Math.min(w.level, arr.length - 1)] ?? 1
}

function fireWeapon(state: RunState, w: WeaponState, dmgMult: number, sizeMult: number) {
  switch (w.id) {
    case 'pcr':
      firePcr(state, w, dmgMult, sizeMult)
      break
    case 'crispr':
      fireCrispr(state, w, dmgMult, sizeMult)
      break
    case 'centrifuge':
      refreshCentrifuge(state, w, dmgMult, sizeMult)
      break
    case 'electrophoresis':
      fireElectrophoresis(state, w, dmgMult, sizeMult)
      break
    case 'massSpec':
      fireMassSpec(state, w, dmgMult, sizeMult)
      break
    case 'antibody':
      fireAntibody(state, w, dmgMult, sizeMult)
      break
    case 'cryoVial':
      fireCryoVial(state, w, dmgMult, sizeMult)
      break
    // Evolutions
    case 'qpcr':
      fireQpcr(state, dmgMult, sizeMult)
      break
    case 'cas12a':
      fireCas12a(state, dmgMult, sizeMult)
      break
    case 'ultracentrifuge':
      refreshUltracentrifuge(state, dmgMult, sizeMult)
      break
    case 'capillary':
      fireCapillary(state, dmgMult)
      break
    case 'tandemMs':
      fireTandemMs(state, dmgMult)
      break
    case 'polyclonal':
      firePolyclonal(state, dmgMult, sizeMult)
      break
    case 'liquidN2':
      fireLiquidN2(state, dmgMult, sizeMult)
      break
  }
}

function firePcr(state: RunState, w: WeaponState, dmgMult: number, sizeMult: number) {
  // Targeting range was 560; tightening so PCR doesn't snipe across
  // the whole field while you stand still.
  const target = nearestEnemy(state, state.player.pos, 500)
  if (!target) return
  // Damage scaling was +40%/lvl (max ×3); now +25%/lvl (max ×2.25).
  const baseDmg = 10 * (1 + (w.level - 1) * 0.25) * dmgMult
  // Count was lvl 1:1 / lvl 3:2 / lvl 5:3 — too quickly multi-shot.
  // Now lvl 1–3:1 / lvl 4–5:2 / lvl 6:3. Pierce was lvl 2:1 / lvl 4:2;
  // now lvl 4:1 / lvl 6:2. PCR remains a viable build, no longer auto-clears.
  const count = w.level >= 6 ? 3 : w.level >= 4 ? 2 : 1
  const baseAng = Math.atan2(target.pos.y - state.player.pos.y, target.pos.x - state.player.pos.x)
  const spread = (count - 1) * 0.18
  for (let i = 0; i < count; i++) {
    const ang = baseAng - spread / 2 + (count > 1 ? (i * spread) / (count - 1) : 0)
    const speed = 720
    state.projectiles.push(
      makeProjectile(state, {
        pos: { ...state.player.pos },
        vel: { x: Math.cos(ang) * speed, y: Math.sin(ang) * speed },
        damage: baseDmg,
        radius: 6 * sizeMult,
        ttl: 1.4,
        pierce: w.level >= 6 ? 2 : w.level >= 4 ? 1 : 0,
        kind: 'pcr',
      }),
    )
  }
}

function fireCrispr(state: RunState, w: WeaponState, dmgMult: number, sizeMult: number) {
  const count = 1 + Math.floor(w.level / 2)
  const baseDmg = 26 * (1 + (w.level - 1) * 0.35) * dmgMult
  for (let i = 0; i < count; i++) {
    const target = highestHpEnemy(state, state.player.pos, 1100)
    if (!target) return
    const ang = rng() * Math.PI * 2
    const speed = 320
    state.projectiles.push(
      makeProjectile(state, {
        pos: { ...state.player.pos },
        vel: { x: Math.cos(ang) * speed, y: Math.sin(ang) * speed },
        damage: baseDmg,
        radius: 8 * sizeMult,
        ttl: 3.5,
        pierce: 0,
        kind: 'crispr',
        targetId: target.id,
      }),
    )
  }
}

function refreshCentrifuge(state: RunState, w: WeaponState, dmgMult: number, sizeMult: number) {
  // Remove any existing centrifuge orbiters
  state.projectiles = state.projectiles.filter((p) => p.kind !== 'centrifuge')
  const count = 2 + w.level // lvl 1:3 ... lvl 6:8
  const radius = 64 + w.level * 6
  const dmg = 7 * (1 + (w.level - 1) * 0.3) * dmgMult
  for (let i = 0; i < count; i++) {
    state.projectiles.push(
      makeProjectile(state, {
        pos: { ...state.player.pos },
        vel: { x: 0, y: 0 },
        damage: dmg,
        radius: 10 * sizeMult,
        ttl: 7.5,
        pierce: 999,
        kind: 'centrifuge',
        orbitAngle: (i / count) * Math.PI * 2,
        orbitRadius: radius,
      }),
    )
  }
}

function fireElectrophoresis(state: RunState, w: WeaponState, dmgMult: number, sizeMult: number) {
  const horizontal = rng() < 0.5
  const dmg = 18 * (1 + (w.level - 1) * 0.4) * dmgMult
  const bandHeight = (90 + w.level * 12) * sizeMult
  if (horizontal) {
    state.projectiles.push(
      makeProjectile(state, {
        pos: { x: state.player.pos.x - 900, y: state.player.pos.y },
        vel: { x: 1100, y: 0 },
        damage: dmg,
        radius: 0,
        ttl: 2.2,
        pierce: 999,
        kind: 'electrophoresis',
        bandHeight,
        sweepDir: 1,
      }),
    )
  } else {
    state.projectiles.push(
      makeProjectile(state, {
        pos: { x: state.player.pos.x, y: state.player.pos.y - 900 },
        vel: { x: 0, y: 1100 },
        damage: dmg,
        radius: 0,
        ttl: 2.2,
        pierce: 999,
        kind: 'electrophoresis',
        bandHeight,
        sweepDir: 2,
      }),
    )
  }
}

function fireMassSpec(state: RunState, w: WeaponState, dmgMult: number, _sizeMult: number) {
  // Remove previous beam
  state.projectiles = state.projectiles.filter((p) => p.kind !== 'massSpec')
  const length = 200 + w.level * 30
  const dmg = 6 * (1 + (w.level - 1) * 0.45) * dmgMult
  state.projectiles.push(
    makeProjectile(state, {
      pos: { ...state.player.pos },
      vel: { x: 0, y: 0 },
      damage: dmg,
      radius: 0,
      ttl: 6.5,
      pierce: 999,
      kind: 'massSpec',
      beamAngle: 0,
      beamLength: length,
    }),
  )
}

function fireAntibody(state: RunState, w: WeaponState, dmgMult: number, sizeMult: number) {
  const count = 1 + w.level
  const dmg = 14 * (1 + (w.level - 1) * 0.3) * dmgMult
  for (let i = 0; i < count; i++) {
    const target = nearestEnemy(state, state.player.pos, 700)
    const ang = target
      ? Math.atan2(target.pos.y - state.player.pos.y, target.pos.x - state.player.pos.x) +
        (rng() - 0.5) * 0.5
      : rng() * Math.PI * 2
    state.projectiles.push(
      makeProjectile(state, {
        pos: { ...state.player.pos },
        vel: { x: Math.cos(ang) * 280, y: Math.sin(ang) * 280 },
        damage: dmg,
        radius: 7 * sizeMult,
        ttl: 4,
        pierce: 1,
        kind: 'antibody',
        targetId: target?.id,
      }),
    )
  }
}

function fireCryoVial(state: RunState, w: WeaponState, dmgMult: number, sizeMult: number) {
  const count = 1 + Math.floor(w.level / 2)
  const dmg = 12 * (1 + (w.level - 1) * 0.4) * dmgMult
  const aoe = (50 + w.level * 8) * sizeMult
  for (let i = 0; i < count; i++) {
    const ang = rng() * Math.PI * 2
    const dist = 100 + rng() * 180
    state.projectiles.push(
      makeProjectile(state, {
        pos: {
          x: state.player.pos.x + Math.cos(ang) * dist,
          y: state.player.pos.y + Math.sin(ang) * dist,
        },
        vel: { x: 0, y: 0 },
        damage: dmg,
        radius: aoe,
        ttl: 1.4,
        pierce: 999,
        kind: 'cryoVial',
      }),
    )
  }
}

// --- Evolutions ---

function fireQpcr(state: RunState, dmgMult: number, sizeMult: number) {
  const target = nearestEnemy(state, state.player.pos, 720)
  if (!target) return
  const baseDmg = 38 * dmgMult
  const count = 5
  const baseAng = Math.atan2(target.pos.y - state.player.pos.y, target.pos.x - state.player.pos.x)
  const spread = 0.55
  for (let i = 0; i < count; i++) {
    const ang = baseAng - spread / 2 + (spread * i) / (count - 1)
    state.projectiles.push(
      makeProjectile(state, {
        pos: { ...state.player.pos },
        vel: { x: Math.cos(ang) * 760, y: Math.sin(ang) * 760 },
        damage: baseDmg,
        radius: 7 * sizeMult,
        ttl: 1.5,
        pierce: 4,
        kind: 'qpcr',
        targetId: target.id, // engine homing logic — qpcr = mild homing
      }),
    )
  }
}

function fireCas12a(state: RunState, dmgMult: number, sizeMult: number) {
  // Pick up to 4 distinct targets; fire one homing strand at each
  const baseDmg = 56 * dmgMult
  const taken = new Set<number>()
  for (let i = 0; i < 4; i++) {
    let best: number | undefined
    let bestD = 1300 * 1300
    for (const e of state.enemies) {
      if (taken.has(e.id)) continue
      const dx = e.pos.x - state.player.pos.x
      const dy = e.pos.y - state.player.pos.y
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = e.id
      }
    }
    if (best === undefined) break
    taken.add(best)
    const ang = rng() * Math.PI * 2
    state.projectiles.push(
      makeProjectile(state, {
        pos: { ...state.player.pos },
        vel: { x: Math.cos(ang) * 380, y: Math.sin(ang) * 380 },
        damage: baseDmg,
        radius: 9 * sizeMult,
        ttl: 4,
        pierce: 0,
        kind: 'cas12a',
        targetId: best,
      }),
    )
  }
}

function refreshUltracentrifuge(state: RunState, dmgMult: number, sizeMult: number) {
  state.projectiles = state.projectiles.filter(
    (p) => p.kind !== 'centrifuge' && p.kind !== 'ultracentrifuge',
  )
  const count = 14
  const radius = 130
  const dmg = 22 * dmgMult
  for (let i = 0; i < count; i++) {
    state.projectiles.push(
      makeProjectile(state, {
        pos: { ...state.player.pos },
        vel: { x: 0, y: 0 },
        damage: dmg,
        radius: 12 * sizeMult,
        ttl: 7.5,
        pierce: 999,
        kind: 'ultracentrifuge',
        orbitAngle: (i / count) * Math.PI * 2,
        orbitRadius: radius,
      }),
    )
  }
}

function fireCapillary(state: RunState, dmgMult: number) {
  const dmg = 42 * dmgMult
  const bandHeight = 130
  // Horizontal sweep
  state.projectiles.push(
    makeProjectile(state, {
      pos: { x: state.player.pos.x - 900, y: state.player.pos.y },
      vel: { x: 1100, y: 0 },
      damage: dmg,
      radius: 0,
      ttl: 2.5,
      pierce: 999,
      kind: 'capillary',
      bandHeight,
      sweepDir: 1,
    }),
  )
  // Vertical sweep
  state.projectiles.push(
    makeProjectile(state, {
      pos: { x: state.player.pos.x, y: state.player.pos.y - 900 },
      vel: { x: 0, y: 1100 },
      damage: dmg,
      radius: 0,
      ttl: 2.5,
      pierce: 999,
      kind: 'capillary',
      bandHeight,
      sweepDir: 2,
    }),
  )
}

function fireTandemMs(state: RunState, dmgMult: number) {
  state.projectiles = state.projectiles.filter(
    (p) => p.kind !== 'massSpec' && p.kind !== 'tandemMs',
  )
  const length = 360
  const dmg = 14 * dmgMult
  // Two beams, 180° apart
  for (let i = 0; i < 2; i++) {
    state.projectiles.push(
      makeProjectile(state, {
        pos: { ...state.player.pos },
        vel: { x: 0, y: 0 },
        damage: dmg,
        radius: 0,
        ttl: 7.5,
        pierce: 999,
        kind: 'tandemMs',
        beamAngle: i * Math.PI,
        beamLength: length,
      }),
    )
  }
}

function firePolyclonal(state: RunState, dmgMult: number, sizeMult: number) {
  const count = 8
  const dmg = 26 * dmgMult
  for (let i = 0; i < count; i++) {
    const target = nearestEnemy(state, state.player.pos, 800)
    const ang = target
      ? Math.atan2(target.pos.y - state.player.pos.y, target.pos.x - state.player.pos.x) +
        (rng() - 0.5) * 0.8
      : rng() * Math.PI * 2
    state.projectiles.push(
      makeProjectile(state, {
        pos: { ...state.player.pos },
        vel: { x: Math.cos(ang) * 320, y: Math.sin(ang) * 320 },
        damage: dmg,
        radius: 8 * sizeMult,
        ttl: 5.5,
        pierce: 3,
        kind: 'polyclonal',
        targetId: target?.id,
      }),
    )
  }
}

function fireLiquidN2(state: RunState, dmgMult: number, sizeMult: number) {
  const count = 4
  const dmg = 32 * dmgMult
  const aoe = 150 * sizeMult
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rng() * 0.5
    const dist = 80 + rng() * 140
    state.projectiles.push(
      makeProjectile(state, {
        pos: {
          x: state.player.pos.x + Math.cos(ang) * dist,
          y: state.player.pos.y + Math.sin(ang) * dist,
        },
        vel: { x: 0, y: 0 },
        damage: dmg,
        radius: aoe,
        ttl: 2.4,
        pierce: 999,
        kind: 'liquidN2',
      }),
    )
  }
}
