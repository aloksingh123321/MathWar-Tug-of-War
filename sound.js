/* ================================================================
   sound.js — MathWar SoundSystem (Web Audio API — zero dependencies)
   ================================================================ */
class SoundSystem {
  constructor() {
    this._ctx = null;
    this._muted = false;
    this._init();
  }

  _init() {
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) { console.warn('[Sound] Web Audio not supported'); }
  }

  _resume() {
    if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume();
  }

  _beep(freq, type, dur, vol=0.4, delay=0) {
    if (this._muted || !this._ctx) return;
    this._resume();
    const osc  = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain); gain.connect(this._ctx.destination);
    osc.type = type; osc.frequency.value = freq;
    const t = this._ctx.currentTime + delay;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  correct() {
    this._beep(523, 'sine',   0.12, 0.35, 0);
    this._beep(659, 'sine',   0.12, 0.30, 0.12);
    this._beep(784, 'sine',   0.18, 0.35, 0.24);
  }

  wrong() {
    this._beep(200, 'sawtooth', 0.18, 0.3, 0);
    this._beep(150, 'sawtooth', 0.22, 0.3, 0.12);
  }

  win() {
    [0, 0.1, 0.2, 0.3, 0.45, 0.6].forEach((d, i) => {
      const freqs = [523, 659, 784, 1047, 1319, 1568];
      this._beep(freqs[i], 'sine', 0.3, 0.3, d);
    });
  }

  streak() {
    this._beep(880, 'sine', 0.08, 0.4, 0);
    this._beep(1108,'sine', 0.08, 0.35, 0.08);
    this._beep(1320,'sine', 0.14, 0.4, 0.16);
  }

  speedBonus() {
    this._beep(1047, 'triangle', 0.15, 0.45, 0);
    this._beep(1319, 'triangle', 0.15, 0.35, 0.1);
  }

  toggle() {
    this._muted = !this._muted;
    return !this._muted;
  }

  get muted() { return this._muted; }
}
