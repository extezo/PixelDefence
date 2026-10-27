// Простые 8-битные звуки на WebAudio, без файлов.

const THROTTLE = { water: 90, zap: 70, fireball: 90, spear: 80, levelup: 150, arrow: 60, ice: 80, ball: 80, coin: 50, boom: 60, leak: 100 };

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.last = {};
  }

  // Браузеры разрешают звук только после действия пользователя.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(freq, dur, type = 'square', vol = 0.04, slide = 0, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.1) {
    const c = this.ctx, t = c.currentTime;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(filter).connect(g).connect(c.destination);
    src.start(t);
  }

  play(name) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    const gap = THROTTLE[name] ?? 0;
    if (gap && now - (this.last[name] ?? 0) < gap) return;
    this.last[name] = now;

    switch (name) {
      case 'arrow': this.tone(900, 0.05, 'square', 0.015, -400); break;
      case 'ice': this.tone(1500, 0.08, 'triangle', 0.03, -700); break;
      case 'ball': this.tone(150, 0.12, 'square', 0.04, -80); break;
      case 'boom': this.noise(0.25, 0.15); break;
      case 'coin': this.tone(988, 0.05, 'square', 0.02); this.tone(1319, 0.08, 'square', 0.02, 0, 0.05); break;
      case 'place': this.tone(330, 0.06, 'square', 0.04); this.tone(494, 0.08, 'square', 0.04, 0, 0.06); break;
      case 'upgrade': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.07, 'square', 0.03, 0, i * 0.05)); break;
      case 'sell': this.tone(784, 0.06, 'square', 0.03); this.tone(523, 0.1, 'square', 0.03, 0, 0.06); break;
      case 'levelup': [659, 880, 1175].forEach((f, i) => this.tone(f, 0.08, 'triangle', 0.04, 0, i * 0.06)); break;
      case 'reroll': [440, 554, 440, 659].forEach((f, i) => this.tone(f, 0.04, 'square', 0.025, 0, i * 0.035)); break;
      case 'zap': this.noise(0.08, 0.05); this.tone(1800, 0.06, 'sawtooth', 0.015, -1200); break;
      case 'spear': this.tone(500, 0.12, 'triangle', 0.04, -300); break;
      case 'fireball': this.noise(0.12, 0.04); break;
      case 'water': this.tone(300, 0.1, 'sine', 0.04, -120); break;
      case 'error': this.tone(120, 0.12, 'square', 0.04); break;
      case 'leak': this.tone(220, 0.3, 'sawtooth', 0.05, -150); break;
      case 'wave': [392, 523, 659].forEach((f, i) => this.tone(f, 0.1, 'square', 0.035, 0, i * 0.09)); break;
      case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.14, 'square', 0.04, 0, i * 0.12)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.06, 0, i * 0.2)); break;
    }
  }
}
