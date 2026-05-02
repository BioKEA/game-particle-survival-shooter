import { useState } from 'react'
import { audio } from '@/game/audio'

interface Step {
  eyebrow: string
  title: string
  body: string
  diagram?: 'controls' | 'levelup' | 'lineage' | 'evolution'
}

const STEPS: Step[] = [
  {
    eyebrow: 'briefing — i / iv',
    title: 'You are the sample.',
    body: 'You move with WASD or arrow keys. Weapons fire automatically at the nearest contaminant. Survive 8 minutes to reach the readout and beat the prion boss.',
    diagram: 'controls',
  },
  {
    eyebrow: 'briefing — ii / iv',
    title: 'Level up. Pick your kit.',
    body: 'Killing contaminants drops XP gems. Walk over them. Each level-up offers three options — new weapons, level-ups for what you have, or aux modules that boost stats. Press 1, 2, or 3 to pick.',
    diagram: 'levelup',
  },
  {
    eyebrow: 'briefing — iii / iv',
    title: 'Commit to a path.',
    body: 'Every upgrade belongs to one of three lineages — Amplify (damage), Contain (control), or Edit (precision). Three items in one lineage unlocks Tier I; four unlocks Tier II. The roll favors your committed path.',
    diagram: 'lineage',
  },
  {
    eyebrow: 'briefing — iv / iv',
    title: 'Evolve. Win. Repeat.',
    body: 'Max out a weapon and own its matching passive — they fuse into a stronger evolved variant. Beat the prion to unlock Boss Arena. Earn credits, spend them in the Lab, push your record.',
    diagram: 'evolution',
  },
]

interface OnboardingProps {
  onComplete: (startRun?: boolean) => void
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0)
  const cur = STEPS[step]
  const isLast = step === STEPS.length - 1

  const next = () => {
    audio.play('click')
    if (isLast) onComplete(true)
    else setStep(step + 1)
  }
  const prev = () => {
    audio.play('click')
    setStep(Math.max(0, step - 1))
  }
  const skip = () => {
    audio.play('click')
    onComplete(false)
  }

  return (
    <div className="fixed inset-0 bg-ink/85 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(circle at 50% 50%, rgba(74,130,255,0.18), transparent 60%)',
      }} />
      <div className="relative bg-bone text-ink rounded-[4px] w-full max-w-2xl shadow-[0_28px_72px_rgba(0,0,0,0.6)] overflow-hidden animate-rise-in">
        {/* Header */}
        <div className="bg-ink text-bone px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-block h-2 w-2 bg-cobalt-bright rounded-full animate-pulse" />
            <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-cobalt-bright font-bold">
              {cur.eyebrow}
            </div>
          </div>
          <button
            onClick={skip}
            className="font-mono text-[10px] tracking-[0.2em] uppercase text-bone/50 hover:text-bone transition-colors"
          >
            skip ⏭
          </button>
        </div>

        {/* Body */}
        <div className="p-8">
          <div className="font-extrabold text-[28px] md:text-[34px] leading-[1.05] tracking-tight">
            {cur.title}
          </div>
          <p className="mt-3 text-[14px] md:text-[15px] leading-relaxed text-ink/70 max-w-lg">
            {cur.body}
          </p>

          {/* Diagram */}
          <div className="mt-6">
            {cur.diagram === 'controls' && <ControlsDiagram />}
            {cur.diagram === 'levelup' && <LevelUpDiagram />}
            {cur.diagram === 'lineage' && <LineageDiagram />}
            {cur.diagram === 'evolution' && <EvolutionDiagram />}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-ink/5 px-6 py-3 flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="h-1 rounded-sm transition-all"
                style={{
                  width: i === step ? 24 : 8,
                  background: i <= step ? '#2864ff' : 'rgba(10,26,47,0.15)',
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={prev}
                className="px-4 py-2 font-mono text-[11px] tracking-[0.05em] uppercase text-ink/55 hover:text-ink"
              >
                ← back
              </button>
            )}
            <button
              onClick={next}
              className="px-6 py-2.5 bg-cobalt text-white font-bold text-[12px] tracking-[0.05em] uppercase rounded-[3px] shadow-[0_3px_0_#0a1a2f] hover:translate-y-[1px] hover:shadow-[0_2px_0_#0a1a2f] transition-all"
            >
              {isLast ? 'Inject sample →' : 'Continue →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ControlsDiagram() {
  return (
    <div className="bg-ink rounded-[3px] p-5 flex items-center gap-6 text-bone">
      <div className="flex flex-col items-center gap-1">
        <div className="grid grid-cols-3 gap-1">
          <div />
          <KeyCap label="W" />
          <div />
          <KeyCap label="A" />
          <KeyCap label="S" />
          <KeyCap label="D" />
        </div>
        <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-bone/50 mt-2">
          move
        </div>
      </div>
      <div className="text-bone/30 text-[20px]">/</div>
      <div className="flex-1">
        <div className="text-[12px] leading-relaxed text-bone/70">
          Movement is the only thing you control. Your weapons{' '}
          <span className="text-cobalt-bright">auto-fire</span> at the nearest enemy on a cooldown.
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-cobalt" style={{ boxShadow: '0 0 8px #4a82ff' }} />
          <div className="font-mono text-[10px] text-bone/55">that's you</div>
        </div>
      </div>
    </div>
  )
}

