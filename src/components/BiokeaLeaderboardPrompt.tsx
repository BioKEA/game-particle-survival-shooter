// BiokeaLeaderboardPrompt.tsx
//
// Drop-in modal that captures a leaderboard handle (required) and an
// optional email subscription. Shipped identically across all six BioKEA
// games so the score-logging entry point feels the same everywhere — and
// so the email funnel into the lab-updates list is one path, not six.
//
// The component is presentational only: the host game owns visibility
// (renders it conditionally) and persists the returned handle into its
// own per-game storage. The component itself saves to a unified
// 'biokea:player:handle' localStorage key so future games + the
// leaderboard page on biokea.ai can pick the handle up automatically.
//
// Usage (game-end):
//   {showPrompt && (
//     <BiokeaLeaderboardPrompt
//       trigger="game-end"
//       gameSlug="codon2048"
//       gameTitle="Codon Collider"
//       score={{ value: 23400, label: 'Score', unit: 'pts' }}
//       defaultHandle={existingHandle ?? ''}
//       onSubmit={(r) => { setHandle(r.handle); setShowPrompt(false); submitScore(); }}
//       onSkip={() => setShowPrompt(false)}
//     />
//   )}
//
// Usage (game-start):
//   {showPrompt && (
//     <BiokeaLeaderboardPrompt
//       trigger="game-start"
//       gameSlug="cal-field-lab-collectible"
//       gameTitle="Biodiversity Discovery Lab"
//       defaultHandle={state.playerName}
//       onSubmit={(r) => { setPlayerName(r.handle); setShowPrompt(false); }}
//     />
//   )}

import { useEffect, useState } from 'react'

const SUBSCRIBE_URL = 'https://biokea.ai/api/subscribe'
const HANDLE_REGEX = /^[a-zA-Z0-9_-]{1,32}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CROSS_GAME_HANDLE_KEY = 'biokea:player:handle'

export interface BiokeaLeaderboardPromptResult {
  handle: string
  email: string | null
  subscribedToLabUpdates: boolean
}

export interface BiokeaLeaderboardPromptProps {
  trigger: 'game-end' | 'game-start'
  gameSlug: string
  gameTitle: string
  // Already-formatted score for display (e.g. "23,400" or "8:42").
  // The unit is purely cosmetic ("pts" / "sec" / etc.).
  score?: { value: string | number; label?: string; unit?: string }
  defaultHandle?: string
  onSubmit: (result: BiokeaLeaderboardPromptResult) => void
  // Only used for game-end. Players entering a long-form game cannot
  // skip the prompt because the rest of the game depends on a handle.
  onSkip?: () => void
}

