import type { MetaState, SampleId, WeaponId } from '@/game/types'
import { WEAPON_META } from '@/game/upgrades'
import { ALL_SAMPLE_IDS, getSample } from '@/game/samples'
import { ACHIEVEMENTS, achievementGroups } from '@/game/achievements'
import { audio } from '@/game/audio'

type StatId = 'maxHp' | 'damage' | 'speed' | 'pickup'

interface StatDef {
  id: StatId
  name: string
  short: string
  description: (level: number) => string
  costs: number[]
}

const STATS: StatDef[] = [
  {
    id: 'maxHp',
    name: 'Reinforced Membrane',
    short: 'HP',
    description: (lvl) => `+${lvl * 10} starting HP`,
    costs: [60, 120, 220, 380, 600],
  },
  {
    id: 'damage',
    name: 'Reagent Concentration',
    short: 'DMG',
    description: (lvl) => `+${lvl * 5}% base damage`,
    costs: [80, 160, 280, 460, 720],
  },
  {
    id: 'speed',
    name: 'Hydrodynamic Profile',
    short: 'SPD',
    description: (lvl) => `+${lvl * 4}% movement speed`,
    costs: [70, 140, 250, 420, 660],
  },
  {
    id: 'pickup',
    name: 'Magnetic Cilium',
    short: 'PICK',
    description: (lvl) => `+${lvl * 15}% pickup radius`,
    costs: [50, 100, 180, 300, 500],
  },
]

const WEAPON_UNLOCK_ORDER: { id: WeaponId; cost: number }[] = [
  { id: 'centrifuge', cost: 250 },
  { id: 'crispr', cost: 350 },
  { id: 'antibody', cost: 500 },
  { id: 'cryoVial', cost: 650 },
  { id: 'electrophoresis', cost: 900 },
  { id: 'massSpec', cost: 1200 },
]

interface LabProps {
  meta: MetaState
  onUpdateMeta: (next: MetaState) => void
  onBack: () => void
}

