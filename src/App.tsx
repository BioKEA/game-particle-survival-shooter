import { useEffect, useState } from 'react'
import { TitleScreen } from '@/pages/TitleScreen'
import { Game, type RunResult } from '@/pages/Game'
import { Lab } from '@/pages/Lab'
import { BossMode } from '@/pages/BossMode'
import { Onboarding } from '@/pages/Onboarding'
import { loadMeta, saveMeta } from '@/game/storage'
import { audio } from '@/game/audio'
import { todayKey, todaySeed } from '@/game/rng'
import type { BossId, MetaState } from '@/game/types'

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

  useEffect(() => {
    saveMeta(meta)
  }, [meta])

  useEffect(() => {
    try {
      const m = localStorage.getItem('pa:muted') === '1'
      audio.setMuted(m)
    } catch {
      /* ignore */
    }
  }, [])

  const onRunComplete = (result: RunResult) => {
    setMeta((m) => {
      const next: MetaState = {
        ...m,
        credits: m.credits + result.credits,
        totalRuns: m.totalRuns + 1,
        bestTime:
          runConfig.mode === 'normal' && result.outcome === 'won'
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
    </>
  )
}

export default App