function LevelUpDiagram() {
  return (
    <div className="bg-ink rounded-[3px] p-5 text-bone">
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3'].map((n) => (
          <div
            key={n}
            className="bg-bone/5 border border-cobalt/30 rounded-[3px] p-3 relative"
          >
            <div className="absolute top-2 right-2 h-5 w-5 rounded-[3px] bg-cobalt/25 border border-cobalt flex items-center justify-center font-mono font-bold text-[10px] text-cobalt">
              {n}
            </div>
            <div className="font-mono text-[8px] tracking-[0.2em] uppercase text-cobalt-bright font-bold">
              PCR
            </div>
            <div className="mt-2 font-bold text-[11px] leading-tight">PCR Amplifier</div>
            <div className="font-mono text-[8px] tracking-[0.15em] uppercase text-bone/40 mt-1">
              weapon
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 font-mono text-[10px] tracking-[0.2em] uppercase text-bone/50 text-center">
        press 1 · 2 · 3 — choose carefully
      </div>
    </div>
  )
}

function LineageDiagram() {
  return (
    <div className="bg-ink rounded-[3px] p-5 text-bone">
      <div className="grid grid-cols-3 gap-3">
        <LineageCol name="AMPLIFY" color="#ff6b6b" tagline="damage" />
        <LineageCol name="CONTAIN" color="#5eead4" tagline="control" />
        <LineageCol name="EDIT" color="#c084fc" tagline="precision" />
      </div>
      <div className="mt-3 text-[11px] text-bone/65 leading-snug">
        Once you own 2 in one lineage, the rolls favor it heavily. Your starting sample sets your
        first commitment.
      </div>
    </div>
  )
}

function LineageCol({ name, color, tagline }: { name: string; color: string; tagline: string }) {
  return (
    <div className="rounded-[3px] p-3" style={{ background: `${color}15`, border: `1px solid ${color}40` }}>
      <div className="font-mono text-[9px] tracking-[0.2em] font-bold" style={{ color }}>
        {name}
      </div>
      <div className="font-mono text-[9px] tracking-[0.15em] uppercase text-bone/55 mt-1">
        {tagline}
      </div>
      <div className="mt-3 flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              height: i === 2 || i === 3 ? 4 : 2,
              background: i < 2 ? color : 'rgba(238,242,246,0.15)',
            }}
          />
        ))}
      </div>
      <div className="mt-2 font-mono text-[8px] text-bone/50 leading-tight">
        ★ Tier I @ 3<br />
        ★★ Tier II @ 4
      </div>
    </div>
  )
}

function EvolutionDiagram() {
  return (
    <div className="bg-ink rounded-[3px] p-5 text-bone flex items-center gap-3">
      <Pill short="PCR" color="#5eead4" />
      <div className="font-mono text-[14px] text-bone/40">+</div>
      <Pill short="BUF" color="#f87171" />
      <div className="font-mono text-[18px] text-cobalt-bright">→</div>
      <Pill short="qPCR" color="#06b6d4" big />
      <div className="ml-3 text-[11px] text-bone/65 leading-snug">
        Max-level weapon + matching passive = an{' '}
        <span className="font-bold text-cobalt-bright">evolution</span>. Different shape, much
        stronger.
      </div>
    </div>
  )
}

function Pill({ short, color, big }: { short: string; color: string; big?: boolean }) {
  return (
    <div
      className="rounded-[3px] px-2.5 py-1.5 font-mono font-bold text-[10px] tracking-[0.15em]"
      style={{
        background: big ? `linear-gradient(135deg, ${color}40, ${color}15)` : `${color}20`,
        border: `${big ? 2 : 1}px solid ${color}`,
        color,
        boxShadow: big ? `0 0 16px ${color}50` : undefined,
      }}
    >
      {short}
    </div>
  )
}

function KeyCap({ label }: { label: string }) {
  return (
    <div className="h-9 w-9 rounded-[3px] border border-cobalt/40 bg-cobalt/10 flex items-center justify-center font-mono font-bold text-[14px] text-cobalt-bright">
      {label}
    </div>
  )
}
