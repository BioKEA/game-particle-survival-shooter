import type { BossId, Lineage, MetaState, RunState, WeaponId } from './types'
import { LINEAGES } from './upgrades'

export interface AchievementDef {
  id: string
  name: string
  desc: string
  hidden?: boolean
  // What rewards (if any) unlocking this triggers
  rewardCredits?: number
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // First milestones
  { id: 'first_kill', name: 'First Contact', desc: 'Eliminate your first contaminant.', rewardCredits: 10 },
  { id: 'first_levelup', name: 'Adapted', desc: 'Reach level 2.', rewardCredits: 10 },
  { id: 'first_run', name: 'Initiated', desc: 'Survive your first injection.', rewardCredits: 25 },
  { id: 'first_win', name: 'Clean Readout', desc: 'Beat the prion boss.', rewardCredits: 100 },

  // Lineage commitment
  { id: 'tier1_amp', name: 'Amplification', desc: 'Reach Tier I in Amplify.', rewardCredits: 50 },
  { id: 'tier1_con', name: 'Containment', desc: 'Reach Tier I in Contain.', rewardCredits: 50 },
  { id: 'tier1_edit', name: 'Precision', desc: 'Reach Tier I in Edit.', rewardCredits: 50 },
  { id: 'tier2_any', name: 'Pure Path', desc: 'Reach Tier II in any single lineage.', rewardCredits: 100 },
  { id: 'tier2_all', name: 'Polymath', desc: 'Reach Tier II in all three lineages (across runs).', rewardCredits: 200 },

  // Combat extremes
  { id: 'combo_50', name: 'Cascade', desc: 'Hit a ×50 kill combo.', rewardCredits: 75 },
  { id: 'combo_100', name: 'Critical Mass', desc: 'Hit a ×100 kill combo.', rewardCredits: 150 },
  { id: 'kills_500', name: 'Sterile Field', desc: 'Reach 500 kills in a single run.', rewardCredits: 75 },
  { id: 'kills_1000', name: 'Total Decontam', desc: 'Reach 1000 kills in a single run.', rewardCredits: 150 },

  // Skill / dodge
  { id: 'no_damage', name: 'Untouched', desc: 'Survive 2 minutes without taking damage.', rewardCredits: 100, hidden: true },
  { id: 'win_low_hp', name: 'On the Edge', desc: 'Win with under 10% HP remaining.', rewardCredits: 75, hidden: true },

  // Evolutions
  { id: 'first_evolution', name: 'Evolved', desc: 'Trigger any weapon evolution.', rewardCredits: 50 },
  { id: 'all_evolutions', name: 'Apex Researcher', desc: 'Trigger every evolution (across runs).', rewardCredits: 300, hidden: true },

  // Treasure
  { id: 'treasure_collect', name: 'Reward Substrate', desc: 'Collect a treasure chest.', rewardCredits: 25 },

  // Boss Mode (gated)
  { id: 'boss_prion', name: 'Prion Hunter', desc: 'Defeat the Prion in Boss Mode.', rewardCredits: 100 },
  { id: 'boss_lysate', name: 'Lysate Hunter', desc: 'Defeat the Lysate in Boss Mode.', rewardCredits: 150 },
  { id: 'boss_mirror', name: 'Self-Defeat', desc: 'Defeat the Mirror Plasmid in Boss Mode.', rewardCredits: 200 },
  { id: 'boss_all', name: 'Apex Researcher', desc: 'Defeat every Boss Mode boss.', rewardCredits: 500, hidden: true },

  // Endless
  { id: 'endless_3', name: 'Persistent', desc: 'Survive 3 minutes in Endless mode.', rewardCredits: 100 },
  { id: 'endless_8', name: 'Indomitable', desc: 'Survive 8 minutes in Endless mode.', rewardCredits: 250, hidden: true },
]

const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))

export function getAchievement(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_BY_ID.get(id)
}

// Tracks which achievements have been awarded during this session, so we can
// surface a "unlocked!" toast without re-awarding on every state read.
export interface AchievementCommit {
  id: string
  rewardCredits: number
}