function loadCrossGameHandle(): string {
  try {
    return localStorage.getItem(CROSS_GAME_HANDLE_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveCrossGameHandle(h: string): void {
  try {
    localStorage.setItem(CROSS_GAME_HANDLE_KEY, h)
  } catch {
    /* ignore */
  }
}

function sanitizeHandle(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32)
}

export function BiokeaLeaderboardPrompt(props: BiokeaLeaderboardPromptProps) {
  const initial = props.defaultHandle?.trim() || loadCrossGameHandle()
  const [handle, setHandle] = useState<string>(sanitizeHandle(initial))
  const [email, setEmail] = useState<string>('')
  const [subscribe, setSubscribe] = useState<boolean>(false)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Lock body scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  async function commit() {
    const h = sanitizeHandle(handle)
    if (!HANDLE_REGEX.test(h)) {
      setError('Pick a handle: 1–32 letters, numbers, _ or -.')
      return
    }
    if (subscribe) {
      const e = email.trim()
      if (!EMAIL_REGEX.test(e)) {
        setError('Enter a valid email or uncheck Lab updates.')
        return
      }
    }

    setSubmitting(true)
    setError(null)
    saveCrossGameHandle(h)

    // Fire-and-forget subscribe. Same-origin in prod (game served from
    // biokea.ai/mission/games/<slug>/), absolute URL also fine. We don't
    // wait — score posting + game flow shouldn't block on Resend.
    if (subscribe && email.trim()) {
      const body = new URLSearchParams({
        email: email.trim(),
        source: props.gameSlug,
        handle: h,
        consent: 'true',
      })
      void fetch(SUBSCRIBE_URL, {
        method: 'POST',
        body,
      }).catch(() => undefined)
    }

    setSubmitting(false)
    props.onSubmit({
      handle: h,
      email: subscribe && email.trim() ? email.trim() : null,
      subscribedToLabUpdates: subscribe,
    })
  }

  const headerEyebrow = 'BioKEA Leaderboard'
  const headerTitle =
    props.trigger === 'game-end' ? 'Post your score' : `Welcome — ${props.gameTitle}`
  const lede =
    props.trigger === 'game-end'
      ? 'Pick a handle to put this run on the BioKEA leaderboard. Earns BKP across all six BioKEA games.'
      : 'Pick a handle to track progress and earn BKP across all six BioKEA games. You can change it later.'
  const submitLabel = props.trigger === 'game-end' ? 'Post score →' : 'Start playing →'

  return (
    <div
      className="fixed inset-0 z-[2147483646] flex items-center justify-center p-4"
      style={{
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="biokea-prompt-title"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-md shadow-2xl"
        style={{ background: '#fdf8ed', color: '#1a1a1a' }}
      >
        {/* Header — dark band */}
        <div className="px-5 py-4" style={{ background: '#1a1a1a', color: '#fdf8ed' }}>
          <div
            className="font-mono text-[10px] tracking-[0.22em] uppercase"
            style={{ color: '#c9a84c' }}
          >
            {headerEyebrow}
          </div>
          <h2
            id="biokea-prompt-title"
            className="mt-1 text-xl font-semibold tracking-tight leading-tight"
          >
            {headerTitle}
          </h2>
          {props.score && (
            <div className="mt-2 font-mono text-sm" style={{ color: 'rgba(253,248,237,0.7)' }}>
              {props.score.label ?? 'Score'}:{' '}
              <span style={{ color: '#c9a84c' }} className="font-bold">
                {props.score.value}
              </span>
              {props.score.unit ? (
                <span style={{ color: 'rgba(253,248,237,0.4)' }}> {props.score.unit}</span>
              ) : null}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          <p className="text-sm leading-relaxed" style={{ color: '#374151' }}>
            {lede}
          </p>

          <label className="block">
            <span
              className="font-mono text-[10px] tracking-[0.18em] uppercase"
              style={{ color: '#a06f1c' }}
            >
              Handle
            </span>
            <input
              autoFocus
              value={handle}
              onChange={(e) => setHandle(sanitizeHandle(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void commit()
                }
              }}
              placeholder="your_handle"
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
              className="mt-1 block w-full rounded-sm border px-3 py-2 text-sm font-mono"
              style={{ background: '#ffffff', borderColor: 'rgba(15,23,42,0.18)' }}
            />
          </label>

          {/* Email opt-in */}
          <div className="border-t pt-3" style={{ borderColor: 'rgba(15,23,42,0.10)' }}>
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={subscribe}
                onChange={(e) => setSubscribe(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm">
                <span className="font-semibold">Lab updates by email</span>
                <span className="block text-xs mt-0.5" style={{ color: '#6b7280' }}>
                  New games, papers, and the Golden Sample Hunt — straight to your inbox. Subscribers
                  also get a verified ✓ next to their handle on the leaderboard.
                </span>
              </span>
            </label>
            {subscribe && (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@lab.org"
                autoComplete="email"
                className="mt-2 block w-full rounded-sm border px-3 py-2 text-sm"
                style={{ background: '#ffffff', borderColor: 'rgba(15,23,42,0.18)' }}
              />
            )}
          </div>

          {error && (
            <div
              className="text-xs px-3 py-2 rounded-sm"
              style={{ background: '#fef2f2', color: '#991b1b' }}
            >
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            {props.onSkip && (
              <button
                type="button"
                onClick={props.onSkip}
                disabled={submitting}
                className="px-3 py-2 text-sm rounded-sm"
                style={{ color: '#6b7280' }}
              >
                Skip
              </button>
            )}
            <button
              type="button"
              onClick={() => void commit()}
              disabled={submitting}
              className="ml-auto px-4 py-2 rounded-sm font-semibold text-sm uppercase tracking-[0.08em] disabled:opacity-50"
              style={{ background: '#1a1a1a', color: '#fdf8ed' }}
            >
              {submitting ? '…' : submitLabel}
            </button>
          </div>

          <p className="text-[10px] leading-snug pt-1" style={{ color: '#9ca3af' }}>
            By posting you agree to your handle being shown publicly on biokea.ai/mission/games/.
            Email is optional and only used for lab updates — see{' '}
            <a
              href="https://biokea.ai/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              privacy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
