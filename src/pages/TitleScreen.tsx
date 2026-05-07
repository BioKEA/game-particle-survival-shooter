import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import type { MetaState, RunState } from '@/game/types'
import { audio } from '@/game/audio'
import { applyUpgrade, createInitialState, render, update } from '@/game/engine'
import { getSample } from '@/game/samples'
import { WEAPON_META } from '@/game/upgrades'
import { shortSeed, todayKey, todaySeed } from '@/game/rng'
import { fetchTop, loadHandle, saveHandle, type LeaderboardRow, type LeaderboardWindow } from '@/lib/daily-leaderboard'

interface TitleScreenProps {
  meta: MetaState
  onStartRun: () => void
  onStartDailyRun: () => void
  onOpenLab: () => void
  onOpenBossMode: () => void
}

export function TitleScreen({
  meta,
  onStartRun,
  onStartDailyRun,
  onOpenLab,
  onOpenBossMode,
}: TitleScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [muted, setMuted] = useState(() => audio.isMuted())
  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    audio.setMuted(next)
    try {
      localStorage.setItem('pa:muted', next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  // Engine-driven attract-mode preview — runs the actual game with a scripted
  // AI controlling the sample so the chamber shows real gameplay.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    audio.setSuppressed(true)

    let raf = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const buildState = (): RunState => {
      const demoMeta: MetaState = {
        credits: 0,
        totalRuns: 0,
        bestTime: 0,
        wins: 0,
        unlockedSamples: ['wildType'],
        activeSample: 'wildType',
        unlockedWeapons: ['pcr', 'centrifuge', 'crispr', 'antibody'],
        permUpgrades: { maxHp: 0, damage: 0, speed: 0, pickup: 0 },
        dailyRecords: {},
        achievements: [],
        tier2Reached: [],
        evolutionsTriggered: [],
        bossRecords: {},
        endlessRecord: 0,
        onboarded: true,
      }
      const s = createInitialState(demoMeta)
      // Keep the preview honest about daily mode: only use weapons +
      // levels a player would reasonably see in the first ~30s of an
      // actual daily run. Earlier preview applied stirBar + buffer
      // passives (which produce the spinning orange swirl) and L3 PCR
      // + L2 centrifuge — visuals that didn't match what daily-mode
      // players actually see, since daily resets passives + activeSample
      // to the wildType + pcr-only baseline. Now just PCR L2 + early
      // centrifuge so what they see in attract mode = what they see
      // when they play.
      applyUpgrade(s, 'pcr')
      applyUpgrade(s, 'pcr')
      applyUpgrade(s, 'centrifuge')
      s.time = 35
      return s
    }

    let state = buildState()
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now

      const px = state.player.pos
      let avoidX = 0
      let avoidY = 0
      let crowd = 0
      for (const e of state.enemies) {
        const dx = e.pos.x - px.x
        const dy = e.pos.y - px.y
        const d = Math.hypot(dx, dy)
        if (d < 110 && d > 0) {
          avoidX -= dx / d
          avoidY -= dy / d
          crowd++
        }
      }
      const t = now / 1000
      const wanderX = Math.cos(t * 0.55 + Math.sin(t * 0.18) * 1.6)
      const wanderY = Math.sin(t * 0.42 + Math.cos(t * 0.27) * 1.4)
      if (crowd > 0) {
        const wf = Math.max(0, 1 - crowd / 4)
        state.input.analog = {
          x: avoidX / crowd + wanderX * wf * 0.4,
          y: avoidY / crowd + wanderY * wf * 0.4,
        }
      } else {
        state.input.analog = { x: wanderX, y: wanderY }
      }

      update(state, dt)

      if (state.status === 'levelup' && state.pendingChoices.length > 0) {
        const id = state.pendingChoices[Math.floor(Math.random() * state.pendingChoices.length)]
        applyUpgrade(state, id)
      }

      if (state.player.hp < state.player.maxHp * 0.7) {
        state.player.hp = state.player.maxHp
      }

      if (state.status !== 'running') {
        state = buildState()
      }

      const rect = canvas.getBoundingClientRect()
      render(ctx, state, rect.width, rect.height)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onResize = () => resize()
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      audio.setSuppressed(false)
    }
  }, [])

  const fmtTime = (s: number) => {
    if (s <= 0) return '——:——'
    const m = Math.floor(s / 60)
    const r = Math.floor(s % 60)
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  }

  const seed = todaySeed()
  const dayKey = todayKey()
  const dailyRecord = meta.dailyRecords[dayKey]

  return (
    <div className="min-h-screen flex flex-col bg-bone text-ink">
      {/* Header bar */}
      <header className="px-6 md:px-10 py-4 md:py-5 flex items-center justify-between bg-ink text-bone">
        <div className="flex items-center gap-3">
          <div className="relative h-6 w-6 rounded-[3px] bg-cobalt">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-bone" />
          </div>
          <div className="font-bold tracking-tight text-base md:text-lg">biokea.ai</div>
        </div>
        <button
          onClick={toggleMute}
          className="text-bone/50 hover:text-bone transition-colors"
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </header>

      {/* Hero */}
      <main className="flex-1 px-6 md:px-10 pt-10 md:pt-14 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 max-w-[1400px] mx-auto w-full">
          {/* Left: title + copy */}
          <div className="lg:col-span-7">
            <div className="flex items-center gap-2 font-mono text-[11px] md:text-xs tracking-[0.25em] uppercase text-cobalt font-medium">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cobalt animate-pulse" />
              survival run · ~8 min · single sample
            </div>
            <h1 className="mt-4 md:mt-5 font-extrabold tracking-tight text-[56px] sm:text-[72px] md:text-[88px] leading-[0.92]">
              Particle
              <br />
              Accelerator
              <span className="text-cobalt">.</span>
            </h1>
            <p className="mt-5 md:mt-6 max-w-lg text-[15px] md:text-base leading-relaxed text-ink/70">
              You are the sample, hurtling through the collider. Dodge contamination. Amplify your
              lab tech. Hold to the readout.
            </p>

            {/* Stats strip */}
            <div className="mt-7 grid grid-cols-3 gap-2 md:gap-3 max-w-md font-mono">
              <Stat label="runs" value={String(meta.totalRuns)} />
              <Stat label="best" value={fmtTime(meta.bestTime)} />
              <Stat label="credits" value={`${meta.credits}c`} highlight />
            </div>

            {/* Active sample chip — also the route into Lab. */}
            {(() => {
              const s = getSample(meta.activeSample)
              const sw = WEAPON_META[s.starterWeapon]
              return (
                <button
                  onClick={onOpenLab}
                  className="mt-7 group inline-flex items-center gap-3 bg-white border border-ink/15 hover:border-cobalt rounded-[3px] pl-3 pr-4 py-2.5 transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="relative">
                    <div
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ background: s.color, boxShadow: `0 0 12px ${s.color}` }}
                    />
                    <div
                      className="absolute inset-0 rounded-full animate-ping"
                      style={{ background: `${s.color}80`, animationDuration: '2.5s' }}
                    />
                  </div>
                  <div className="text-left">
                    <div className="font-mono text-[9px] tracking-[0.25em] uppercase text-ink/45">
                      active sample · tap to swap
                    </div>
                    <div className="font-bold text-[13px] -mt-0.5">
                      {s.name} <span className="text-ink/30">/</span>{' '}
                      <span style={{ color: sw.color }}>{sw.short}</span>
                    </div>
                  </div>
                  <div className="ml-3 font-mono text-[9px] tracking-[0.2em] uppercase text-cobalt group-hover:translate-x-1 transition-transform">
                    →
                  </div>
                </button>
              )
            })()}

            {/* Buttons — primary CTA is the run that posts to the daily leaderboard. */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={onStartDailyRun}
                className="group relative px-7 md:px-8 py-3.5 bg-cobalt text-white font-bold text-sm tracking-[0.02em] rounded-[3px] shadow-[0_4px_0_#0a1a2f] hover:translate-y-[1px] hover:shadow-[0_3px_0_#0a1a2f] active:translate-y-[3px] active:shadow-[0_1px_0_#0a1a2f] transition-all"
              >
                <span className="flex items-center gap-2">
                  Inject daily sample <span className="font-mono text-[11px]">→</span>
                </span>
              </button>
              <button
                onClick={onStartRun}
                className="px-6 md:px-7 py-3.5 bg-transparent border border-ink text-ink font-semibold text-[13px] rounded-[3px] hover:bg-ink hover:text-bone transition-colors"
              >
                Casual run
              </button>
              {meta.wins > 0 && (
                <button
                  onClick={onOpenBossMode}
                  className="px-6 md:px-7 py-3.5 bg-transparent border-2 border-contam text-contam font-bold text-[13px] rounded-[3px] hover:bg-contam hover:text-bone transition-colors flex items-center gap-2"
                >
                  Boss arena <span className="font-mono text-[11px]">→</span>
                </button>
              )}
            </div>
            <div className="mt-3 font-mono text-[10px] tracking-[0.2em] uppercase text-ink/45">
              [wasd] move · auto-fires · daily run posts to the leaderboard →
            </div>
          </div>

          {/* Right: chamber preview + daily summary */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="relative bg-ink rounded-[4px] p-3 md:p-4 text-bone overflow-hidden">
              <div className="flex items-center justify-between mb-2 font-mono text-[10px] tracking-[0.2em] uppercase">
                <span className="text-cobalt-bright flex items-center gap-2">
                  <span className="inline-block h-1 w-1 rounded-full bg-cobalt-bright animate-pulse" />
                  chamber A · live
                </span>
                <span className="text-bone/50">seed {shortSeed(seed)}</span>
              </div>
              <div className="relative aspect-[4/3] sm:aspect-[5/3] rounded-[2px] border border-cobalt/30 overflow-hidden">
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
              </div>
            </div>

            {/* Today's leaderboard — particle-only top times for the current
                daily seed. The previous "View leaderboard ↗" link to the
                cross-game biokea.ai page was dropped in favor of in-game
                visibility into this game's own standings. */}
            <div
              className="rounded-[4px] p-4"
              style={{
                background: '#0a1a2f',
                color: '#eef2f6',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-lime font-bold flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-lime animate-pulse" />
                  daily seed
                </div>
                <div className="font-mono text-[10px] tracking-[0.15em] text-bone/55 uppercase">{dayKey}</div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="bg-bone/5 border border-bone/10 rounded-[2px] p-2 font-mono">
                  <div className="text-[9px] tracking-[0.2em] uppercase text-bone/50">your run</div>
                  <div className="mt-0.5 text-[14px] font-bold text-bone tabular-nums">
                    {dailyRecord ? (
                      <>
                        {fmtTime(dailyRecord.time)}{' '}
                        <span
                          className={`text-[10px] ${dailyRecord.outcome === 'won' ? 'text-lime' : 'text-contam'}`}
                        >
                          {dailyRecord.outcome === 'won' ? '✓ won' : '✗ lost'}
                        </span>
                      </>
                    ) : (
                      <span className="text-bone/40">——:——</span>
                    )}
                  </div>
                </div>
                <div className="bg-bone/5 border border-bone/10 rounded-[2px] p-2 font-mono">
                  <div className="text-[9px] tracking-[0.2em] uppercase text-bone/50">level</div>
                  <div className="mt-0.5 text-[14px] font-bold text-bone tabular-nums">
                    {dailyRecord?.level ?? <span className="text-bone/40">—</span>}
                  </div>
                </div>
              </div>
              <DailyTopPanel day={dayKey} />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`p-3 rounded-[3px] border ${
        highlight ? 'bg-ink border-ink' : 'bg-white border-ink/15'
      }`}
    >
      <div
        className={`text-[9px] tracking-[0.25em] uppercase ${
          highlight ? 'text-cobalt-bright/80' : 'text-ink/45'
        }`}
      >
        {label}
      </div>
      <div className={`mt-1 text-xl md:text-[22px] font-bold ${highlight ? 'text-cobalt-bright' : 'text-ink'}`}>
        {value}
      </div>
    </div>
  )
}

function fmtClock(s: number): string {
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

function DailyTopPanel({ day }: { day: string }) {
  const [view, setView] = useState<LeaderboardWindow>('today')
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [handle, setHandle] = useState<string>(() => loadHandle() ?? '')
  const [editingHandle, setEditingHandle] = useState(false)
  const [handleDraft, setHandleDraft] = useState('')
  const handleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingHandle) handleInputRef.current?.focus()
  }, [editingHandle])

  function commitHandle() {
    const saved = saveHandle(handleDraft)
    if (saved) setHandle(saved)
    setEditingHandle(false)
  }

  useEffect(() => {
    let cancelled = false
    setRows(null)
    setError(null)
    fetchTop(view, day, 5)
      .then((r) => {
        if (!cancelled) setRows(r)
      })
      .catch(() => {
        if (!cancelled) setError("can't reach leaderboard")
      })
    return () => {
      cancelled = true
    }
  }, [day, view])

  const eyebrow =
    view === 'today' ? 'top times today' : view === 'week' ? 'last 7 days' : 'all-time'

  return (
    <div className="mt-3 bg-bone/[0.04] border border-bone/10 rounded-[2px] p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="font-mono text-[9px] tracking-[0.25em] uppercase text-bone/55">
          {eyebrow}
        </div>
        <div className="flex items-center gap-0.5">
          {(['today', 'week', 'all'] as const).map((w) => (
            <button
              key={w}
              onClick={() => setView(w)}
              className={`text-[8px] uppercase tracking-[0.18em] font-mono px-1.5 py-0.5 rounded-[2px] transition-colors ${
                view === w
                  ? 'bg-lime/15 text-lime'
                  : 'text-bone/40 hover:text-bone/70'
              }`}
            >
              {w === 'today' ? 'today' : w === 'week' ? 'week' : 'all'}
            </button>
          ))}
        </div>
      </div>

      {rows === null && !error && (
        <div className="text-center text-[10px] font-mono text-bone/40 py-2">loading…</div>
      )}
      {error && (
        <div className="text-center text-[10px] font-mono text-contam/80 py-2">{error}</div>
      )}
      {rows && rows.length === 0 && (
        <div className="text-center text-[10px] font-mono text-bone/40 py-2">
          {view === 'today' ? 'no scores yet · be the first' : 'no scores yet'}
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {rows.map((r, i) => (
            <div
              key={r.id}
              className={`flex items-center justify-between font-mono text-[11px] px-2 py-1 rounded-[2px] ${
                r.isYou ? 'bg-lime/15 text-lime' : 'text-bone/75'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-4 text-right text-bone/40">{i + 1}</span>
                <span className="truncate">{r.handle}</span>
                <span
                  className={`text-[9px] uppercase ${
                    r.outcome === 'won' ? 'text-lime/80' : 'text-bone/30'
                  }`}
                >
                  {r.outcome === 'won' ? '✓' : ''}
                </span>
              </div>
              <span className="tabular-nums">{fmtClock(r.time)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Handle editor */}
      <div className="mt-3 pt-3 border-t border-bone/10 flex items-center justify-between gap-2 font-mono">
        <span className="text-[9px] tracking-[0.2em] uppercase text-bone/40">your handle</span>
        {editingHandle ? (
          <div className="flex items-center gap-1">
            <input
              ref={handleInputRef}
              value={handleDraft}
              onChange={(e) => setHandleDraft(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitHandle() }
                if (e.key === 'Escape') { e.preventDefault(); setEditingHandle(false) }
                e.stopPropagation()
              }}
              placeholder="handle"
              maxLength={16}
              className="w-28 bg-bone/10 border border-bone/20 rounded-[2px] px-2 py-0.5 text-[11px] text-bone font-mono focus:outline-none focus:border-lime/60"
            />
            <button
              onClick={commitHandle}
              className="text-[9px] uppercase tracking-[0.15em] text-lime hover:text-lime/70 px-1"
            >
              save
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setHandleDraft(handle); setEditingHandle(true) }}
            className="flex items-center gap-1.5 text-[11px] text-bone/70 hover:text-bone transition-colors group"
          >
            <span>{handle || <span className="text-bone/30 italic">not set</span>}</span>
            <span className="text-bone/25 text-[9px] group-hover:text-bone/50 transition-colors">✎</span>
          </button>
        )}
      </div>
    </div>
  )
}