// Pure check: returns achievement IDs that *should* be unlocked given the
// current run + meta state. Caller is responsible for committing them via
// commitAchievements (which writes to MetaState and returns granted credits).
export function checkRunAchievements(
  state: RunState,
  meta: MetaState,
  ctx: { evolutionsTriggeredThisSession?: WeaponId[]; tier2LineagesEverHit?: Lineage[] } = {},
): string[] {
  const out: string[] = []
  const owned = new Set(meta.achievements)
  const has = (id: string) => owned.has(id)

  if (state.kills > 0 && !has('first_kill')) out.push('first_kill')
  if (state.level >= 2 && !has('first_levelup')) out.push('first_levelup')
  if (state.comboPeak >= 50 && !has('combo_50')) out.push('combo_50')
  if (state.comboPeak >= 100 && !has('combo_100')) out.push('combo_100')
  if (state.kills >= 500 && !has('kills_500')) out.push('kills_500')
  if (state.kills >= 1000 && !has('kills_1000')) out.push('kills_1000')

  // Tier I per lineage
  const perks = state.lineagePerks
  if (perks?.amp3 && !has('tier1_amp')) out.push('tier1_amp')
  if (perks?.con3 && !has('tier1_con')) out.push('tier1_con')
  if (perks?.edit3 && !has('tier1_edit')) out.push('tier1_edit')
  // Tier II in any
  if ((perks?.amp5 || perks?.con5 || perks?.edit5) && !has('tier2_any')) out.push('tier2_any')
  // Tier II in all (cross-run)
  if (ctx.tier2LineagesEverHit && ctx.tier2LineagesEverHit.length >= 3 && !has('tier2_all'))
    out.push('tier2_all')

  // Evolution triggered
  const hasEvolutionInLoadout = state.weapons.some((w) => {
    return ['qpcr', 'cas12a', 'ultracentrifuge', 'capillary', 'tandemMs', 'polyclonal', 'liquidN2'].includes(
      w.id,
    )
  })
  if (hasEvolutionInLoadout && !has('first_evolution')) out.push('first_evolution')
  if (
    ctx.evolutionsTriggeredThisSession &&
    ctx.evolutionsTriggeredThisSession.length >= 7 &&
    !has('all_evolutions')
  )
    out.push('all_evolutions')

  return out
}

export function checkRunEndAchievements(
  state: RunState,
  meta: MetaState,
  outcome: 'won' | 'lost' | 'quit',
  runMode: string,
  bossId?: BossId,
): string[] {
  const out: string[] = []
  const owned = new Set(meta.achievements)
  const has = (id: string) => owned.has(id)

  if ((outcome === 'won' || outcome === 'lost') && !has('first_run') && state.time >= 30) {
    out.push('first_run')
  }
  if (outcome === 'won' && runMode === 'normal' && !has('first_win')) out.push('first_win')
  if (outcome === 'won' && state.player.hp / state.player.maxHp < 0.1 && !has('win_low_hp'))
    out.push('win_low_hp')

  // Boss Mode achievements
  if (outcome === 'won' && runMode === 'boss' && bossId) {
    if (bossId === 'prion' && !has('boss_prion')) out.push('boss_prion')
    if (bossId === 'lysate' && !has('boss_lysate')) out.push('boss_lysate')
    if (bossId === 'mirrorPlasmid' && !has('boss_mirror')) out.push('boss_mirror')
    // Check boss_all after applying this win
    const willOwn = new Set(meta.achievements)
    if (bossId === 'prion') willOwn.add('boss_prion')
    if (bossId === 'lysate') willOwn.add('boss_lysate')
    if (bossId === 'mirrorPlasmid') willOwn.add('boss_mirror')
    if (
      willOwn.has('boss_prion') &&
      willOwn.has('boss_lysate') &&
      willOwn.has('boss_mirror') &&
      !has('boss_all')
    )
      out.push('boss_all')
  }

  // Endless achievements (state.time tracked through endless extension)
  if (runMode === 'endless') {
    if (state.time >= 180 + 480 && !has('endless_3')) out.push('endless_3')
    if (state.time >= 480 + 480 && !has('endless_8')) out.push('endless_8')
  }

  return out
}

// Commit: returns the credits awarded from each achievement
export function commitAchievement(meta: MetaState, id: string): { credits: number; def: AchievementDef | null } {
  const def = getAchievement(id)
  if (!def) return { credits: 0, def: null }
  if (meta.achievements.includes(id)) return { credits: 0, def }
  meta.achievements.push(id)
  meta.credits += def.rewardCredits ?? 0
  return { credits: def.rewardCredits ?? 0, def }
}

// Helper for Lab UI grouping
export function achievementGroups(): { label: string; ids: string[] }[] {
  return [
    { label: 'First Steps', ids: ['first_kill', 'first_levelup', 'first_run', 'first_win'] },
    { label: 'Skill Trees', ids: ['tier1_amp', 'tier1_con', 'tier1_edit', 'tier2_any', 'tier2_all'] },
    { label: 'Combat', ids: ['combo_50', 'combo_100', 'kills_500', 'kills_1000', 'no_damage', 'win_low_hp'] },
    { label: 'Discovery', ids: ['first_evolution', 'all_evolutions', 'treasure_collect'] },
    { label: 'Boss Mode', ids: ['boss_prion', 'boss_lysate', 'boss_mirror', 'boss_all'] },
    { label: 'Endless', ids: ['endless_3', 'endless_8'] },
  ]
}

// Used for Lab UI lineage colors
export function lineageColor(l: Lineage): string {
  return LINEAGES[l].color
}
