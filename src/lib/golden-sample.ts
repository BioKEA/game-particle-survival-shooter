// src/lib/golden-sample.ts
//
// Particle Accelerator's slice of the Golden Sample 26 hunt. Slot 6
// unlocks when a single daily run records a score (= seconds
// survived) of at least 360 — six minutes through the collider.
//
// The actual server-side validation lives in
// website-biokea/src/lib/golden-sample/validate.ts. This file just
// nudges the API to recheck after each submit.
//
// I won't tell. That would be cheating.

const API_BASE = '/api/golden-sample'
const TICKETS_KEY = 'biokea:golden-tickets:v1'
const HANDLE_KEY = 'biokea:player:handle'
const CLIENT_ID_KEY = 'biokea-leaderboard-client-id'

const GAME_ID = 'particle-survival-shooter'
const SLOT = 6

function alreadyHeld(): boolean {
  try {
    const map = JSON.parse(localStorage.getItem(TICKETS_KEY) ?? '{}')
    return !!map[String(SLOT)]
  } catch {
    return false
  }
}

function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY)
    if (id && /^[0-9a-f-]{36}$/i.test(id)) return id
    id = crypto.randomUUID()
    localStorage.setItem(CLIENT_ID_KEY, id)
    return id
  } catch {
    return '00000000-0000-4000-8000-000000000000'
  }
}

function readHandle(): string | null {
  try {
    const v = localStorage.getItem(HANDLE_KEY)
    return v && v.trim().length > 0 ? v.trim() : null
  } catch {
    return null
  }
}

interface ClaimResponse {
  ok: boolean
  slot?: number
  word?: string
  token?: string
  issued_at?: string
  first_earn?: boolean
}

interface GoldenFoundDetail {
  game: string
  slot: number
  word: string
  token?: string
  issued_at?: string
  alreadyHeld: boolean
  sentence: string
}

// Survive-the-whole-game threshold (RUN_DURATION = 480s in waves.ts).
// Gate the claim attempt so a long-ago full run doesn't fire the
// reveal on a short subsequent run.
const SLOT_THRESHOLD_TIME = 480

export async function tryClaimGoldenSample(
  args: { handle?: string; time?: number } = {},
): Promise<void> {
  if (alreadyHeld()) return
  if (typeof args.time === 'number' && args.time < SLOT_THRESHOLD_TIME) return
  const h = args.handle ?? readHandle()
  if (!h) return
  let res: Response
  try {
    res = await fetch(`${API_BASE}/claim/${GAME_ID}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handle: h, client_id: getClientId() }),
    })
  } catch {
    return
  }
  if (!res.ok) return
  let body: ClaimResponse
  try {
    body = (await res.json()) as ClaimResponse
  } catch {
    return
  }
  if (!body.ok || !body.word || !body.slot) return

  const detail: GoldenFoundDetail = {
    game: GAME_ID,
    slot: body.slot,
    word: body.word,
    token: body.token,
    issued_at: body.issued_at,
    alreadyHeld: !body.first_earn,
    sentence: 'Every Human Now Has Scientific Superpowers',
  }
  window.dispatchEvent(
    new CustomEvent<GoldenFoundDetail>('biokea:golden-found', { detail }),
  )
}
