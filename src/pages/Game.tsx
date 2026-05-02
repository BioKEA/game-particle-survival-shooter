import { useEffect, useRef, useState } from 'react'
import type { BossId, Lineage, MetaState, RunState, UpgradeId, WeaponId } from '@/game/types'
import {
  applyUpgrade,
  createInitialState,
  getLineageScores,
  render,
  update,
} from '@/game/engine'
import { dominantLineage, getMeta, LINEAGES, WEAPON_META, type LineageScore } from '@/game/upgrades'
import { RUN_DURATION } from '@/game/waves'
import { audio } from '@/game/audio'
import { clearSeed, setSeed, shortSeed } from '@/game/rng'
import {
  type AchievementDef,
  checkRunAchievements,
  checkRunEndAchievements,
  getAchievement,
} from '@/game/achievements'
import type { RunConfig } from '@/App'

interface GameProps {
  meta: MetaState
  runConfig: RunConfig
  onRunComplete: (result: RunResult) => void
  onMetaUpdate: (updater: (m: MetaState) => MetaState) => void
  onExit: () => void
}

export interface RunResult {
  outcome: 'won' | 'lost' | 'quit'
  time: number
  level: number
  kills: number
  credits: number
  achievementsUnlocked: string[]
  bossDefeated?: BossId
}

export function Game({ meta, runConfig, onRunComplete, onMetaUpdate, onExit }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Seed RNG before initial-state creation so any spawning that happens
  // during the first frame is also deterministic in daily mode
  if (runConfig.mode === 'daily' && runConfig.seed !== undefined) {
    setSeed(runConfig.seed)
  } else {
    clearSeed()
  }
  const stateRef = useRef<RunState>(
    createInitialState(meta, { mode: runConfig.mode, bossId: runConfig.bossId }),
  )
  // Mirror meta into a ref so async loops see the latest value without stale closures
  const metaRef = useRef(meta)
  metaRef.current = meta
  const seenAchievementsRef = useRef<Set<string>>(new Set(meta.achievements))
  const seenTier2Ref = useRef<Set<Lineage>>(new Set(meta.tier2Reached))
  const seenEvolutionsRef = useRef<Set<WeaponId>>(new Set(meta.evolutionsTriggered))
  const [toasts, setToasts] = useState<{ key: number; def: AchievementDef; bornAt: number }[]>([])
  const toastIdRef = useRef(0)

  const tryUnlock = (id: string) => {
    if (seenAchievementsRef.current.has(id)) return
    seenAchievementsRef.current.add(id)
    const def = getAchievement(id)
    if (!def) return
    onMetaUpdate((m) => {
      if (m.achievements.includes(id)) return m
      return {
        ...m,
        achievements: [...m.achievements, id],
        credits: m.credits + (def.rewardCredits ?? 0),
      }
    })
    setToasts((prev) => [...prev, { key: ++toastIdRef.current, def, bornAt: performance.now() }])
    audio.play('levelUp')
  }

  const trackEvolution = (pickedId: UpgradeId) => {
    const m = WEAPON_META[pickedId as WeaponId]
    if (!m?.isEvolution) return
    const wid = pickedId as WeaponId
    if (seenEvolutionsRef.current.has(wid)) return
    seenEvolutionsRef.current.add(wid)
    onMetaUpdate((meta) => {
      if (meta.evolutionsTriggered.includes(wid)) return meta
      return { ...meta, evolutionsTriggered: [...meta.evolutionsTriggered, wid] }
    })
  }

  // Achievement detection — runs alongside the HUD rerender
  useEffect(() => {
    const interval = setInterval(() => {
      const state = stateRef.current
      if (state.status !== 'running' && state.status !== 'levelup') return
      const m = metaRef.current
      const ctx = {
        evolutionsTriggeredThisSession: m.evolutionsTriggered,
        tier2LineagesEverHit: m.tier2Reached,
      }
      const ids = checkRunAchievements(state, m, ctx)
      for (const id of ids) tryUnlock(id)

      // Cross-run tier 2 tracking
      const perks = state.lineagePerks
      if (perks?.amp5 && !seenTier2Ref.current.has('amplify')) {
        seenTier2Ref.current.add('amplify')
        onMetaUpdate((m) => ({
          ...m,
          tier2Reached: m.tier2Reached.includes('amplify') ? m.tier2Reached : [...m.tier2Reached, 'amplify'],
        }))
      }
      if (perks?.con5 && !seenTier2Ref.current.has('contain')) {
        seenTier2Ref.current.add('contain')
        onMetaUpdate((m) => ({
          ...m,
          tier2Reached: m.tier2Reached.includes('contain') ? m.tier2Reached : [...m.tier2Reached, 'contain'],
        }))
      }
      if (perks?.edit5 && !seenTier2Ref.current.has('edit')) {
        seenTier2Ref.current.add('edit')
        onMetaUpdate((m) => ({
          ...m,
          tier2Reached: m.tier2Reached.includes('edit') ? m.tier2Reached : [...m.tier2Reached, 'edit'],
        }))
      }
    }, 250)
    return () => clearInterval(interval)
  }, [onMetaUpdate])

  // Toast lifecycle — drop expired toasts
  useEffect(() => {
    if (toasts.length === 0) return
    const t = setInterval(() => {
      const now = performance.now()
      setToasts((prev) => prev.filter((x) => now - x.bornAt < 4500))
    }, 250)
    return () => clearInterval(t)
  }, [toasts.length])
  const [, setTick] = useState(0)
  const tickStateRef = useRef(0)

  // Keep React in sync with state changes that affect HUD. 50ms (~20fps) is a
  // good balance — fast enough that cooldown rings drain smoothly, slow enough
  // not to thrash React.
  useEffect(() => {
    const id = setInterval(() => {
      tickStateRef.current += 1
      setTick(tickStateRef.current)
    }, 50)
    return () => clearInterval(id)
  }, [])

  // Audio
  useEffect(() => {
    audio.resume()
    audio.startMusic()
    return () => {
      audio.stopMusic()
    }
  }, [])

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let last = performance.now()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const onResize = () => resize()
    window.addEventListener('resize', onResize)

    const loop = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const state = stateRef.current
      update(state, dt)
      const rect = canvas.getBoundingClientRect()
      render(ctx, state, rect.width, rect.height)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // Input
  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const state = stateRef.current
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          state.input.up = down
          e.preventDefault()
          break
        case 'KeyS':
        case 'ArrowDown':
          state.input.down = down
          e.preventDefault()
          break
        case 'KeyA':
        case 'ArrowLeft':
          state.input.left = down
          e.preventDefault()
          break
        case 'KeyD':
        case 'ArrowRight':
          state.input.right = down
          e.preventDefault()
          break
      }
      // Number keys for level-up
      if (down && state.status === 'levelup') {
        const n = parseInt(e.key, 10)
        if (n >= 1 && n <= state.pendingChoices.length) {
          const picked = state.pendingChoices[n - 1]
          applyUpgrade(state, picked)
          audio.play('select')
          trackEvolution(picked)
        }
      }
      if (down && e.code === 'Escape') {
        e.preventDefault()
        // Bubble to UI quit handler via custom event
        window.dispatchEvent(new CustomEvent('pa:quit'))
      }
    }
    const dn = (e: KeyboardEvent) => onKey(e, true)
    const up = (e: KeyboardEvent) => onKey(e, false)
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', dn)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Listen for esc-to-quit
  useEffect(() => {
    const handler = () => onExit()
    window.addEventListener('pa:quit', handler)
    return () => window.removeEventListener('pa:quit', handler)
  }, [onExit])

  const state = stateRef.current
  const showLevelUp = state.status === 'levelup'
  const showWin = state.status === 'won'
  const showLose = state.status === 'lost'

  // When game ends, fire onRunComplete once
  const completedRef = useRef(false)
  useEffect(() => {
    if ((showWin || showLose) && !completedRef.current) {
      completedRef.current = true
      const credits = computeCredits(state, showWin)
      const outcome: 'won' | 'lost' = showWin ? 'won' : 'lost'
      // Run end-of-run achievement check
      const m = metaRef.current
      const endIds = checkRunEndAchievements(
        state,
        m,
        outcome,
        runConfig.mode,
        runConfig.bossId,
      )
      for (const id of endIds) tryUnlock(id)
      const unlocked = [...new Set([...endIds, ...Array.from(seenAchievementsRef.current).filter(
        (id) => !meta.achievements.includes(id),
      )])]
      onRunComplete({
        outcome,
        time: state.time,
        level: state.level,
        kills: state.kills,
        credits,
        achievementsUnlocked: unlocked,
        bossDefeated: showWin && runConfig.mode === 'boss' ? runConfig.bossId : undefined,
      })
    }
  }, [showWin, showLose, state, onRunComplete, runConfig, meta.achievements])

  return (
    <div className="fixed inset-0 bg-[#0a1424] overflow-hidden select-none touch-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <Hud state={state} runConfig={runConfig} onQuit={onExit} />
      <TouchJoystick stateRef={stateRef} disabled={showLevelUp || showWin || showLose} />
      <AchievementToasts toasts={toasts} />

      {showLevelUp && (
        <LevelUpModal
          choices={state.pendingChoices}
          state={state}
          onPick={(id) => {
            applyUpgrade(state, id)
            trackEvolution(id)
          }}
        />
      )}
      {(showWin || showLose) && (
        <RunEndOverlay
          win={showWin}
          state={state}
          meta={meta}
          credits={computeCredits(state, showWin)}
          runConfig={runConfig}
          onContinue={onExit}
        />
      )}
    </div>
  )
}

