/** Tiny synthesized sounds. Nothing is created until the user turns sound on. */

export type SoundName = 'press' | 'pop' | 'boing' | 'pulse' | 'sprout' | 'flower' | 'gust' | 'thud' | 'flip' | 'bang' | 'squeak' | 'drip' | 'crack' | 'shatter' | 'boom' | 'sand' | 'splat' | 'shutter' | 'glitch';

const GAP: Record<SoundName, number> = { press: 90, pop: 90, boing: 120, pulse: 140, sprout: 130, flower: 160, gust: 180, thud: 70, flip: 200, bang: 90, squeak: 150, drip: 110, crack: 110, shatter: 70, boom: 220, sand: 90, splat: 100, shutter: 160, glitch: 70 };
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

export class Sound {
  enabled = false;
  private ac: AudioContext | null = null;
  private out: GainNode | null = null;
  private last: Partial<Record<SoundName, number>> = {};
  private noise: AudioBuffer | null = null;

  /** Must be called from a click handler. */
  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) return;
    try {
      if (!this.ac) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ac = new AC();
        this.out = this.ac.createGain();
        this.out.gain.value = 0.22;
        this.out.connect(this.ac.destination);
      }
      void this.ac.resume();
      this.play('pop');
    } catch {
      this.enabled = false;
    }
  }

  private noiseBuf() {
    const ac = this.ac!;
    if (!this.noise) {
      this.noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  /** A burst of filtered noise. */
  private hiss(type: BiquadFilterType, freq: number, dur: number, vol: number, when = 0) {
    const ac = this.ac!, t = ac.currentTime + when;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = this.noiseBuf();
    f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out!);
    src.start(t); src.stop(t + dur + 0.02);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, when = 0) {
    const ac = this.ac!, t = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out!);
    o.start(t); o.stop(t + dur + 0.03);
  }

  play(name: SoundName, amount = 1) {
    if (!this.enabled || !this.ac || !this.out) return;
    const now = performance.now();
    if (now - (this.last[name] ?? 0) < GAP[name]) return;
    this.last[name] = now;
    const v = Math.min(1, Math.max(0.25, amount));
    switch (name) {
      case 'press': this.tone('sine', 260, 150, 0.09, 0.25 * v); break;
      case 'pop': this.tone('sine', 190, 520, 0.07, 0.4 * v); this.tone('sine', 520, 210, 0.2, 0.35 * v, 0.06); break;
      case 'boing': this.tone('sine', 150, 330, 0.12, 0.3 * v); this.tone('sine', 330, 200, 0.22, 0.2 * v, 0.1); break;
      case 'pulse': this.tone('triangle', 130, 46, 0.28, 0.6 * v); this.tone('square', 900, 240, 0.07, 0.05 * v); break;
      case 'bang': {
        const ac = this.ac, t = ac.currentTime;
        const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        src.buffer = this.noiseBuf();
        f.type = 'highpass'; f.frequency.value = 900;
        g.gain.setValueAtTime(0.6 * v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        src.connect(f).connect(g).connect(this.out);
        src.start(t); src.stop(t + 0.16);
        this.tone('sine', 140, 45, 0.16, 0.5 * v);
        break;
      }
      case 'squeak': this.tone('triangle', 420 + amount * 520, 470 + amount * 560, 0.11, 0.07); break;
      case 'drip': this.tone('sine', 360, 1250, 0.08, 0.32 * v); this.tone('sine', 900, 620, 0.14, 0.12 * v, 0.06); break;
      case 'glitch': { const f = 200 + Math.random() * 1600; this.tone('square', f, f * (0.5 + Math.random()), 0.05, 0.05 * v); this.hiss('highpass', 4000, 0.04, 0.12 * v); break; }
      case 'shutter': this.hiss('bandpass', 3800, 0.03, 0.3 * v); this.hiss('bandpass', 2600, 0.04, 0.22 * v, 0.07); break;
      case 'sand': this.hiss('bandpass', 2600, 0.12, 0.1 * v); break;
      case 'splat': this.hiss('lowpass', 700, 0.18, 0.45 * v); this.tone('sine', 260, 90, 0.14, 0.3 * v); break;
      case 'crack': this.hiss('highpass', 3200, 0.05, 0.22 * v); break;
      case 'shatter':
        this.hiss('highpass', 2400, 0.28, 0.45 * v);
        for (let i = 0; i < 4; i++) this.tone('sine', 2200 + Math.random() * 2200, 1800, 0.09, 0.07 * v, 0.03 + i * 0.045);
        break;
      case 'boom': this.tone('sine', 120, 32, 0.6, 0.75 * v); this.hiss('lowpass', 420, 0.5, 0.5 * v); break;
      case 'thud': this.tone('sine', 150, 48, 0.13, 0.55 * v); break;
      case 'flip': this.tone('triangle', 620, 150, 0.22, 0.3 * v); this.tone('sine', 150, 420, 0.2, 0.2 * v, 0.12); break;
      case 'sprout': this.tone('sine', SCALE[(Math.random() * SCALE.length) | 0] * 2, 1400, 0.06, 0.1 * v); break;
      case 'flower': {
        const i = (Math.random() * 3) | 0;
        [0, 2, 3].forEach((s, n) => this.tone('triangle', SCALE[i + s], SCALE[i + s] * 0.995, 0.3, 0.2 * v, n * 0.075));
        break;
      }
      case 'gust': {
        const ac = this.ac;
        if (!this.noise) {
          this.noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
          const d = this.noise.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        const t = ac.currentTime;
        const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        src.buffer = this.noise;
        f.type = 'bandpass'; f.Q.value = 0.9;
        f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(1900, t + 0.38);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.09);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
        src.connect(f).connect(g).connect(this.out);
        src.start(t); src.stop(t + 0.45);
        break;
      }
    }
  }
}
