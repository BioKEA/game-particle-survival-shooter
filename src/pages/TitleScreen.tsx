import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import type { MetaState, RunState } from '@/game/types'
import { audio } from '@/game/audio'
import { applyUpgrade, createInitialState, render, update } from '@/game/engine'
import { getSample } from '@/game/samples'
import { WEAPON_META } from '@/game/upgrades'
import { shortSeed, todayKey, todaySeed } from '@/game/rng'

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

    // Suppress engine SFX while the demo loop is alive
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
      // Bootstrap a richer loadout so the preview has visual variety from the start
      applyUpgrade(s, 'pcr')
      applyUpgrade(s, 'pcr')
      applyUpgrade(s, 'pcr')
      applyUpgrade(s, 'centrifuge')
      applyUpgrade(s, 'centrifuge')
      applyUpgrade(s, 'stirBar')
      applyUpgrade(s, 'stirBar')
      applyUpgrade(s, 'buffer')
      // Skip the early-game hazard / treasure ramp so the preview stays clean
      // by starting the demo a bit "into" a run
      s.time = 35
      return s
    }

    let state = buildState()
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now

      // Scripted AI: smooth lissajous wander; flee if too crowded
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

      // Auto-resolve any level-ups; demo never blocks
      if (state.status === 'levelup' && state.pendingChoices.length > 0) {
        const id = state.pendingChoices[Math.floor(Math.random() * state.pendingChoices.length)]
        applyUpgrade(state, id)
      }

      // Keep the demo player alive — top up HP, give iframes if they get hit
      if (state.player.hp < state.player.maxHp * 0.7) {
        state.player.hp = state.player.maxHp
      }

      // Reset on any non-running status (shouldn't happen with HP topping)
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

  return (
    <div className="min-h-screen flex flex-col bg-bone text-ink relative">
      {/* Subtle dot grid background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.5]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(10,26,47,0.08) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />
      {/* Corner brackets — subtle frame */}
      <CornerFrame />

      {/* Header bar */}
      <header className="relative px-6 md:px-10 py-4 md:py-5 flex items-center justify-between bg-ink text-bone z-10">
        <div className="flex items-center gap-3 animate-reveal-from-left" style={{ animationDelay: '0ms' }}>
          <div className="relative h-6 w-6 rounded-[3px] bg-cobalt">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-bone" />
          </div>
          <div className="font-bold tracking-tight text-base md:text-lg">biokea.ai</div>
          <div className="hidden md:block h-3 w-px bg-bone/20" />
          <div className="hidden md:block font-mono text-[10px] tracking-[0.2em] uppercase text-bone/45">
            agent-driven bioinformatics OS
          </div>
        </div>
        <div className="flex items-center gap-3 md:gap-5 animate-reveal-from-left" style={{ animationDelay: '60ms' }}>
          <button
            onClick={toggleMute}
            className="text-bone/50 hover:text-bone transition-colors"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <div className="font-mono text-[10px] md:text-[11px] tracking-[0.2em] uppercase text-cobalt-bright">
            collider/04 · build 2.1.7
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="relative flex-1 px-6 md:px-10 pt-10 md:pt-14 pb-6 z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 max-w-[1400px] mx-auto w-full">
          {/* Left: title + copy */}
          <div className="lg:col-span-7">
            <div
              className="flex items-center gap-2 font-mono text-[11px] md:text-xs tracking-[0.25em] uppercase text-cobalt font-medium animate-rise-in"
              style={{ animationDelay: '120ms' }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cobalt animate-pulse" />
              survival run · ~8 min · single sample
            </div>
            <h1
              className="mt-4 md:mt-5 font-extrabold tracking-tight text-[56px] sm:text-[72px] md:text-[88px] leading-[0.92] animate-rise-in"
              style={{ animationDelay: '200ms' }}
            >
              Particle
              <br />
              Accelerator
              <span className="text-cobalt">.</span>
            </h1>
            <p
              className="mt-5 md:mt-6 max-w-lg text-[15px] md:text-base leading-relaxed text-ink/70 animate-rise-in"
              style={{ animationDelay: '320ms' }}
            >
              You are the sample, hurtling through the collider. Dodge contamination. Amplify your
              lab tech. Hold to the readout.
            </p>

            {/* Stats strip */}
            <div
              className="mt-7 grid grid-cols-3 gap-2 md:gap-3 max-w-md font-mono animate-rise-in"
              style={{ animationDelay: '420ms' }}
            >
              <Stat label="runs" value={String(meta.totalRuns)} />
              <Stat label="best" value={fmtTime(meta.bestTime)} />
              <Stat label="credits" value={`${meta.credits}c`} highlight />
            </div>

            {/* Active sample chip */}
            {(() => {
              const s = getSample(meta.activeSample)
              const sw = WEAPON_META[s.starterWeapon]
              return (
                <button
                  onClick={onOpenLab}
                  className="mt-7 group inline-flex items-center gap-3 bg-white border border-ink/15 hover:border-cobalt rounded-[3px] pl-3 pr-4 py-2.5 transition-all hover:-translate-y-0.5 hover:shadow-md animate-rise-in"
                  style={{ animationDelay: '500ms' }}
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
                      active sample
                    </div>
                    <div className="font-bold text-[13px] -mt-0.5">
                      {s.name} <span className="text-ink/30">/</span>{' '}
                      <span style={{ color: sw.color }}>{sw.short}</span>
                    </div>
                  </div>
                  <div className="ml-3 font-mono text-[9px] tracking-[0.2em] uppercase text-cobalt group-hover:translate-x-1 transition-transform">
                    swap →
                  </div>
                </button>
              )
            })()}

            {/* Buttons */}
            <div
              className="mt-6 flex flex-wrap items-center gap-3 animate-rise-in"
              style={{ animationDelay: '580ms' }}
            >
              <button
                onClick={onStartRun}
                className="group relative px-7 md:px-8 py-3.5 bg-cobalt text-white font-bold text-sm tracking-[0.02em] rounded-[3px] shadow-[0_4px_0_#0a1a2f] hover:translate-y-[1px] hover:shadow-[0_3px_0_#0a1a2f] active:translate-y-[3px] active:shadow-[0_1px_0_#0a1a2f] transition-all overflow-hidden"
              >
                <span
                  className="absolute inset-0 pointer-events-none animate-shimmer opacity-30"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                    backgroundSize: '200% 100%',
                  }}
                />
                <span className="relative flex items-center gap-2">
                  Inject sample <span className="font-mono text-[11px]">→</span>
                </span>
              </button>
              <button
                onClick={onOpenLab}
                className="px-6 md:px-7 py-3.5 bg-transparent border border-ink text-ink font-semibold text-[13px] rounded-[3px] hover:bg-ink hover:text-bone transition-colors"
              >
                Lab inventory
              </button>
              {meta.wins > 0 && (
                <button
                  onClick={onOpenBossMode}
                  className="px-6 md:px-7 py-3.5 bg-transparent border-2 border-contam text-contam font-bold text-[13px] rounded-[3px] hover:bg-contam hover:text-bone transition-colors flex items-center gap-2"
                >
                  Boss Arena <span className="font-mono text-[11px]">→</span>
                </button>
              )}
              <div className="ml-1 font-mono text-[10px] tracking-[0.2em] uppercase text-ink/50 hidden sm:block">
                [wasd] move · auto-fires
              </div>
            </div>
          </div>

          {/* Right: chamber preview + daily */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div
              className="relative bg-ink rounded-[4px] p-3 md:p-4 text-bone overflow-hidden animate-rise-in"
              style={{ animationDelay: '300ms' }}
            >
              <div className="flex items-center justify-between mb-2 font-mono text-[10px] tracking-[0.2em] uppercase">
                <span className="text-cobalt-bright flex items-center gap-2">
                  <span className="inline-block h-1 w-1 rounded-full bg-cobalt-bright animate-pulse" />
                  chamber A · live
                </span>
                <span className="text-bone/50">seed 21A88</span>
              </div>
              <div className="relative aspect-[4/3] sm:aspect-[5/3] rounded-[2px] border border-cobalt/30 overflow-hidden">
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
                {/* Subtle scanline overlay */}
                <div
                  className="absolute inset-0 pointer-events-none opacity-30"
                  style={{
                    background:
                      'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.18) 3px, rgba(0,0,0,0) 4px)',
                  }}
                />
                {/* Corner crosshair marks */}
                <CrossHairMarks />
              </div>
              <div className="mt-2 flex items-center justify-between font-mono text-[10px] tracking-[0.15em] uppercase">
                <span className="text-cobalt-bright">
                  {meta.wins > 0 ? `${meta.wins} readouts` : 'no readouts yet'}
                </span>
                <span className="text-bone/50">awaiting injection</span>
              </div>
            </div>

            {/* Daily seed card */}
            <div className="animate-rise-in" style={{ animationDelay: '460ms' }}>
              <DailyCard meta={meta} onStartDailyRun={onStartDailyRun} />
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 px-6 md:px-10 py-5 border-t border-ink/10 max-w-[1400px] mx-auto w-full">
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.2em] uppercase text-ink/50">
            <span>a survival study</span>
            <span className="text-ink/20">/</span>
            <span>biokea.ai</span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px] tracking-[0.2em] uppercase text-ink/50">
            <span>i. dodge</span>
            <span className="text-ink/20">·</span>
            <span>ii. amplify</span>
            <span className="text-ink/20">·</span>
            <span>iii. survive</span>
          </div>
        </div>
        {/* Sequence ticker */}
        <div className="mt-3 overflow-hidden">
          <SequenceTicker />
        </div>
      </footer>
    </div>
  )
}