function TouchJoystick({
  stateRef,
  disabled,
}: {
  stateRef: React.MutableRefObject<RunState>
  disabled: boolean
}) {
  const [active, setActive] = useState(false)
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null)
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null)
  const [enabled] = useState(() => {
    if (typeof window === 'undefined') return false
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0
  })
  const RADIUS = 56

  useEffect(() => {
    if (!enabled) return
    const onStart = (e: TouchEvent) => {
      if (disabled) return
      const t = e.touches[0]
      if (!t) return
      // Only respond to touches in the lower-left quadrant
      if (t.clientX > window.innerWidth * 0.5 || t.clientY < window.innerHeight * 0.4) return
      e.preventDefault()
      setCenter({ x: t.clientX, y: t.clientY })
      setKnob({ x: t.clientX, y: t.clientY })
      setActive(true)
    }
    const onMove = (e: TouchEvent) => {
      if (!active) return
      const t = e.touches[0]
      if (!t || !center) return
      e.preventDefault()
      let dx = t.clientX - center.x
      let dy = t.clientY - center.y
      const m = Math.hypot(dx, dy)
      const max = RADIUS
      if (m > max) {
        dx = (dx / m) * max
        dy = (dy / m) * max
      }
      setKnob({ x: center.x + dx, y: center.y + dy })
      stateRef.current.input.analog = { x: dx / max, y: dy / max }
    }
    const onEnd = () => {
      setActive(false)
      setCenter(null)
      setKnob(null)
      stateRef.current.input.analog = null
    }
    window.addEventListener('touchstart', onStart, { passive: false })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled, disabled, active, center, stateRef])

  if (!enabled || !active || !center || !knob) return null
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div
        className="absolute rounded-full border-2 border-cobalt/40 bg-cobalt/10"
        style={{
          left: center.x - RADIUS,
          top: center.y - RADIUS,
          width: RADIUS * 2,
          height: RADIUS * 2,
        }}
      />
      <div
        className="absolute rounded-full bg-cobalt border-2 border-bone shadow-lg"
        style={{
          left: knob.x - 22,
          top: knob.y - 22,
          width: 44,
          height: 44,
        }}
      />
    </div>
  )
}

function computeCredits(state: RunState, win: boolean): number {
  const timeBonus = Math.floor(state.time * 0.6)
  const killBonus = Math.floor(state.kills * 0.4)
  const winBonus = win ? 200 : 0
  return timeBonus + killBonus + winBonus
}

