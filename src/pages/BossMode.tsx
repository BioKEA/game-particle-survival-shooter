import type { BossId, MetaState } from '@/game/types'
import { audio } from '@/game/audio'

export interface BossDef {
  id: BossId
  name: string
  short: string
  tagline: string
  description: string
  color: string
  /** Achievement / record gate — null means unlocked from start once Boss Mode is open */
  prerequisite: BossId | null
}

export const BOSSES: BossDef[] = [
  {
    id: 'prion',
    name: 'Prion',
    short: 'PRN',
    tagline: 'Cube of corrupted protein.',
    description:
      'The main-game final boss. Three phases: stalks the chamber, summons mycoplasma at 66%, summons endotoxin at 33%.',
    color: '#7f1d1d',
    prerequisite: null,
  },
  {
    id: 'lysate',
    name: 'Lysate',
    short: 'LYS',
    tagline: 'Mass cell rupture.',
    description:
      'Massive denaturant body. Periodically expels child blobs. Becomes faster and more violent as it loses mass.',
    color: '#9f1239',
    prerequisite: 'prion',
  },
  {
    id: 'mirrorPlasmid',
    name: 'Mirror Plasmid',
    short: 'MRR',
    tagline: 'Reflected sample, hostile.',
    description:
      'A duplicate of your own sample running on inverted firmware. Fires back at you with a stolen kit.',
    color: '#a855f7',
    prerequisite: 'lysate',
  },
]

interface BossModeProps {
  meta: MetaState
  onStartBoss: (id: BossId) => void
  onStartEndless: () => void
  onBack: () => void
}

