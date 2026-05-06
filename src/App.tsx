import { useEffect, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { TitleScreen } from '@/pages/TitleScreen'
import { Game, type RunResult } from '@/pages/Game'
import { Lab } from '@/pages/Lab'
import { BossMode } from '@/pages/BossMode'
import { Onboarding } from '@/pages/Onboarding'
import { loadMeta, saveMeta } from '@/game/storage'
import { audio } from '@/game/audio'
import { todayKey, todaySeed } from '@/game/rng'
import type { BossId, MetaState } from '@/game/types'
import { loadHandle, saveHandle, submitDailyScore } from '@/lib/daily-leaderboard'
import { tryClaimGoldenSample } from '@/lib/golden-sample'
import { BiokeaLeaderboardPrompt, shouldShowBiokeaPrompt } from '@/components/BiokeaLeaderboardPrompt'

// Wraps submitDailyScore with toast feedback so the player can see
// whether their score actually landed. Without this, network or RLS
// failures look identical to silence.
async function submitWithToast(args: Parameters<typeof submitDailyScore>[0]) {
  const id = toast.loading('Posting score to BioKEA leaderboard…')
  try {
    const res = await submitDailyScore(args)
    if (res.ok) {
      toast.success('Posted to leaderboard', {
        id,
        description: 'View it at biokea.ai/mission/games/leaderboard',
      })
      // Golden Sample 26: pass this run's survived seconds so the
      // claim only fires when THIS run cleared the threshold (480s
      // — full 8-minute survival). Server still cross-checks.
      // I won't tell. That would be cheating.
      void tryClaimGoldenSample({ handle: args.handle, time: args.time })
    } else {
      toast.error(`Couldn't post score: ${res.error}`, { id })
    }
  } catch (err) {
    toast.error(`Couldn't post score: ${err instanceof Error ? err.message : 'unknown error'}`, {
      id,
    })
  }
}

type Screen = 'title' | 'game' | 'lab' | 'boss-select'

export interface RunConfig {
  mode: 'normal' | 'daily' | 'boss' | 'endless'
  seed?: number
  dateKey?: string
  bossId?: BossId
}

function App() {
  const [screen, setScreen] = useState<Screen>('title')
  const [meta, setMeta] = useState<MetaState>(() => loadMeta())
  const [runConfig, setRunConfig] = useState<RunConfig>({ mode: 'normal' })
  // BiokeaLeaderboardPrompt — shows after a daily run if no handle exists.
  const [biokeaPromptResult, setBiokeaPromptResult] = useState<
    | { day: string; time: number; outcome: 'won' | 'lost' | 'quit'; level: number; kills: number }
    | null
  >(null)

  useEffect(() => {
    saveMeta(meta)
  }, [meta])

  useEffect(() => {
    // Default to muted on first visit. Once the player toggles a
    // preference, "0"/"1" is stored and respected.
    try {
      const stored = localStorage.getItem('pa:muted')
      const m = stored === '0' ? false : true
      audio.setMuted(m)
    } catch {
      audio.setMuted(true)
    }
  }, [])

  const onRunComplete = (result: RunResult) => {
    setMeta((m) => {
      const next: MetaState = {
        ...m,
        credits: m.credits + result.credits,
        totalRuns: m.totalRuns + 1,
        bestTime:
          runConfig.mode === 'normal' || runConfig.mode === 'daily'
            ? Math.max(m.bestTime, result.time)
            : m.bestTime,
        wins: m.wins + (runConfig.mode === 'normal' && result.outcome === 'won' ? 1 : 0),
      }
      if (runConfig.mode === 'daily' && runConfig.dateKey) {
        const prev = m.dailyRecords[runConfig.dateKey]
        const better =
          !prev ||
          (result.outcome === 'won' && prev.outcome !== 'won') ||
          (result.outcome === prev.outcome && result.time > prev.time)
        if (better) {
          next.dailyRecords = {
            ...m.dailyRecords,
            [runConfig.dateKey]: {
              time: result.time,
              level: result.level,
              kills: result.kills,
              outcome: result.outcome === 'won' ? 'won' : 'lost',
            },
          }
        }
      }
      // Boss Mode: record best time for the defeated boss
      if (runConfig.mode === 'boss' && result.bossDefeated && result.outcome === 'won') {
        const prev = m.bossRecords[result.bossDefeated]
        if (!prev || result.time < prev) {
          next.bossRecords = {
            ...m.bossRecords,
            [result.bossDefeated]: result.time,
          }
        }
      }
      // Endless: record longest survival
      if (runConfig.mode === 'endless') {
        if (result.time > m.endlessRecord) {
          next.endlessRecord = result.time
        }
      }
      return next
    })

    // Submit to shared daily leaderboard (only daily mode for now; boss
    // ranks would need a lower-is-better ordering, which the shared
    // schema doesn't support).
    if (runConfig.mode === 'daily' && runConfig.dateKey && result.time > 0) {
      const handle = loadHandle()
      const stash = {
        day: runConfig.dateKey,
        time: result.time,
        outcome: result.outcome,
        level: result.level,
        kills: result.kills,
      }
      if (shouldShowBiokeaPrompt() || !handle) {
        // Open the BioKEA prompt either when it's actively wanted (first
        // run, no subscribe yet) or as a forced handle-capture fallback
        // when the prompt is otherwise suppressed but no handle exists —
        // without this, the score would silently drop.
        setBiokeaPromptResult(stash)
      } else {
        void submitWithToast({ ...stash, handle })
      }
    }
  }

  const fmtTime = (s: number): string => {
    const m = Math.floor(s / 60)
    const r = Math.floor(s % 60)
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  }

  const startNormalRun = () => {
    audio.setSuppressed(false)
    audio.resume()
    audio.play('click')
    setRunConfig({ mode: 'normal' })
    setScreen('game')
  }

  const startDailyRun = () => {
    audio.setSuppressed(false)
    audio.resume()
    audio.play('click')
    setRunConfig({ mode: 'daily', seed: todaySeed(), dateKey: todayKey() })
    setScreen('game')
  }

  const openLab = () => {
    audio.setSuppressed(false)
    audio.resume()
    audio.play('click')
    setScreen('lab')
  }

  const openBossMode = () => {
    audio.setSuppressed(false)
    audio.resume()
    audio.play('click')
    setScreen('boss-select')
  }

  const startBossRun = (bossId: BossId) => {
    audio.setSuppressed(false)
    audio.resume()
    audio.play('click')
    setRunConfig({ mode: 'boss', bossId })
    setScreen('game')
  }

  const startEndlessRun = () => {
    audio.setSuppressed(false)
    audio.resume()
    audio.play('click')
    setRunConfig({ mode: 'endless' })
    setScreen('game')
  }

  if (screen === 'game') {
    return (
      <Game
        key={`run-${runConfig.mode}-${runConfig.bossId ?? runConfig.dateKey ?? 'normal'}`}
        meta={meta}
        runConfig={runConfig}
        onRunComplete={onRunComplete}
        onMetaUpdate={(updater) => setMeta(updater)}
        onExit={() => setScreen(runConfig.mode === 'boss' ? 'boss-select' : 'title')}
      />
    )
  }

  if (screen === 'lab') {
    return <Lab meta={meta} onUpdateMeta={setMeta} onBack={() => setScreen('title')} />
  }

  if (screen === 'boss-select') {
    return (
      <BossMode
        meta={meta}
        onStartBoss={startBossRun}
        onStartEndless={startEndlessRun}
        onBack={() => setScreen('title')}
      />
    )
  }

  return (
    <>
      <TitleScreen
        meta={meta}
        onStartRun={startNormalRun}
        onStartDailyRun={startDailyRun}
        onOpenLab={openLab}
        onOpenBossMode={openBossMode}
      />
      {!meta.onboarded && (
        <Onboarding
          onComplete={(startRun) => {
            setMeta((m) => ({ ...m, onboarded: true }))
            audio.setSuppressed(false)
            if (startRun) {
              // Defer so the meta update commits before Game mounts
              setTimeout(() => startNormalRun(), 0)
            }
          }}
        />
      )}
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: 'rgba(10, 26, 47, 0.95)',
            border: '1px solid rgba(74, 130, 255, 0.35)',
            color: '#eef2f6',
          },
        }}
      />
      {biokeaPromptResult && (
        <BiokeaLeaderboardPrompt
          trigger="game-end"
          gameSlug="particle-survival-shooter"
          gameTitle="Particle Accelerator"
          score={{
            value: fmtTime(biokeaPromptResult.time),
            label: 'Time survived',
            unit: `· level ${biokeaPromptResult.level} · ${biokeaPromptResult.kills} kills`,
          }}
          defaultHandle={loadHandle() ?? ''}
          onSubmit={(result) => {
            saveHandle(result.handle)
            const r = biokeaPromptResult
            setBiokeaPromptResult(null)
            if (r) {
              void submitWithToast({
                day: r.day,
                handle: result.handle,
                time: r.time,
                outcome: r.outcome,
                level: r.level,
                kills: r.kills,
              })
            }
          }}
          onSkip={() => {
            // Skip the email step but still post if a handle is stored.
            const r = biokeaPromptResult
            const existing = loadHandle()
            setBiokeaPromptResult(null)
            if (existing && r) {
              void submitWithToast({
                day: r.day,
                handle: existing,
                time: r.time,
                outcome: r.outcome,
                level: r.level,
                kills: r.kills,
              })
            }
          }}
        />
      )}
    </>
  )
}

export default App