function CornerFrame() {
  // Four small angle marks at the corners of the viewport
  const stroke = '#0a1a2f'
  const Mark = ({ style }: { style: React.CSSProperties }) => (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      style={style}
      className="absolute pointer-events-none opacity-40"
    >
      <path d="M 1 7 L 1 1 L 7 1" stroke={stroke} strokeWidth="1.5" fill="none" />
    </svg>
  )
  return (
    <>
      <Mark style={{ top: 8, left: 8 }} />
      <Mark style={{ top: 8, right: 8, transform: 'scaleX(-1)' }} />
      <Mark style={{ bottom: 8, left: 8, transform: 'scaleY(-1)' }} />
      <Mark style={{ bottom: 8, right: 8, transform: 'scale(-1, -1)' }} />
    </>
  )
}

function CrossHairMarks() {
  const c = 'rgba(74,130,255,0.55)'
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {/* Center crosshair */}
      <line x1="50" y1="46" x2="50" y2="54" stroke={c} strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
      <line x1="46" y1="50" x2="54" y2="50" stroke={c} strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
      {/* Corner ticks */}
      <line x1="2" y1="2" x2="6" y2="2" stroke={c} strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
      <line x1="2" y1="2" x2="2" y2="6" stroke={c} strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
      <line x1="98" y1="2" x2="94" y2="2" stroke={c} strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
      <line x1="98" y1="2" x2="98" y2="6" stroke={c} strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
      <line x1="2" y1="98" x2="6" y2="98" stroke={c} strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
      <line x1="2" y1="98" x2="2" y2="94" stroke={c} strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
      <line x1="98" y1="98" x2="94" y2="98" stroke={c} strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
      <line x1="98" y1="98" x2="98" y2="94" stroke={c} strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function SequenceTicker() {
  // Pseudo "biological data ticker" — DNA bases drifting left
  const seq = useRef<string>('')
  if (!seq.current) {
    const bases = ['A', 'C', 'G', 'T']
    let s = ''
    for (let i = 0; i < 240; i++) s += bases[Math.floor(Math.random() * 4)]
    seq.current = s
  }
  return (
    <div className="relative h-3 overflow-hidden font-mono text-[9px] tracking-[0.4em] text-ink/25">
      <div
        className="absolute whitespace-nowrap will-change-transform"
        style={{
          animation: 'pa-ticker 60s linear infinite',
        }}
      >
        {seq.current} {seq.current}
      </div>
      <style>{`
        @keyframes pa-ticker {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}

function DailyCard({
  meta,
  onStartDailyRun,
}: {
  meta: MetaState
  onStartDailyRun: () => void
}) {
  const seed = todaySeed()
  const key = todayKey()
  const record = meta.dailyRecords[key]
  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60)
    const r = Math.floor(s % 60)
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  }
  return (
    <div
      className="rounded-[4px] p-4"
      style={{
        background: '#0a1a2f',
        color: '#eef2f6',
        backgroundImage:
          'linear-gradient(135deg, rgba(40,100,255,0.18), transparent 50%), linear-gradient(225deg, rgba(175,240,72,0.10), transparent 60%)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-lime font-bold flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-lime animate-pulse" />
          daily seed
        </div>
        <div className="font-mono text-[10px] tracking-[0.15em] text-bone/55 uppercase">{key}</div>
      </div>
      <div className="mt-3 font-mono font-bold text-cobalt-bright text-2xl tabular-nums tracking-tight">
        {shortSeed(seed)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="bg-bone/5 border border-bone/10 rounded-[2px] p-2 font-mono">
          <div className="text-[9px] tracking-[0.2em] uppercase text-bone/50">your run</div>
          <div className="mt-0.5 text-[14px] font-bold text-bone tabular-nums">
            {record ? (
              <>
                {fmtTime(record.time)}{' '}
                <span
                  className={`text-[10px] ${record.outcome === 'won' ? 'text-lime' : 'text-contam'}`}
                >
                  {record.outcome === 'won' ? '✓ won' : '✗ lost'}
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
            {record?.level ?? <span className="text-bone/40">—</span>}
          </div>
        </div>
      </div>
      <button
        onClick={onStartDailyRun}
        className="mt-3 w-full px-4 py-2.5 bg-lime text-ink font-bold text-[12px] tracking-[0.05em] uppercase rounded-[2px] hover:brightness-110 transition-all"
      >
        {record ? 'replay daily' : 'inject daily sample'}
      </button>
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