function Hud({
  state,
  runConfig,
  onQuit,
}: {
  state: RunState
  runConfig: RunConfig
  onQuit: () => void
}) {
  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60)
    const r = Math.floor(s % 60)
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  }
  const remaining = Math.max(0, RUN_DURATION - state.time)
  const hpPct = Math.max(0, state.player.hp) / state.player.maxHp
  const xpPct = state.xp / state.xpToNext
  const isDaily = runConfig.mode === 'daily'
  const lowHp = hpPct > 0 && hpPct < 0.3
  const boss = state.enemies.find((e) => e.isBoss)
  const phase = wavePhase(state.time)

  return (
    <>
      {/* Corner brackets — subtle frame around the play area */}
      <CornerBrackets />

      {/* Damage direction indicator */}
      {state.damageDir && state.damageDirTimer > 0 && (
        <DamageArrow dir={state.damageDir} alpha={state.damageDirTimer / 0.8} />
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 px-4 md:px-6 pt-4 flex items-start justify-between gap-4 pointer-events-none">
        {/* Sample / HP card */}
        <div
          className={`pointer-events-auto bg-ink/85 backdrop-blur-md rounded-[4px] border ${
            lowHp ? 'border-contam/60 animate-hud-pulse-red' : 'border-cobalt/25'
          } px-4 py-3 min-w-[228px]`}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.25em] uppercase">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  lowHp ? 'bg-contam' : 'bg-cobalt-bright'
                } ${lowHp ? 'animate-pulse' : ''}`}
              />
              <span className={lowHp ? 'text-contam' : 'text-cobalt-bright'}>sample</span>
            </div>
            <div className="font-mono text-[10px] text-bone/60">
              <span className="text-bone/40 mr-1">LVL</span>
              <span className="text-bone font-bold tabular-nums">{state.level}</span>
            </div>
          </div>

          {/* Segmented HP bar */}
          <div className="mt-2 relative h-2.5 bg-bone/10 rounded-[2px] overflow-hidden border border-bone/10">
            <div
              className={`h-full transition-[width] duration-150 ${
                lowHp ? 'bg-gradient-to-r from-[#ff2d4d] to-[#ff7a8a]' : 'bg-gradient-to-r from-[#ff4d6d] to-[#ff7a8a]'
              }`}
              style={{ width: `${hpPct * 100}%` }}
            />
            {/* Segment dividers at quartiles */}
            {[25, 50, 75].map((p) => (
              <div
                key={p}
                className="absolute top-0 bottom-0 w-px bg-ink/60"
                style={{ left: `${p}%` }}
              />
            ))}
          </div>

          <div className="mt-1.5 flex items-center justify-between font-mono text-[10px]">
            <div className="text-bone/55">
              <span className={`tabular-nums font-bold ${lowHp ? 'text-contam' : 'text-bone'}`}>
                {Math.max(0, Math.ceil(state.player.hp))}
              </span>
              <span className="text-bone/35"> / {Math.ceil(state.player.maxHp)} HP</span>
            </div>
            {state.combo >= 4 && (
              <div className="flex items-center gap-1.5">
                <div
                  className="font-bold text-[11px] tabular-nums tracking-wide"
                  style={{ color: comboColor(state.combo) }}
                >
                  ×{state.combo}
                </div>
                <div className="font-mono text-[8px] tracking-[0.2em] uppercase text-bone/40">
                  combo
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center timer or boss bar */}
        {boss ? (
          <BossBar boss={boss} />
        ) : (
          <div className="pointer-events-auto bg-ink/85 backdrop-blur-md rounded-[4px] px-5 py-3 border border-cobalt/25 text-center min-w-[180px]">
            <div className="font-mono text-[9px] tracking-[0.3em] uppercase flex items-center justify-center gap-2">
              {isDaily && runConfig.seed !== undefined && (
                <span
                  className="text-[8px] tracking-[0.2em] text-lime font-bold px-1.5 py-px rounded-sm"
                  style={{ background: 'rgba(175,240,72,0.12)' }}
                >
                  DAILY · {shortSeed(runConfig.seed)}
                </span>
              )}
              <span className="text-cobalt-bright">{phase.label}</span>
              <span className="text-bone/30">·</span>
              <span className="text-bone/50">{phase.index}/8</span>
            </div>
            <div className="mt-0.5 font-bold text-[26px] text-bone tabular-nums tracking-tight leading-none">
              {fmtTime(remaining)}
            </div>
            <div className="mt-1.5 h-0.5 bg-bone/10 rounded-sm overflow-hidden">
              <div
                className="h-full bg-cobalt transition-[width] duration-200"
                style={{ width: `${(state.time / RUN_DURATION) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats + quit */}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="bg-ink/85 backdrop-blur-md rounded-[4px] px-4 py-3 border border-cobalt/25 min-w-[160px]">
            <div className="flex flex-col gap-1.5 font-mono text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-bone/40 tracking-[0.2em] uppercase text-[9px]">kills</span>
                <span className="text-bone font-bold tabular-nums">{state.kills}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-bone/40 tracking-[0.2em] uppercase text-[9px]">peak</span>
                <span className="text-bone/80 font-bold tabular-nums">×{state.comboPeak}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onQuit}
            className="font-mono text-[10px] tracking-[0.2em] uppercase text-bone/50 hover:text-bone bg-ink/60 hover:bg-ink/85 px-3 py-1.5 rounded-[3px] border border-bone/10 transition-colors"
          >
            [esc] quit
          </button>
        </div>
      </div>

      {/* Bottom XP bar + weapon row */}
      <div className="absolute bottom-0 left-0 right-0 px-4 md:px-6 pb-4 pointer-events-none">
        <div className="bg-ink/85 backdrop-blur-md border border-cobalt/25 rounded-[4px] px-4 py-3">
          {/* XP bar with level marker */}
          <div className="flex items-center gap-3">
            <div className="font-mono text-[9px] tracking-[0.25em] uppercase text-cobalt-bright">
              XP
            </div>
            <div className="flex-1 relative h-2 bg-bone/10 rounded-[2px] overflow-hidden border border-bone/10">
              <div
                className="h-full bg-gradient-to-r from-cobalt to-[#7ab0ff] transition-[width] duration-150"
                style={{ width: `${xpPct * 100}%` }}
              />
              {xpPct > 0 && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-bone/30"
                  style={{ left: `${xpPct * 100}%` }}
                />
              )}
            </div>
            <div className="font-mono text-[10px] text-bone/55 tabular-nums min-w-[60px] text-right">
              <span className="text-cobalt-bright font-bold">{state.xp}</span>
              <span className="text-bone/30"> / {state.xpToNext}</span>
            </div>
          </div>

          {/* Lineage commitment row */}
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <LineageMeterHud scores={getLineageScores(state)} perks={state.lineagePerks} />
          </div>

          {/* Weapons + passives */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {state.weapons.map((w) => {
              const m = getMeta(w.id)!
              const cdProgress = w.cooldownMax > 0 ? 1 - w.cooldownLeft / w.cooldownMax : 1
              return (
                <SlotChip
                  key={w.id}
                  short={m.short}
                  level={w.level}
                  max={m.maxLevel}
                  color={m.color}
                  kind="weapon"
                  isEvolution={m.isEvolution}
                  cooldown={cdProgress}
                />
              )
            })}
            {state.passives.map((p) => {
              const m = getMeta(p.id)!
              return (
                <SlotChip
                  key={p.id}
                  short={m.short}
                  level={p.level}
                  max={m.maxLevel}
                  color={m.color}
                  kind="passive"
                />
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

function AchievementToasts({
  toasts,
}: {
  toasts: { key: number; def: AchievementDef; bornAt: number }[]
}) {
  if (toasts.length === 0) return null
  return (
    <div className="absolute top-24 right-4 md:right-6 flex flex-col gap-2 pointer-events-none z-40">
      {toasts.slice(-3).map((t) => {
        const age = performance.now() - t.bornAt
        const fadeOut = age > 4000 ? 1 - (age - 4000) / 500 : 1
        return (
          <div
            key={t.key}
            className="bg-ink/95 backdrop-blur-md border border-lime/50 rounded-[3px] px-4 py-3 min-w-[260px] shadow-[0_8px_24px_rgba(0,0,0,0.5)] animate-rise-in"
            style={{
              opacity: fadeOut,
              transition: 'opacity 0.3s',
              boxShadow: '0 0 24px rgba(175,240,72,0.3)',
            }}
          >
            <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.3em] uppercase text-lime font-bold">
              ★ achievement
              {(t.def.rewardCredits ?? 0) > 0 && (
                <span className="ml-auto text-cobalt-bright">+{t.def.rewardCredits}c</span>
              )}
            </div>
            <div className="mt-1.5 font-bold text-bone text-[14px] leading-tight">{t.def.name}</div>
            <div className="mt-0.5 text-[11px] text-bone/65 leading-snug">{t.def.desc}</div>
          </div>
        )
      })}
    </div>
  )
}

function CornerBrackets() {
  const stroke = 'rgba(40,100,255,0.35)'
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%' }}
    >
      <path d="M 1 6 L 1 1 L 6 1" stroke={stroke} strokeWidth="0.15" fill="none" vectorEffect="non-scaling-stroke" />
      <path d="M 94 1 L 99 1 L 99 6" stroke={stroke} strokeWidth="0.15" fill="none" vectorEffect="non-scaling-stroke" />
      <path d="M 99 94 L 99 99 L 94 99" stroke={stroke} strokeWidth="0.15" fill="none" vectorEffect="non-scaling-stroke" />
      <path d="M 6 99 L 1 99 L 1 94" stroke={stroke} strokeWidth="0.15" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function DamageArrow({ dir, alpha }: { dir: { x: number; y: number }; alpha: number }) {
  // Arrow at screen edge pointing toward damage source. dir is from-source-to-player.
  // We invert so arrow points toward the source.
  const ang = Math.atan2(-dir.y, -dir.x)
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div
        style={{
          width: '78vmin',
          height: '78vmin',
          opacity: alpha * 0.85,
          transform: `rotate(${ang}rad)`,
          transformOrigin: 'center',
        }}
        className="relative"
      >
        <div
          className="absolute"
          style={{
            right: '-2%',
            top: '50%',
            transform: 'translateY(-50%)',
            width: 0,
            height: 0,
            borderLeft: '14px solid #ff4d6d',
            borderTop: '10px solid transparent',
            borderBottom: '10px solid transparent',
            filter: 'drop-shadow(0 0 6px rgba(255,77,109,0.7))',
          }}
        />
      </div>
    </div>
  )
}

function BossBar({
  boss,
}: {
  boss: { hp: number; maxHp: number; bossPhase?: number; kind: string }
}) {
  const pct = Math.max(0, boss.hp / boss.maxHp)
  const bossName =
    boss.kind === 'lysate'
      ? 'LYSATE'
      : boss.kind === 'mirrorPlasmid'
        ? 'MIRROR PLASMID'
        : 'PRION'
  const phaseLabel = boss.bossPhase === 0 ? 'PHASE I' : boss.bossPhase === 1 ? 'PHASE II — SUMMONS' : 'PHASE III — ENRAGED'
  return (
    <div className="pointer-events-auto bg-ink/90 backdrop-blur-md rounded-[4px] px-5 py-3 border border-contam/40 min-w-[440px] max-w-[600px]"
      style={{ boxShadow: '0 0 32px rgba(255,77,109,0.25)' }}
    >
      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.25em] uppercase">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-contam animate-pulse" />
          <span className="text-contam font-bold">{bossName}</span>
        </div>
        <div className="text-bone/55">{phaseLabel}</div>
        <div className="text-bone/55 tabular-nums">
          {Math.max(0, Math.ceil(boss.hp))} / {Math.ceil(boss.maxHp)}
        </div>
      </div>
      <div className="mt-2 relative h-3 bg-bone/10 rounded-[2px] overflow-hidden border border-bone/10">
        <div
          className="h-full bg-gradient-to-r from-[#7f1d1d] via-[#dc2626] to-[#ff4d6d] transition-[width] duration-200"
          style={{ width: `${pct * 100}%` }}
        />
        {/* Phase markers at 33% and 66% */}
        <div className="absolute top-0 bottom-0 w-px bg-bone/40" style={{ left: '33.3%' }} />
        <div className="absolute top-0 bottom-0 w-px bg-bone/40" style={{ left: '66.6%' }} />
      </div>
    </div>
  )
}

interface WavePhase {
  index: number
  label: string
}

function wavePhase(time: number): WavePhase {
  if (time < 25) return { index: 1, label: 'BACTERIA' }
  if (time < 60) return { index: 2, label: 'PLASMIDS' }
  if (time < 110) return { index: 3, label: 'RADICALS' }
  if (time < 170) return { index: 4, label: 'DENATURANTS' }
  if (time < 230) return { index: 5, label: 'SHOOTERS' }
  if (time < 300) return { index: 6, label: 'PEAK' }
  if (time < 380) return { index: 7, label: 'ELITE' }
  return { index: 8, label: 'CLIMAX' }
}

function comboColor(combo: number): string {
  if (combo >= 25) return '#ff6ad8'
  if (combo >= 15) return '#fbbf24'
  if (combo >= 8) return '#aff048'
  return '#7ab0ff'
}

function SlotChip({
  short,
  level,
  max,
  color,
  kind,
  isEvolution,
  cooldown,
}: {
  short: string
  level: number
  max: number
  color: string
  kind: 'weapon' | 'passive'
  isEvolution?: boolean
  cooldown?: number // 0..1 charge progress (1 = ready)
}) {
  const dots = Array.from({ length: max }, (_, i) => i < level)
  // Maxed weapons show solid radial; cooldown shows charging
  const showRing = kind === 'weapon' && !isEvolution
  return (
    <div
      className={`relative flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-[3px] border transition-all`}
      style={{
        background: isEvolution
          ? `linear-gradient(135deg, ${color}30, ${color}12)`
          : `${color}15`,
        borderColor: isEvolution ? color : `${color}50`,
        boxShadow: isEvolution ? `0 0 0 1px ${color}30, 0 0 12px ${color}25` : undefined,
      }}
    >
      {/* Cooldown ring around the SHORT label */}
      <div className="relative flex items-center justify-center" style={{ width: 22, height: 22 }}>
        {showRing && (
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            className="absolute inset-0"
            style={{ transform: 'rotate(-90deg)' }}
          >
            <circle cx="11" cy="11" r="9" stroke={`${color}30`} strokeWidth="1.5" fill="none" />
            <circle
              cx="11"
              cy="11"
              r="9"
              stroke={color}
              strokeWidth="1.5"
              fill="none"
              strokeDasharray={2 * Math.PI * 9}
              strokeDashoffset={(1 - Math.max(0, Math.min(1, cooldown ?? 1))) * 2 * Math.PI * 9}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 60ms linear' }}
            />
          </svg>
        )}
        <div
          className="font-mono text-[9px] font-bold tracking-[0.05em] relative z-10"
          style={{ color }}
        >
          {short}
        </div>
      </div>
      <div className="flex gap-[3px]">
        {dots.map((on, i) => (
          <div
            key={i}
            className="h-1.5 w-1.5 rounded-full transition-all"
            style={{
              background: on ? color : 'rgba(255,255,255,0.15)',
              boxShadow: on ? `0 0 4px ${color}70` : undefined,
            }}
          />
        ))}
      </div>
      {isEvolution && (
        <div
          className="font-mono text-[8px] tracking-[0.2em] uppercase font-bold"
          style={{ color }}
        >
          evo
        </div>
      )}
      {kind === 'passive' && (
        <div className="font-mono text-[8px] tracking-[0.2em] uppercase text-bone/40">aux</div>
      )}
    </div>
  )
}

const LINEAGE_ORDER: Lineage[] = ['amplify', 'contain', 'edit']

function LineageMeterHud({
  scores,
  perks,
}: {
  scores: LineageScore
  perks?: RunState['lineagePerks']
}) {
  const dom = dominantLineage(scores)
  return (
    <div className="flex items-center gap-2">
      <div className="font-mono text-[9px] tracking-[0.25em] uppercase text-bone/35">
        path
      </div>
      {LINEAGE_ORDER.map((l) => {
        const info = LINEAGES[l]
        const n = scores[l]
        const isDom = dom === l && n > 0
        const tier3 = n >= 3
        const tier5 = n >= 4
        const dots = [0, 1, 2, 3]
        return (
          <div
            key={l}
            className="flex items-center gap-1.5 rounded-[3px] px-2 py-1 transition-all"
            style={{
              background: isDom ? info.bg : 'transparent',
              border: `1px solid ${isDom ? `${info.color}60` : 'rgba(238,242,246,0.08)'}`,
            }}
          >
            <span
              className="font-mono text-[9px] tracking-[0.2em] font-bold"
              style={{ color: n > 0 ? info.color : 'rgba(238,242,246,0.35)' }}
            >
              {info.name.slice(0, 3).toUpperCase()}
            </span>
            <div className="flex gap-[2px]">
              {dots.map((i) => (
                <div
                  key={i}
                  className="rounded-full transition-all"
                  style={{
                    width: i === 2 || i === 3 ? 4 : 3,
                    height: i === 2 || i === 3 ? 4 : 3,
                    background:
                      i < n
                        ? info.color
                        : 'rgba(238,242,246,0.15)',
                    boxShadow:
                      (i === 2 && tier3) || (i === 3 && tier5)
                        ? `0 0 6px ${info.color}aa`
                        : i < n
                          ? `0 0 3px ${info.color}80`
                          : undefined,
                  }}
                />
              ))}
            </div>
            <span
              className="font-mono text-[9px] tabular-nums"
              style={{ color: n > 0 ? info.color : 'rgba(238,242,246,0.35)' }}
            >
              {n}
            </span>
          </div>
        )
      })}
      {perks && (perks.amp3 || perks.con3 || perks.edit3) && (
        <div className="ml-1 font-mono text-[8px] tracking-[0.25em] uppercase text-lime/80 font-bold animate-pulse">
          ★ tier i
        </div>
      )}
      {perks && (perks.amp5 || perks.con5 || perks.edit5) && (
        <div className="font-mono text-[8px] tracking-[0.25em] uppercase font-bold animate-pulse" style={{ color: '#fbbf24' }}>
          ★★ tier ii
        </div>
      )}
    </div>
  )
}

function LineageTreePanel({
  scores,
  preview,
}: {
  scores: LineageScore
  perks?: RunState['lineagePerks']
  preview?: Lineage | null
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {LINEAGE_ORDER.map((l) => {
        const info = LINEAGES[l]
        const n = scores[l]
        const isPreview = preview === l
        const projected = isPreview ? n + 1 : n
        const tier3 = n >= 3
        const tier5 = n >= 5
        const willHit3 = !tier3 && projected >= 3
        const willHit5 = !tier5 && projected >= 5
        return (
          <div
            key={l}
            className="relative rounded-[3px] p-3 border transition-all"
            style={{
              background: info.bg,
              borderColor: isPreview ? info.color : `${info.color}30`,
              boxShadow: isPreview ? `0 0 18px ${info.color}50` : undefined,
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="font-mono text-[10px] tracking-[0.2em] uppercase font-bold"
                style={{ color: info.color }}
              >
                {info.name}
              </span>
              <span
                className="font-mono text-[11px] font-bold tabular-nums"
                style={{ color: info.color }}
              >
                {n}
                {isPreview && <span className="opacity-60"> → {projected}</span>}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-ink/55 leading-tight">
              {info.tagline}
            </div>
            {/* Tier ladder */}
            <div className="mt-3 space-y-1">
              <TierRow
                label="Tier I"
                desc={info.bonus3}
                color={info.color}
                unlocked={tier3}
                imminent={willHit3}
              />
              <TierRow
                label="Tier II"
                desc={info.bonus5}
                color={info.color}
                unlocked={tier5}
                imminent={willHit5}
              />
            </div>
            {/* Pip ladder for the lineage */}
            <div className="mt-2 flex gap-1">
              {[0, 1, 2, 3, 4].map((i) => {
                const filled = i < n
                const previewing = isPreview && i === n
                const isTierMark = i === 2 || i === 3
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-sm"
                    style={{
                      height: isTierMark ? 4 : 2,
                      background: filled
                        ? info.color
                        : previewing
                          ? `${info.color}80`
                          : 'rgba(10,26,47,0.12)',
                      boxShadow:
                        filled && isTierMark ? `0 0 6px ${info.color}aa` : undefined,
                    }}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TierRow({
  label,
  desc,
  color,
  unlocked,
  imminent,
}: {
  label: string
  desc: string
  color: string
  unlocked?: boolean
  imminent?: boolean
}) {
  return (
    <div
      className="flex items-center gap-2 text-[10px] leading-tight"
      style={{
        color: unlocked ? color : imminent ? color : 'rgba(10,26,47,0.45)',
        opacity: unlocked || imminent ? 1 : 0.65,
      }}
    >
      <span
        className="font-mono tracking-[0.15em] uppercase font-bold w-12"
        style={{ color: unlocked || imminent ? color : 'rgba(10,26,47,0.4)' }}
      >
        {unlocked ? '★' : imminent ? '◆' : '○'} {label}
      </span>
      <span className="text-ink/60 truncate">{desc}</span>
    </div>
  )
}

function LevelUpModal({
  choices,
  state,
  onPick,
}: {
  choices: UpgradeId[]
  state: RunState
  onPick: (id: UpgradeId) => void
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const hasEvo = choices.some((id) => {
    const m = getMeta(id)
    return m?.kind === 'weapon' && m.isEvolution
  })
  const scores = getLineageScores(state)
  const previewLineage =
    hoveredIdx !== null && choices[hoveredIdx]
      ? getMeta(choices[hoveredIdx])?.lineage ?? null
      : null
  return (
    <div className="absolute inset-0 bg-ink/75 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      {/* Caustics / radial glow behind modal for atmosphere */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(74,130,255,0.18) 0%, transparent 60%)',
        }}
      />
      <div className="relative animate-rise-in">
        <div className="bg-bone text-ink rounded-[4px] w-full max-w-3xl shadow-[0_24px_60px_rgba(0,0,0,0.55)] border-2 border-cobalt overflow-hidden">
          {/* Header */}
          <div className="relative bg-ink text-bone px-6 py-4 flex items-center justify-between overflow-hidden">
            {/* Header shimmer */}
            <div
              className="absolute inset-0 pointer-events-none animate-shimmer"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(74,130,255,0.18) 45%, rgba(255,255,255,0.10) 50%, rgba(74,130,255,0.18) 55%, transparent 100%)',
                backgroundSize: '200% 100%',
              }}
            />
            <div className="relative flex items-center gap-3">
              <span className="inline-block h-2 w-2 bg-cobalt-bright rounded-full animate-pulse" />
              <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-cobalt-bright font-bold">
                {hasEvo ? 'evolution available' : 'level up'}
              </div>
              <div className="h-3 w-px bg-bone/20" />
              <div className="font-bold text-[15px]">
                Sample reached <span className="text-cobalt-bright">level {state.level}</span>
              </div>
            </div>
            <div className="relative font-mono text-[10px] tracking-[0.2em] uppercase text-bone/50">
              choose 1 of {choices.length}
            </div>
          </div>

          {/* Lineage tree panel — shows current commitment + preview */}
          <div className="px-4 pt-4">
            <div className="flex items-baseline justify-between mb-2">
              <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-ink/50">
                / your path
              </div>
              <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink/40">
                hover a card to preview
              </div>
            </div>
            <LineageTreePanel scores={scores} perks={state.lineagePerks} preview={previewLineage} />
          </div>

          {/* Cards */}
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {choices.map((id, i) => {
              const m = getMeta(id)!
              const owned =
                state.weapons.find((w) => w.id === id) ?? state.passives.find((p) => p.id === id)
              const nextLevel = (owned?.level ?? 0) + 1
              const isNew = !owned
              const isEvolution = m.kind === 'weapon' && m.isEvolution
              const lineageInfo = LINEAGES[m.lineage]
              return (
                <button
                  key={id}
                  onClick={() => onPick(id)}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() =>
                    setHoveredIdx((cur) => (cur === i ? null : cur))
                  }
                  className={`group relative text-left rounded-[3px] p-4 pl-5 overflow-hidden transition-all hover:-translate-y-1 active:translate-y-0 border-2 animate-rise-in ${
                    isEvolution
                      ? 'bg-ink text-bone'
                      : 'bg-white hover:bg-bone'
                  }`}
                  style={{
                    borderColor: isEvolution ? m.color : 'rgba(10,26,47,0.10)',
                    boxShadow: isEvolution ? `0 0 0 1px ${m.color}40, 0 0 24px ${m.color}30` : undefined,
                    animationDelay: `${i * 60}ms`,
                  }}
                >
                  {/* Left color stripe */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{ background: m.color }}
                  />
                  {/* Background tint on hover */}
                  <div
                    className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background: isEvolution
                        ? `radial-gradient(circle at 30% 0%, ${m.color}30, transparent 70%)`
                        : `radial-gradient(circle at 30% 0%, ${m.color}10, transparent 70%)`,
                    }}
                  />
                  {/* Number key badge */}
                  <div
                    className="absolute top-3 right-3 h-7 w-7 rounded-[3px] flex items-center justify-center font-mono font-bold text-[12px] border"
                    style={{
                      background: isEvolution ? `${m.color}25` : 'rgba(10,26,47,0.05)',
                      borderColor: isEvolution ? m.color : 'rgba(10,26,47,0.15)',
                      color: isEvolution ? m.color : 'rgba(10,26,47,0.55)',
                    }}
                  >
                    {i + 1}
                  </div>

                  <div className="relative">
                    <div className="flex items-center gap-2 pr-10">
                      <div
                        className="font-mono text-[10px] tracking-[0.2em] uppercase font-bold"
                        style={{ color: m.color }}
                      >
                        {m.short}
                      </div>
                      {isEvolution ? (
                        <span
                          className="font-mono text-[8px] tracking-[0.25em] font-bold px-1.5 py-0.5 rounded-sm"
                          style={{ color: '#0a1a2f', background: m.color }}
                        >
                          EVO
                        </span>
                      ) : isNew ? (
                        <span className="font-mono text-[8px] tracking-[0.2em] font-bold text-cobalt">
                          NEW
                        </span>
                      ) : (
                        <span className="font-mono text-[9px] tracking-[0.15em] text-ink/50">
                          lvl {owned?.level} → {nextLevel}
                        </span>
                      )}
                    </div>

                    <div
                      className={`mt-3 font-extrabold text-[17px] leading-[1.15] tracking-tight pr-10 ${
                        isEvolution ? 'text-bone' : 'text-ink'
                      }`}
                    >
                      {m.name}
                    </div>
                    <div
                      className={`mt-2 text-[12px] leading-relaxed ${
                        isEvolution ? 'text-bone/70' : 'text-ink/60'
                      }`}
                    >
                      {m.description(nextLevel)}
                    </div>

                    {/* Level pip preview */}
                    {!isEvolution && (
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex gap-[3px]">
                          {Array.from({ length: m.maxLevel }, (_, j) => (
                            <div
                              key={j}
                              className="h-1 w-3 rounded-sm"
                              style={{
                                background:
                                  j < nextLevel
                                    ? m.color
                                    : isEvolution
                                      ? 'rgba(238,242,246,0.18)'
                                      : 'rgba(10,26,47,0.12)',
                                boxShadow:
                                  j < nextLevel ? `0 0 4px ${m.color}80` : undefined,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-mono text-[8px] tracking-[0.25em] uppercase font-bold px-1.5 py-px rounded-sm"
                          style={{
                            color: lineageInfo.color,
                            background: lineageInfo.bg,
                            border: `1px solid ${lineageInfo.color}40`,
                          }}
                        >
                          {lineageInfo.name}
                        </span>
                        <span
                          className={`font-mono text-[9px] tracking-[0.2em] uppercase ${
                            isEvolution ? 'text-bone/45' : 'text-ink/45'
                          }`}
                        >
                          {isEvolution ? 'evolved' : m.kind === 'weapon' ? 'weapon' : 'aux'}
                        </span>
                      </div>
                      <div
                        className={`font-mono text-[10px] tracking-[0.05em] font-bold opacity-0 group-hover:opacity-100 transition-opacity ${
                          isEvolution ? 'text-bone/80' : 'text-cobalt'
                        }`}
                      >
                        select →
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="bg-ink/5 px-6 py-2.5 flex items-center justify-between font-mono text-[10px] tracking-[0.2em] uppercase text-ink/50">
            <div>press 1 · 2 · 3</div>
            <div className="text-ink/35">click to confirm</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function useCountUp(target: number, durationMs = 700, delayMs = 0): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    let startedAt = 0
    let cancelled = false
    const start = (ts: number) => {
      if (cancelled) return
      if (!startedAt) startedAt = ts
      const elapsed = ts - startedAt
      if (elapsed < delayMs) {
        raf = requestAnimationFrame(start)
        return
      }
      const t = Math.min(1, (elapsed - delayMs) / durationMs)
      // easeOutCubic
      const e = 1 - Math.pow(1 - t, 3)
      setV(Math.round(target * e))
      if (t < 1) raf = requestAnimationFrame(start)
      else setV(target)
    }
    raf = requestAnimationFrame(start)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [target, durationMs, delayMs])
  return v
}

function RunEndOverlay({
  win,
  state,
  meta,
  credits,
  runConfig,
  onContinue,
}: {
  win: boolean
  state: RunState
  meta: MetaState
  credits: number
  runConfig: RunConfig
  onContinue: () => void
}) {
  const [copied, setCopied] = useState(false)
  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const r = Math.floor(s % 60)
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  }
  const isDaily = runConfig.mode === 'daily'
  // Capture initial best-time once so subsequent meta updates don't change the verdict
  const prevBestRef = useRef(meta.bestTime)
  const isNewBest = win && state.time > prevBestRef.current

  // Animated values
  const timeSec = useCountUp(Math.floor(state.time), 800, 100)
  const animLevel = useCountUp(state.level, 600, 280)
  const animKills = useCountUp(state.kills, 900, 380)
  const animCredits = useCountUp(credits, 900, 480)

  const onShare = async () => {
    if (!isDaily || runConfig.seed === undefined) return
    audio.play('click')
    const seedStr = shortSeed(runConfig.seed)
    const lines = [
      `Particle Accelerator — Daily ${runConfig.dateKey}`,
      `Seed ${seedStr} · ${win ? '✓ Survived' : '✗ Lost'}`,
      `Time ${fmt(state.time)} · Lvl ${state.level} · ${state.kills} kills`,
      'biokea.ai',
    ]
    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="absolute inset-0 bg-ink/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
      {/* Atmospheric backdrop tinted by outcome */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: win
            ? 'radial-gradient(circle at 50% 40%, rgba(40,100,255,0.25), transparent 60%), radial-gradient(circle at 50% 60%, rgba(175,240,72,0.10), transparent 70%)'
            : 'radial-gradient(circle at 50% 50%, rgba(255,77,109,0.15), transparent 65%)',
        }}
      />

      <div className="relative animate-rise-in">
        <div className="bg-bone text-ink rounded-[4px] w-full max-w-xl shadow-[0_28px_72px_rgba(0,0,0,0.55)] overflow-hidden">
          {/* Header */}
          <div
            className="relative px-6 py-4 flex items-center justify-between overflow-hidden"
            style={{ background: win ? '#2864ff' : '#0a1a2f', color: '#eef2f6' }}
          >
            {win && (
              <div
                className="absolute inset-0 pointer-events-none animate-shimmer"
                style={{
                  background:
                    'linear-gradient(90deg, transparent 0%, rgba(175,240,72,0.18) 45%, rgba(255,255,255,0.18) 50%, rgba(175,240,72,0.18) 55%, transparent 100%)',
                  backgroundSize: '200% 100%',
                }}
              />
            )}
            <div className="relative flex items-center gap-3">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  win ? 'bg-lime' : 'bg-contam'
                } animate-pulse`}
              />
              <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-bone/70 font-bold">
                {win ? 'readout complete' : 'sample compromised'}
              </div>
            </div>
            <div className="relative flex items-center gap-2">
              {isNewBest && (
                <span
                  className="font-mono text-[9px] tracking-[0.25em] uppercase font-bold px-2 py-0.5 rounded-sm"
                  style={{ background: '#aff048', color: '#0a1a2f' }}
                >
                  ★ new best
                </span>
              )}
              {isDaily && runConfig.seed !== undefined && (
                <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-lime font-bold">
                  daily · {shortSeed(runConfig.seed)}
                </div>
              )}
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-baseline gap-3">
              <div className="font-extrabold tracking-tight text-3xl md:text-4xl leading-tight">
                {win ? 'You held the sample.' : 'The sample was lost.'}
              </div>
            </div>
            <div className="mt-2 text-ink/60 text-[14px]">
              {win
                ? 'The prion was excised. The readout will be clean.'
                : 'The contaminants overwhelmed your countermeasures. Re-injection available.'}
            </div>

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
              <Cell
                label="time"
                value={fmt(timeSec)}
                highlight={isNewBest}
                delay={0}
              />
              <Cell label="level" value={String(animLevel)} delay={80} />
              <Cell label="kills" value={String(animKills)} delay={160} />
              <Cell
                label="credits"
                value={`+${animCredits}c`}
                highlight
                accent
                delay={240}
              />
            </div>

            {state.comboPeak >= 5 && (
              <div className="mt-3 flex items-center justify-between bg-bone border border-ink/10 rounded-[3px] px-3 py-2 animate-rise-in" style={{ animationDelay: '320ms' }}>
                <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-ink/45">
                  peak combo
                </span>
                <span
                  className="font-mono text-[14px] font-bold tabular-nums"
                  style={{ color: comboColor(state.comboPeak) }}
                >
                  ×{state.comboPeak}
                </span>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={onContinue}
                className="px-6 py-3 bg-cobalt text-white font-bold text-[13px] tracking-[0.02em] rounded-[3px] shadow-[0_3px_0_#0a1a2f] hover:translate-y-[1px] hover:shadow-[0_2px_0_#0a1a2f] active:translate-y-[2px] transition-all"
              >
                {win ? 'Continue →' : 'Back to lab'}
              </button>
              {isDaily && (
                <button
                  onClick={onShare}
                  className="px-6 py-3 bg-lime text-ink font-bold text-[13px] tracking-[0.02em] rounded-[3px] hover:brightness-110 transition-all"
                >
                  {copied ? '✓ Copied' : 'Share daily run'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Cell({
  label,
  value,
  highlight,
  accent,
  delay = 0,
}: {
  label: string
  value: string
  highlight?: boolean
  accent?: boolean
  delay?: number
}) {
  return (
    <div
      className={`relative overflow-hidden p-3 rounded-[3px] border animate-rise-in ${
        accent ? 'bg-ink border-ink' : highlight ? 'bg-lime/15 border-lime/50' : 'bg-white border-ink/10'
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={`text-[9px] tracking-[0.25em] uppercase ${
          accent ? 'text-cobalt-bright/80' : highlight ? 'text-lime' : 'text-ink/45'
        }`}
      >
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-bold tabular-nums ${
          accent ? 'text-cobalt-bright' : 'text-ink'
        }`}
      >
        {value}
      </div>
    </div>
  )
}
