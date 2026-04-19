/* ================================================================
   sound.js — MathWar SoundSystem v2 (Web Audio API — zero dependencies)
   MOBILE FIX: AudioContext is unlocked on the FIRST user gesture.
   Browsers (especially iOS Safari, Chrome Android) block AudioContext
   until a real user interaction. We defer context creation until the
   first touch/click, and attach a one-time unlock listener.
   ================================================================ */
class SoundSystem {
  constructor() {
    this._ctx    = null;
    this._muted  = false;
    this._ready  = false;  // true once context is running
    this._queue  = [];     // sounds queued before unlock
    this._attachUnlockListeners();
  }

  /* ── Unlock on first gesture (mobile requirement) ── */
  _attachUnlockListeners() {
    const unlock = () => {
      this._ensureContext();
      // Remove after first successful unlock
      if (this._ctx && this._ctx.state !== 'suspended') {
        document.removeEventListener('touchstart', unlock, true);
        document.removeEventListener('touchend',   unlock, true);
        document.removeEventListener('click',      unlock, true);
        document.removeEventListener('keydown',    unlock, true);
        this._ready = true;
        // Drain any queued sounds
        this._queue.forEach(fn => fn());
        this._queue = [];
      }
    };
    document.addEventListener('touchstart', unlock, { capture: true, passive: true });
    document.addEventListener('touchend',   unlock, { capture: true, passive: true });
    document.addEventListener('click',      unlock, { capture: true, passive: true });
    document.addEventListener('keydown',    unlock, { capture: true, passive: true });
  }

  /* ── Lazily create AudioContext ── */
  _ensureContext() {
    if (this._ctx) {
      // Resume if suspended (standard unlock flow)
      if (this._ctx.state === 'suspended') {
        this._ctx.resume().then(() => { this._ready = true; }).catch(() => {});
      }
      return;
    }
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this._ctx.state === 'running') this._ready = true;
      else {
        this._ctx.resume().then(() => { this._ready = true; }).catch(() => {});
      }
    } catch(e) {
      console.warn('[Sound] Web Audio API not supported on this device.');
    }
  }

  /* ── Resume helper (called externally by app.js on game start) ── */
  _resume() {
    this._ensureContext();
  }

  /* ── Internal beep generator ── */
  _beep(freq, type, dur, vol = 0.4, delay = 0) {
    if (this._muted) return;

    const play = () => {
      if (!this._ctx || this._ctx.state === 'suspended') return;
      try {
        const osc  = this._ctx.createOscillator();
        const gain = this._ctx.createGain();
        osc.connect(gain);
        gain.connect(this._ctx.destination);
        osc.type = type;
        osc.frequency.value = freq;
        const t = this._ctx.currentTime + delay;
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      } catch(e) { /* silent fail */ }
    };

    if (this._ready) {
      play();
    } else {
      // Ensure context attempt, then queue
      this._ensureContext();
      this._queue.push(play);
    }
  }

  /* ── Public sound methods ── */
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
    this._beep(880,  'sine', 0.08, 0.4,  0);
    this._beep(1108, 'sine', 0.08, 0.35, 0.08);
    this._beep(1320, 'sine', 0.14, 0.4,  0.16);
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
