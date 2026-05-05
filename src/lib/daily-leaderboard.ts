import { GAME_ID, leaderboard } from './leaderboard-client'

const HANDLE_KEY = 'pa:handle-v1'
// Cross-game key written by the BioKEA leaderboard prompt. We fall
// back to it on read and mirror to it on write so the per-game store
// and the cross-game store stay in sync; that way a player who set
// their handle in another BioKEA game (or a different browser tab)
// won't silently drop their first particle daily score.
const CROSS_GAME_HANDLE_KEY = 'biokea:player:handle'

export interface LeaderboardRow {
  id: string
  handle: string
  time: number // seconds survived
  outcome: 'won' | 'lost' | 'quit'
  level: number
  isYou: boolean
  created_at: string
}

export function loadHandle(): string | null {
  try {
    return (
      localStorage.getItem(HANDLE_KEY) ??
      localStorage.getItem(CROSS_GAME_HANDLE_KEY)
    )
  } catch {
    return null
  }
}

export function saveHandle(input: string): string {
  const clean = sanitizeHandle(input)
  if (!clean) return ''
  try {
    localStorage.setItem(HANDLE_KEY, clean)
    localStorage.setItem(CROSS_GAME_HANDLE_KEY, clean)
  } catch {
    // ignore
  }
  return clean
}

export function sanitizeHandle(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16)
}

export type SubmitResult = { ok: true } | { ok: false; error: string }

// Score = whole seconds survived. Higher is better — matches the lib's
// score-desc ordering. Outcome + level get tucked into metadata.
export async function submitDailyScore(args: {
  day: string
  handle: string
  time: number
  outcome: 'won' | 'lost' | 'quit'
  level: number
  kills: number
}): Promise<SubmitResult> {
  const handle = sanitizeHandle(args.handle)
  if (!handle) return { ok: false, error: 'Handle required' }

  const result = await leaderboard.submitScore({
    gameId: GAME_ID,
    mode: 'daily',
    seed: args.day,
    score: Math.floor(args.time),
    playerHandle: handle,
    metadata: {
      outcome: args.outcome,
      level: args.level,
      kills: args.kills,
    },
  })

  if (!result.ok) {
    const msg =
      result.reason === 'rate_limited'
        ? 'Too many submissions. Slow down.'
        : result.reason === 'invalid'
        ? 'Score rejected.'
        : result.reason === 'unconfigured'
        ? 'Leaderboard offline.'
        : 'Network error.'
    return { ok: false, error: msg }
  }
  return { ok: true }
}

export async function fetchTopDaily(day: string, limit = 10): Promise<LeaderboardRow[]> {
  const entries = await leaderboard.getDailyLeaderboard(GAME_ID, day, limit)
  const me = loadHandle()
  return entries.map((e) => ({
    id: e.id,
    handle: e.player_handle,
    time: e.score,
    outcome:
      typeof e.metadata?.outcome === 'string'
        ? (e.metadata.outcome as 'won' | 'lost' | 'quit')
        : 'lost',
    level: typeof e.metadata?.level === 'number' ? (e.metadata.level as number) : 1,
    isYou: !!me && e.player_handle === me,
    created_at: e.created_at,
  }))
}
