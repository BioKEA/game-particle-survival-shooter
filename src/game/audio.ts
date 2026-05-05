type SoundId =
  | 'hit'
  | 'kill'
  | 'pickup'
  | 'heal'
  | 'levelUp'
  | 'playerHit'
  | 'win'
  | 'lose'
  | 'select'
  | 'click'

class AudioManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private musicNodes: AudioNode[] = []
  private lastPlayed: Partial<Record<SoundId, number>> = {}
  private musicStarted = false
  private muted = true
  private suppressed = false

  init() {
    if (this.ctx) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    try {
      this.ctx = new Ctx()
    } catch {
      return
    }
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.6
    this.master.connect(this.ctx.destination)

    this.sfxGain = this.ctx.createGain()
    this.sfxGain.gain.value = 1
    this.sfxGain.connect(this.master)

    this.musicGain = this.ctx.createGain()
    this.musicGain.gain.value = 0.35
    this.musicGain.connect(this.master)
  }

  resume() {
    this.init()
    if (this.ctx?.state === 'suspended') void this.ctx.resume()
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master) this.master.gain.value = m ? 0 : 0.6
  }
  isMuted() {
    return this.muted
  }

  // When true, all engine-internal play() calls are silenced.
  // Music + UI audio handlers should toggle this off before triggering UI sounds.
  setSuppressed(s: boolean) {
    this.suppressed = s
  }

  // Throttle some sounds so they don't pile up
  private canPlay(id: SoundId, throttleMs: number): boolean {
    const now = performance.now()
    const last = this.lastPlayed[id] ?? 0
    if (now - last < throttleMs) return false
    this.lastPlayed[id] = now
    return true
  }

  play(id: SoundId) {
    if (this.suppressed) return
    if (!this.ctx || !this.sfxGain) return
    const ctx = this.ctx
    const out = this.sfxGain
    switch (id) {
      case 'hit':
        if (!this.canPlay('hit', 35)) return
        this.tone(ctx, out, { type: 'square', start: 240, end: 80, duration: 0.06, volume: 0.08 })
        break
      case 'kill':
        if (!this.canPlay('kill', 28)) return
        this.tone(ctx, out, { type: 'triangle', start: 600, end: 1200, duration: 0.08, volume: 0.12 })
        this.tone(ctx, out, { type: 'square', start: 200, end: 80, duration: 0.06, volume: 0.06, delay: 0.01 })
        break
      case 'pickup':
        if (!this.canPlay('pickup', 30)) return
        this.tone(ctx, out, { type: 'sine', start: 880, end: 1320, duration: 0.07, volume: 0.07 })
        break
      case 'heal':
        this.tone(ctx, out, { type: 'sine', start: 660, end: 990, duration: 0.16, volume: 0.18 })
        this.tone(ctx, out, { type: 'sine', start: 990, end: 1320, duration: 0.16, volume: 0.12, delay: 0.06 })
        break
      case 'playerHit':
        this.noiseBurst(ctx, out, { duration: 0.15, volume: 0.25, lowpass: 600 })
        this.tone(ctx, out, { type: 'square', start: 120, end: 60, duration: 0.18, volume: 0.18 })
        break
      case 'levelUp':
        // Rising arpeggio C-E-G-C
        ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          this.tone(ctx, out, {
            type: 'triangle',
            start: f,
            end: f,
            duration: 0.15,
            volume: 0.18,
            delay: i * 0.07,
          })
        })
        break
      case 'win':
        // Triumphant major chord stack
        ;[261.63, 329.63, 392.0, 523.25].forEach((f) => {
          this.tone(ctx, out, {
            type: 'triangle',
            start: f,
            end: f,
            duration: 1.2,
            volume: 0.16,
          })
        })
        ;[523.25, 659.25, 783.99].forEach((f, i) => {
          this.tone(ctx, out, {
            type: 'sine',
            start: f,
            end: f * 1.5,
            duration: 0.5,
            volume: 0.12,
            delay: 0.15 + i * 0.08,
          })
        })
        break
      case 'lose':
        // Descending minor
        ;[261.63, 246.94, 220.0, 196.0].forEach((f, i) => {
          this.tone(ctx, out, {
            type: 'sawtooth',
            start: f,
            end: f * 0.5,
            duration: 0.7,
            volume: 0.14,
            delay: i * 0.15,
          })
        })
        break
      case 'select':
        this.tone(ctx, out, { type: 'sine', start: 740, end: 740, duration: 0.06, volume: 0.1 })
        break
      case 'click':
        this.tone(ctx, out, { type: 'square', start: 880, end: 660, duration: 0.04, volume: 0.08 })
        break
    }
  }

  startMusic(intensity = 0) {
    this.init()
    if (!this.ctx || !this.musicGain || this.musicStarted) return
    this.musicStarted = true
    const ctx = this.ctx

    // Slow pulsing low drone (root + fifth)
    const drone1 = ctx.createOscillator()
    drone1.type = 'sawtooth'
    drone1.frequency.value = 65.41 // C2
    const drone2 = ctx.createOscillator()
    drone2.type = 'sawtooth'
    drone2.frequency.value = 98.0 // G2
    const droneGain = ctx.createGain()
    droneGain.gain.value = 0.18
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 320
    lp.Q.value = 1.2

    drone1.connect(droneGain)
    drone2.connect(droneGain)
    droneGain.connect(lp)
    lp.connect(this.musicGain)
    drone1.start()
    drone2.start()

    // Slow LFO on filter
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.12
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 220
    lfo.connect(lfoGain)
    lfoGain.connect(lp.frequency)
    lfo.start()

    // Soft pulsing high pad
    const pad = ctx.createOscillator()
    pad.type = 'triangle'
    pad.frequency.value = 261.63
    const padGain = ctx.createGain()
    padGain.gain.value = 0.0
    pad.connect(padGain)
    padGain.connect(this.musicGain)
    pad.start()

    // Pulse the pad with a slow LFO
    const padLfo = ctx.createOscillator()
    padLfo.frequency.value = 0.45
    const padLfoGain = ctx.createGain()
    padLfoGain.gain.value = 0.025
    padLfo.connect(padLfoGain)
    padLfoGain.connect(padGain.gain)
    padLfo.start()

    this.musicNodes = [drone1, drone2, lfo, pad, padLfo]
    void intensity
  }

  stopMusic() {
    for (const n of this.musicNodes) {
      try {
        ;(n as OscillatorNode).stop()
      } catch {
        /* ignore */
      }
    }
    this.musicNodes = []
    this.musicStarted = false
  }

  private tone(
    ctx: AudioContext,
    out: AudioNode,
    opts: {
      type: OscillatorType
      start: number
      end: number
      duration: number
      volume: number
      delay?: number
    },
  ) {
    const t0 = ctx.currentTime + (opts.delay ?? 0)
    const osc = ctx.createOscillator()
    osc.type = opts.type
    osc.frequency.setValueAtTime(opts.start, t0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(opts.end, 1), t0 + opts.duration)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(opts.volume, t0 + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration)
    osc.connect(g)
    g.connect(out)
    osc.start(t0)
    osc.stop(t0 + opts.duration + 0.05)
  }

  private noiseBurst(
    ctx: AudioContext,
    out: AudioNode,
    opts: { duration: number; volume: number; lowpass?: number },
  ) {
    const t0 = ctx.currentTime
    const len = Math.floor(ctx.sampleRate * opts.duration)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const g = ctx.createGain()
    g.gain.value = opts.volume
    src.connect(g)
    if (opts.lowpass) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = opts.lowpass
      g.connect(f)
      f.connect(out)
    } else {
      g.connect(out)
    }
    src.start(t0)
  }
}

export const audio = new AudioManager()