export function BossMode({ meta, onStartBoss, onStartEndless, onBack }: BossModeProps) {
  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60)
    const r = Math.floor(s % 60)
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  }

  const isUnlocked = (b: BossDef): boolean => {
    if (!b.prerequisite) return true
    return meta.bossRecords[b.prerequisite] !== undefined
  }

  const allBossesDefeated = BOSSES.every((b) => meta.bossRecords[b.id] !== undefined)

  return (
    <div className="min-h-screen flex flex-col bg-bone text-ink relative">
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.5]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(10,26,47,0.08) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      <header className="relative px-6 md:px-10 py-4 md:py-5 flex items-center justify-between bg-ink text-bone z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              audio.play('click')
              onBack()
            }}
            className="font-mono text-[10px] tracking-[0.2em] uppercase text-cobalt-bright hover:text-bone transition-colors"
          >
            ← back
          </button>
          <div className="h-4 w-px bg-bone/20" />
          <div className="font-bold tracking-tight text-base md:text-lg">Boss Arena</div>
        </div>
        <div className="flex items-center gap-3 md:gap-4 font-mono text-[10px] tracking-[0.2em] uppercase">
          <span className="text-bone/45">defeated</span>
          <span className="text-cobalt-bright font-bold text-base tracking-normal">
            {Object.keys(meta.bossRecords).length} / {BOSSES.length}
          </span>
        </div>
      </header>

      <main className="relative flex-1 px-6 md:px-10 py-8 max-w-[1400px] mx-auto w-full z-10">
        <div className="flex items-baseline gap-3 mb-2">
          <div className="font-mono text-[11px] md:text-xs tracking-[0.25em] uppercase text-contam font-medium flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-contam animate-pulse" />
            isolated encounters
          </div>
        </div>
        <h1 className="font-extrabold tracking-tight text-[40px] sm:text-[56px] md:text-[68px] leading-[0.92]">
          Boss Arena<span className="text-contam">.</span>
        </h1>
        <p className="mt-4 max-w-xl text-[14px] md:text-[15px] leading-relaxed text-ink/70">
          Focused fights against the chamber's worst contaminants. Pick a target. Bring your active
          sample's loadout. No waves — just you and them.
        </p>

        <section className="mt-10">
          <SectionHeader eyebrow="bosses" title="Choose your encounter" />
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {BOSSES.map((b) => {
              const unlocked = isUnlocked(b)
              const record = meta.bossRecords[b.id]
              const beaten = record !== undefined
              return (
                <button
                  key={b.id}
                  onClick={() => unlocked && onStartBoss(b.id)}
                  disabled={!unlocked}
                  className={`group relative text-left rounded-[3px] p-5 border-2 overflow-hidden transition-all enabled:hover:-translate-y-1 disabled:cursor-not-allowed ${
                    unlocked ? 'bg-ink text-bone' : 'bg-ink/30 text-bone/40'
                  }`}
                  style={{
                    borderColor: unlocked ? b.color : 'rgba(10,26,47,0.15)',
                    boxShadow: unlocked
                      ? `0 0 0 1px ${b.color}40, 0 0 24px ${b.color}25`
                      : undefined,
                  }}
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1.5"
                    style={{ background: unlocked ? b.color : 'rgba(238,242,246,0.1)' }}
                  />
                  {unlocked && (
                    <div
                      className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{
                        background: `radial-gradient(circle at 30% 0%, ${b.color}30, transparent 70%)`,
                      }}
                    />
                  )}

                  <div className="relative">
                    <div className="flex items-center justify-between">
                      <div
                        className="font-mono text-[10px] tracking-[0.25em] uppercase font-bold"
                        style={{ color: unlocked ? b.color : 'rgba(238,242,246,0.3)' }}
                      >
                        {b.short}
                      </div>
                      {beaten ? (
                        <span
                          className="font-mono text-[8px] tracking-[0.25em] uppercase font-bold px-1.5 py-0.5 rounded-sm"
                          style={{ background: '#aff048', color: '#0a1a2f' }}
                        >
                          ★ defeated
                        </span>
                      ) : !unlocked ? (
                        <span className="font-mono text-[8px] tracking-[0.25em] uppercase text-bone/40">
                          locked
                        </span>
                      ) : (
                        <span
                          className="font-mono text-[8px] tracking-[0.2em] uppercase font-bold animate-pulse"
                          style={{ color: b.color }}
                        >
                          ●  ready
                        </span>
                      )}
                    </div>

                    <div className="mt-3 font-extrabold text-[20px] leading-[1.1]">
                      {unlocked ? b.name : '???'}
                    </div>
                    <div
                      className="mt-1 font-mono text-[10px] tracking-[0.15em] italic"
                      style={{ color: unlocked ? `${b.color}c0` : 'rgba(238,242,246,0.3)' }}
                    >
                      {unlocked ? b.tagline : 'Defeat the previous boss to unlock.'}
                    </div>
                    {unlocked && (
                      <div className="mt-3 text-[12px] leading-relaxed text-bone/65">
                        {b.description}
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-t border-bone/10 flex items-center justify-between font-mono text-[10px]">
                      <div className="text-bone/40 tracking-[0.2em] uppercase">best</div>
                      <div className="font-bold tabular-nums" style={{ color: unlocked ? '#fbbf24' : 'rgba(238,242,246,0.3)' }}>
                        {record !== undefined ? fmtTime(record) : '——:——'}
                      </div>
                    </div>
                    {unlocked && (
                      <div className="mt-3 font-mono text-[10px] tracking-[0.15em] uppercase font-bold opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: b.color }}>
                        engage →
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* Endless mode */}
        <section className="mt-12">
          <SectionHeader eyebrow="endless" title="Until you fall" />
          <div
            className="mt-5 relative rounded-[3px] p-6 border-2 overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(10,26,47,1) 0%, rgba(127,29,29,0.4) 100%)',
              borderColor: allBossesDefeated ? '#fbbf24' : 'rgba(10,26,47,0.2)',
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center">
              <div>
                <div
                  className="font-mono text-[10px] tracking-[0.3em] uppercase font-bold"
                  style={{ color: allBossesDefeated ? '#fbbf24' : 'rgba(238,242,246,0.4)' }}
                >
                  ∞ endless mode
                </div>
                <div className="mt-2 font-extrabold text-bone text-[28px] leading-tight">
                  Unbounded Survival
                </div>
                <div className="mt-2 text-bone/70 text-[13px] leading-relaxed max-w-xl">
                  Standard run, no boss to end it. Waves keep escalating until the sample is lost.
                  Your run starts at t=0; the prion never spawns. Best record carries across runs.
                </div>
                {!allBossesDefeated && (
                  <div className="mt-3 font-mono text-[10px] tracking-[0.2em] uppercase text-bone/45">
                    locked — defeat all {BOSSES.length} bosses to unlock
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="text-right">
                  <div className="font-mono text-[9px] tracking-[0.25em] uppercase text-bone/40">
                    your record
                  </div>
                  <div
                    className="font-bold text-[28px] tabular-nums leading-none"
                    style={{ color: allBossesDefeated ? '#fbbf24' : 'rgba(238,242,246,0.3)' }}
                  >
                    {meta.endlessRecord > 0 ? fmtTime(meta.endlessRecord) : '——:——'}
                  </div>
                </div>
                <button
                  onClick={() => allBossesDefeated && onStartEndless()}
                  disabled={!allBossesDefeated}
                  className="px-6 py-3 font-bold text-[13px] tracking-[0.05em] uppercase rounded-[3px] disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:translate-y-[-1px] transition-all"
                  style={{
                    background: allBossesDefeated ? '#fbbf24' : 'rgba(238,242,246,0.1)',
                    color: allBossesDefeated ? '#0a1a2f' : 'rgba(238,242,246,0.4)',
                  }}
                >
                  {allBossesDefeated ? 'Begin endless' : 'Locked'}
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 px-6 md:px-10 py-5 border-t border-ink/10 max-w-[1400px] mx-auto w-full">
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/45">
          beat each boss to unlock the next · clear the slate to unlock endless
        </div>
      </footer>
    </div>
  )
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-cobalt font-medium">
        / {eyebrow}
      </div>
      <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight">{title}</h2>
    </div>
  )
}