export function Lab({ meta, onUpdateMeta, onBack }: LabProps) {
  const purchaseStat = (id: StatId) => {
    const def = STATS.find((s) => s.id === id)!
    const lvl = meta.permUpgrades[id]
    if (lvl >= def.costs.length) return
    const cost = def.costs[lvl]
    if (meta.credits < cost) return
    audio.play('select')
    onUpdateMeta({
      ...meta,
      credits: meta.credits - cost,
      permUpgrades: { ...meta.permUpgrades, [id]: lvl + 1 },
    })
  }

  const unlockWeapon = (id: WeaponId) => {
    const entry = WEAPON_UNLOCK_ORDER.find((w) => w.id === id)
    if (!entry) return
    if (meta.unlockedWeapons.includes(id)) return
    if (meta.credits < entry.cost) return
    audio.play('select')
    onUpdateMeta({
      ...meta,
      credits: meta.credits - entry.cost,
      unlockedWeapons: [...meta.unlockedWeapons, id],
    })
  }

  const unlockSample = (id: SampleId) => {
    if (meta.unlockedSamples.includes(id)) return
    const s = getSample(id)
    if (meta.credits < s.cost) return
    audio.play('select')
    onUpdateMeta({
      ...meta,
      credits: meta.credits - s.cost,
      unlockedSamples: [...meta.unlockedSamples, id],
    })
  }

  const selectSample = (id: SampleId) => {
    if (!meta.unlockedSamples.includes(id)) return
    if (meta.activeSample === id) return
    audio.play('click')
    onUpdateMeta({ ...meta, activeSample: id })
  }

  const fmtTime = (s: number) => {
    if (s <= 0) return '——:——'
    const m = Math.floor(s / 60)
    const r = Math.floor(s % 60)
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen flex flex-col bg-bone text-ink">
      {/* Header */}
      <header className="px-6 md:px-10 py-4 md:py-5 flex items-center justify-between bg-ink text-bone">
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
          <div className="font-bold tracking-tight text-base md:text-lg">Lab Inventory</div>
        </div>
        <div className="flex items-center gap-3 md:gap-4 font-mono text-[10px] tracking-[0.2em] uppercase">
          <div className="text-bone/50">credits</div>
          <div className="text-cobalt-bright font-bold text-base tracking-normal">
            {meta.credits}c
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 px-6 md:px-10 py-8 max-w-[1400px] mx-auto w-full">
        {/* Run summary strip */}
        <section className="mb-8 grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
          <SummaryStat label="total runs" value={String(meta.totalRuns)} />
          <SummaryStat label="readouts" value={String(meta.wins)} />
          <SummaryStat label="best run" value={fmtTime(meta.bestTime)} />
          <SummaryStat
            label="weapons unlocked"
            value={`${meta.unlockedWeapons.length}/7`}
            highlight
          />
        </section>

        {/* Sample roster */}
        <section className="mb-10">
          <SectionHeader
            eyebrow="roster"
            title="Sample Selection"
            subtitle="Choose what gets injected. Each sample warps starting stats and weapon."
          />
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {ALL_SAMPLE_IDS.map((id) => {
              const s = getSample(id)
              const owned = meta.unlockedSamples.includes(id)
              const active = meta.activeSample === id
              const canBuy = !owned && meta.credits >= s.cost
              const starterMeta = WEAPON_META[s.starterWeapon]
              return (
                <button
                  key={id}
                  onClick={() => (owned ? selectSample(id) : canBuy ? unlockSample(id) : undefined)}
                  disabled={!owned && !canBuy}
                  className={`relative text-left rounded-[3px] p-4 border-2 transition-all enabled:hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                    active
                      ? 'bg-ink text-bone border-cobalt'
                      : owned
                        ? 'bg-white border-ink/15 hover:border-cobalt'
                        : 'bg-white/60 border-ink/10'
                  }`}
                >
                  {active && (
                    <div className="absolute top-2 right-2 font-mono text-[8px] tracking-[0.25em] uppercase text-cobalt-bright font-bold">
                      ◉ active
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <SampleGlyph color={s.color} shape={s.shape} />
                    <div
                      className={`font-mono text-[10px] tracking-[0.2em] uppercase font-bold`}
                      style={{ color: active ? '#4a82ff' : s.color }}
                    >
                      {s.short}
                    </div>
                  </div>
                  <div className="mt-3 font-bold text-[15px] leading-tight">{s.name}</div>
                  <div
                    className={`mt-1 text-[12px] leading-snug ${
                      active ? 'text-bone/60' : 'text-ink/55'
                    }`}
                  >
                    {s.description}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px]">
                    <Mod label="hp" value={s.hpMod === 0 ? '—' : (s.hpMod > 0 ? '+' : '') + s.hpMod} active={active} />
                    <Mod label="dmg" value={fmtMult(s.dmgMult)} active={active} />
                    <Mod label="spd" value={fmtMult(s.speedMult)} active={active} />
                    <Mod label="pick" value={fmtMult(s.pickupMult)} active={active} />
                  </div>
                  <div className="mt-3 pt-3 border-t border-current/10">
                    <div
                      className={`font-mono text-[9px] tracking-[0.2em] uppercase ${
                        active ? 'text-bone/50' : 'text-ink/45'
                      }`}
                    >
                      starter
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className="font-mono text-[10px] font-bold tracking-[0.1em]"
                        style={{ color: starterMeta?.color ?? '#aaa' }}
                      >
                        {starterMeta?.short ?? '—'}
                      </span>
                      <span
                        className={`text-[12px] font-medium ${active ? 'text-bone' : 'text-ink'}`}
                      >
                        {starterMeta?.name ?? '—'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    {owned ? (
                      <div
                        className={`font-mono text-[10px] tracking-[0.2em] uppercase font-bold ${
                          active ? 'text-cobalt-bright' : 'text-cobalt'
                        }`}
                      >
                        {active ? 'in use' : 'tap to select'}
                      </div>
                    ) : (
                      <div className="font-mono text-[11px] text-ink/60">
                        cost <span className="text-ink font-bold">{s.cost}c</span>
                      </div>
                    )}
                    {!owned && (
                      <div
                        className="font-mono text-[10px] tracking-[0.2em] uppercase font-bold"
                        style={{ color: canBuy ? '#2864ff' : 'rgba(10,26,47,0.4)' }}
                      >
                        {canBuy ? 'tap to unlock' : 'locked'}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
          {/* Permanent upgrades */}
          <section>
            <SectionHeader
              eyebrow="ladder"
              title="Permanent Upgrades"
              subtitle="Carries across every run."
            />
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {STATS.map((s) => {
                const lvl = meta.permUpgrades[s.id]
                const max = s.costs.length
                const nextCost = lvl < max ? s.costs[lvl] : null
                const canBuy = nextCost !== null && meta.credits >= nextCost
                return (
                  <div
                    key={s.id}
                    className="bg-white border border-ink/10 rounded-[3px] p-4 flex flex-col"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-[10px] tracking-[0.2em] uppercase font-bold text-cobalt">
                        {s.short}
                      </div>
                      <div className="font-mono text-[10px] tracking-[0.15em] text-ink/45">
                        {lvl}/{max}
                      </div>
                    </div>
                    <div className="mt-2 font-bold leading-tight">{s.name}</div>
                    <div className="mt-1 text-[12px] text-ink/60 leading-snug">
                      {s.description(Math.max(1, lvl + 1))}
                    </div>
                    {/* Pip ladder */}
                    <div className="mt-3 flex gap-1">
                      {Array.from({ length: max }, (_, i) => (
                        <div
                          key={i}
                          className="flex-1 h-1.5 rounded-sm"
                          style={{
                            background: i < lvl ? '#2864ff' : 'rgba(10,26,47,0.1)',
                          }}
                        />
                      ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="font-mono text-[11px] text-ink/60">
                        {nextCost === null ? (
                          <span className="text-cobalt font-bold">MAXED</span>
                        ) : (
                          <>
                            cost <span className="text-ink font-bold">{nextCost}c</span>
                          </>
                        )}
                      </div>
                      <button
                        disabled={!canBuy}
                        onClick={() => purchaseStat(s.id)}
                        className="px-3 py-1.5 font-bold text-[11px] tracking-[0.05em] uppercase rounded-[2px] transition-all disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:translate-y-[-1px]"
                        style={{
                          background: canBuy ? '#2864ff' : '#0a1a2f',
                          color: '#eef2f6',
                        }}
                      >
                        {nextCost === null ? '—' : 'Upgrade'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Weapon armory */}
          <section>
            <SectionHeader
              eyebrow="armory"
              title="Lab Tech Unlocks"
              subtitle="Adds weapons to the level-up pool."
            />
            <div className="mt-5 space-y-2">
              {/* Always-on PCR */}
              <WeaponRow
                name={WEAPON_META.pcr.name}
                short={WEAPON_META.pcr.short}
                color={WEAPON_META.pcr.color}
                description="Default loadout — always available."
                state="owned"
                cost={0}
                onClick={() => {}}
              />
              {WEAPON_UNLOCK_ORDER.map((entry) => {
                const m = WEAPON_META[entry.id]
                const owned = meta.unlockedWeapons.includes(entry.id)
                const canBuy = !owned && meta.credits >= entry.cost
                return (
                  <WeaponRow
                    key={entry.id}
                    name={m.name}
                    short={m.short}
                    color={m.color}
                    description={m.description(1)}
                    state={owned ? 'owned' : canBuy ? 'avail' : 'locked'}
                    cost={entry.cost}
                    onClick={() => unlockWeapon(entry.id)}
                  />
                )
              })}
            </div>
          </section>
        </div>

        {/* Achievements */}
        <section className="mt-12">
          <SectionHeader
            eyebrow="archive"
            title="Achievements"
            subtitle={`${meta.achievements.length} / ${ACHIEVEMENTS.length} unlocked.`}
          />
          <div className="mt-5 space-y-6">
            {achievementGroups().map((group) => (
              <div key={group.label}>
                <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-ink/50 mb-2">
                  / {group.label}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {group.ids.map((id) => {
                    const def = ACHIEVEMENTS.find((a) => a.id === id)
                    if (!def) return null
                    const unlocked = meta.achievements.includes(id)
                    const showHidden = def.hidden && !unlocked
                    return (
                      <div
                        key={id}
                        className={`rounded-[3px] p-3 border ${
                          unlocked
                            ? 'bg-white border-cobalt/40'
                            : 'bg-bone/60 border-ink/10 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-[13px] leading-tight">
                            {showHidden ? '???' : def.name}
                          </div>
                          {unlocked && (
                            <span
                              className="font-mono text-[8px] tracking-[0.25em] uppercase font-bold px-1.5 py-px rounded-sm"
                              style={{ background: '#aff048', color: '#0a1a2f' }}
                            >
                              ★
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[11px] text-ink/55 leading-snug">
                          {showHidden ? 'Hidden until unlocked.' : def.desc}
                        </div>
                        {(def.rewardCredits ?? 0) > 0 && (
                          <div className="mt-2 font-mono text-[9px] tracking-[0.2em] uppercase text-cobalt/70">
                            reward: {def.rewardCredits}c
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="px-6 md:px-10 py-5 border-t border-ink/10 max-w-[1400px] mx-auto w-full flex items-center justify-between">
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/45">
          credits earned per run · time + kills + boss bonus
        </div>
        <button
          onClick={() => {
            audio.play('click')
            onBack()
          }}
          className="px-6 py-3 bg-ink text-bone font-bold text-[13px] rounded-[3px] hover:bg-cobalt transition-colors"
        >
          Back to title →
        </button>
      </footer>
    </div>
  )
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string
  title: string
  subtitle: string
}) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-cobalt font-medium">
        / {eyebrow}
      </div>
      <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight">{title}</h2>
      <div className="mt-1 text-[13px] text-ink/55">{subtitle}</div>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={`p-3 rounded-[3px] border ${
        highlight ? 'bg-ink border-ink' : 'bg-white border-ink/10'
      }`}
    >
      <div
        className={`text-[9px] tracking-[0.25em] uppercase ${
          highlight ? 'text-cobalt-bright/80' : 'text-ink/45'
        }`}
      >
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold ${highlight ? 'text-cobalt-bright' : 'text-ink'}`}>
        {value}
      </div>
    </div>
  )
}

function SampleGlyph({ color, shape }: { color: string; shape: string }) {
  const sz = 18
  if (shape === 'ring') {
    return (
      <div
        style={{
          width: sz,
          height: sz,
          borderRadius: '50%',
          border: `3px solid ${color}`,
          background: 'transparent',
        }}
      />
    )
  }
  if (shape === 'crystal') {
    return (
      <div
        style={{
          width: sz,
          height: sz,
          background: color,
          clipPath: 'polygon(50% 0%, 100% 35%, 80% 100%, 20% 100%, 0% 35%)',
        }}
      />
    )
  }
  if (shape === 'square') {
    return <div style={{ width: sz, height: sz, background: color, borderRadius: 3 }} />
  }
  return (
    <div
      style={{
        width: sz,
        height: sz,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 12px ${color}aa`,
      }}
    />
  )
}

function fmtMult(m: number): string {
  if (m === 1) return '—'
  const pct = Math.round((m - 1) * 100)
  return `${pct > 0 ? '+' : ''}${pct}%`
}

function Mod({ label, value, active }: { label: string; value: string; active?: boolean }) {
  const pos = !value.startsWith('-') && value !== '—'
  const neg = value.startsWith('-')
  const color = pos ? '#34d399' : neg ? '#ff4d6d' : active ? 'rgba(238,242,246,0.5)' : 'rgba(10,26,47,0.45)'
  return (
    <span style={{ color }} className="tracking-[0.05em] uppercase">
      {label} <span className="font-bold">{value}</span>
    </span>
  )
}

function WeaponRow({
  name,
  short,
  color,
  description,
  state,
  cost,
  onClick,
}: {
  name: string
  short: string
  color: string
  description: string
  state: 'owned' | 'avail' | 'locked'
  cost: number
  onClick: () => void
}) {
  return (
    <div
      className="bg-white border border-ink/10 rounded-[3px] p-3 flex items-center gap-4"
      style={{
        borderLeftWidth: '3px',
        borderLeftColor: color,
      }}
    >
      <div
        className="font-mono text-[11px] tracking-[0.15em] font-bold"
        style={{ color, minWidth: 36 }}
      >
        {short}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{name}</div>
        <div className="text-[12px] text-ink/55 truncate">{description}</div>
      </div>
      {state === 'owned' && (
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-cobalt font-bold">
          ◉ owned
        </div>
      )}
      {state !== 'owned' && (
        <div className="flex items-center gap-3">
          <div className="font-mono text-[11px] text-ink/60">
            <span className="text-ink font-bold">{cost}c</span>
          </div>
          <button
            disabled={state === 'locked'}
            onClick={onClick}
            className="px-3 py-1.5 font-bold text-[11px] tracking-[0.05em] uppercase rounded-[2px] transition-all disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:translate-y-[-1px]"
            style={{
              background: state === 'avail' ? '#2864ff' : '#0a1a2f',
              color: '#eef2f6',
            }}
          >
            {state === 'avail' ? 'Unlock' : 'Locked'}
          </button>
        </div>
      )}
    </div>
  )
}
