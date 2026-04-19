/* ================================================================
   MATHWAR — GAME.JS
   All 5 Classes: UIPresentation, Calculator, GameController,
                  AnimationEngine, UserInput
   ================================================================ */

/* ════════════════════════════════════════════════════════════════
   CLASS 1: UIPresentation — DOM updates & feedback
   ════════════════════════════════════════════════════════════════ */
class UIPresentation {
  updateProblem(player, text) {
    const el = document.getElementById(`problem${player}`);
    if (!el) return;
    el.textContent = text;
    // Subtle pop animation on new problem
    el.style.transform = 'scale(1.08)';
    el.style.transition = 'transform 0.2s ease';
    setTimeout(() => {
      el.style.transform = 'scale(1)';
    }, 200);
  }

  updateInput(player, text) {
    const el = document.getElementById(`input${player}`);
    if (!el) return;
    el.textContent = text || '_';
  }

  updateScore(player, score) {
    const el = document.getElementById(`score${player}`);
    if (!el) return;
    el.textContent = `Score: ${score}`;
    // N-04 FIX: score-pulse glow on correct answer
    el.classList.remove('score-pulse');
    void el.offsetWidth; // reflow to restart
    el.classList.add('score-pulse');
    setTimeout(() => el.classList.remove('score-pulse'), 400);
  }

  // N-03 FIX: panel 3D forward-pulse on correct answer
  triggerPanelPulse(player) {
    const el = document.getElementById(`panel${player}`);
    if (!el) return;
    el.classList.remove('panel-pulse');
    void el.offsetWidth; // reflow to restart animation
    el.classList.add('panel-pulse');
    setTimeout(() => el.classList.remove('panel-pulse'), 520);
  }

  updateTimer(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    const el = document.getElementById('timerDisplay');
    if (!el) return;
    el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    if (seconds <= 10) {
      el.classList.add('timer-danger');
    } else {
      el.classList.remove('timer-danger');
    }
  }

  flashCorrect(player) {
    const el = document.getElementById(`inputBox${player}`);
    if (!el) return;
    el.classList.remove('flash-wrong');
    el.classList.add('flash-correct');
    setTimeout(() => el.classList.remove('flash-correct'), 600);
  }

  flashIncorrect(player) {
    const el = document.getElementById(`inputBox${player}`);
    if (!el) return;
    el.classList.remove('flash-correct');
    el.classList.add('flash-wrong');
    setTimeout(() => el.classList.remove('flash-wrong'), 600);
  }

  showWinModal(winner, score1, score2) {
    const winnerText = document.getElementById('winnerText');
    const winDetail = document.getElementById('winDetail');
    const trophy = document.getElementById('trophyEmoji');

    if (winner === 'tie') {
      winnerText.textContent = "IT'S A TIE! 🤝";
      winnerText.style.color = '#F57F17';
      trophy.textContent = '🤝';
      winDetail.textContent = 'Equally matched! Try again to break the tie!';
    } else {
      winnerText.textContent = `PLAYER ${winner} WINS! 🎉`;
      winnerText.style.color = winner === 1 ? '#42A5F5' : '#EF5350';
      trophy.textContent = '🏆';
      winDetail.textContent = winner === 1
        ? 'Brilliant math skills, Blue Team!'
        : 'Magnificent performance, Red Team!';
    }

    // Update final scores in modal
    const fs1 = document.getElementById('finalScore1');
    const fs2 = document.getElementById('finalScore2');
    if (fs1) fs1.textContent = score1 || 0;
    if (fs2) fs2.textContent = score2 || 0;

    document.getElementById('modal').classList.remove('hidden');
  }

  hideModal() {
    document.getElementById('modal').classList.add('hidden');
  }

  showDiffBadge(player) {
    const id = `diffBadge${player}`;
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    // Remove and re-add to restart animation
    el.style.animation = 'none';
    void el.offsetWidth; // reflow
    el.style.animation = '';
    setTimeout(() => el.classList.add('hidden'), 2100);
  }
}

/* ════════════════════════════════════════════════════════════════
   CLASS 2: Calculator — Input handling, problem generation
   ════════════════════════════════════════════════════════════════ */
class Calculator {
  constructor(playerId, gameController, ui) {
    this.playerId = playerId;
    this.gc = gameController;
    this.ui = ui;
    this.currentInput = '';
    this.currentProblem = null;
    this.correctCount = 0;
    this.locked = false;
    this.difficulty = 'easy';
    // P3-T9: Streak & speed bonus tracking
    this.streak = 0;
    this.lastSubmitTime = 0;
    this.consecutiveWrong = 0;
    this._badgeTimer = null;
  }

  handleInput(value) {
    if (this.locked || !this.gc.gameActive) return;

    switch (value) {
      case 'clear':
        this.currentInput = '';
        break;
      case 'delete':
        this.currentInput = this.currentInput.slice(0, -1);
        break;
      case 'submit':
        this.submit();
        return;
      default:
        // P2-T8 FIX: Accept digits 0-9, max 4 chars. Support negative via '-' prefix.
        if (/^[0-9]$/.test(value) && this.currentInput.replace('-','').length < 4) {
          if (this.currentInput === '0') {
            this.currentInput = value;
          } else {
            this.currentInput += value;
          }
        } else if (value === '-' && this.currentInput === '') {
          // Allow leading minus for negative answers
          this.currentInput = '-';
        }
    }
    this.ui.updateInput(this.playerId, this.currentInput);
  }

  submit() {
    if (!this.currentInput || this.locked || !this.gc.gameActive) return;

    // Anti-double-tap lockout
    this.locked = true;
    setTimeout(() => { this.locked = false; }, 280);

    const guess = parseInt(this.currentInput, 10);
    const correct = this.currentProblem && guess === this.currentProblem.answer;

    if (correct) {
      this.streak++;
      this.consecutiveWrong = 0;
      this.correctCount++;
      this.ui.flashCorrect(this.playerId);
      this.ui.triggerPanelPulse(this.playerId); // N-03 FIX: 3D panel forward pulse
      this.ui.updateScore(this.playerId, this.correctCount);
      this.gc.onCorrectAnswer(this.playerId);
      const leveled = this.upgradeDifficulty();
      if (leveled) this.ui.showDiffBadge(this.playerId);

      // P3-T9: Speed bonus — solved in under 3 seconds
      const solveTime = (Date.now() - this.lastSubmitTime) / 1000;
      if (this.lastSubmitTime > 0 && solveTime < 3) {
        this.gc.onSpeedBonus(this.playerId);
        if (typeof sounds !== 'undefined' && sounds) sounds.speedBonus();
        this._showBadge('FAST!', 'speed-badge');
      }

      // P3-T9: Streak badge — 3+ consecutive correct
      if (this.streak >= 3) {
        if (typeof sounds !== 'undefined' && sounds) sounds.streak();
        this._showBadge(this.streak + 'x STREAK!', 'streak-badge');
      }

      // Sound hook
      if (typeof sounds !== 'undefined' && sounds) sounds.correct();
      this.newProblem();
    } else {
      this.streak = 0;
      this.consecutiveWrong++;
      this.ui.flashIncorrect(this.playerId);
      // Sound hook
      if (typeof sounds !== 'undefined' && sounds) sounds.wrong();
      // P3-T13: Trigger AI hint — PRACTICE: after 1 wrong, others: after 3 wrong
      if (this.consecutiveWrong >= (this.gc.gameMode === 'practice' ? 1 : 3) && typeof getAIHint === 'function') {
        getAIHint(this.currentProblem, this.playerId);
        this.consecutiveWrong = 0; // reset so it doesn't spam
      }
    }

    this.lastSubmitTime = Date.now();
    this.currentInput = '';
    this.ui.updateInput(this.playerId, '');
  }

  // P3-T9: Show speed/streak badge
  _showBadge(text, className) {
    const el = document.getElementById(`streakBadge${this.playerId}`);
    if (!el) return;
    el.textContent = text;
    el.className = className;
    el.classList.remove('hidden');
    clearTimeout(this._badgeTimer);
    this._badgeTimer = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  newProblem() {
    this.currentProblem = this.generateProblem();
    this.ui.updateProblem(this.playerId, this.currentProblem.question);
  }

  /** Returns true if difficulty was upgraded */
  upgradeDifficulty() {
    const prevDiff = this.difficulty;
    if (this.correctCount >= 10 && this.difficulty !== 'hard') {
      this.difficulty = 'hard';
    } else if (this.correctCount >= 5 && this.difficulty === 'easy') {
      this.difficulty = 'medium';
    }
    return this.difficulty !== prevDiff;
  }

  generateProblem() {
    const r = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

    const problems = {
      easy: [
        () => {
          const a = r(1, 20), b = r(1, 20);
          return { question: `${a} + ${b} = ?`, answer: a + b };
        },
        () => {
          const a = r(5, 20), b = r(1, a);
          return { question: `${a} − ${b} = ?`, answer: a - b };
        },
        () => {
          const a = r(1, 10), b = r(1, 10);
          return { question: `${a} + ${b} = ?`, answer: a + b };
        },
      ],
      medium: [
        () => {
          const a = r(2, 9), b = r(2, 9);
          return { question: `${a} × ${b} = ?`, answer: a * b };
        },
        () => {
          const b = r(2, 9), a = b * r(1, 9);
          return { question: `${a} ÷ ${b} = ?`, answer: a / b };
        },
        () => {
          const a = r(10, 50), b = r(1, 30);
          return { question: `${a} + ${b} = ?`, answer: a + b };
        },
        () => {
          const a = r(20, 60), b = r(1, a - 5);
          return { question: `${a} − ${b} = ?`, answer: a - b };
        },
      ],
      hard: [
        () => {
          const a = r(2, 10), b = r(2, 10), c = r(2, 5);
          return { question: `(${a}+${b})×${c} = ?`, answer: (a + b) * c };
        },
        () => {
          const a = r(10, 99), b = r(1, a - 1);
          return { question: `${a} − ${b} = ?`, answer: a - b };
        },
        () => {
          const a = r(2, 12), b = r(2, 12);
          return { question: `${a} × ${b} = ?`, answer: a * b };
        },
        () => {
          const b = r(2, 9), a = b * r(2, 11);
          return { question: `${a} ÷ ${b} = ?`, answer: a / b };
        },
        () => {
          const a = r(10, 50), b = r(10, 50);
          return { question: `${a} + ${b} = ?`, answer: a + b };
        },
      ],
    };

    const set = problems[this.difficulty];
    return set[r(0, set.length - 1)]();
  }

  reset() {
    this.currentInput = '';
    this.correctCount = 0;
    this.locked = false;
    this.difficulty = 'easy';
    this.streak = 0;
    this.consecutiveWrong = 0;
    this.lastSubmitTime = 0;
    this.newProblem();
    this.ui.updateInput(this.playerId, '');
    this.ui.updateScore(this.playerId, 0);
  }
}

/* ════════════════════════════════════════════════════════════════
   CLASS 3: GameController — Timer, win conditions, state
   ════════════════════════════════════════════════════════════════ */
class GameController {
  constructor(animEngine, ui) {
    this.animEngine = animEngine;
    this.ui = ui;
    this.ropePosition = 0;
    this.timerSeconds = 60;
    this.gameActive = false;
    this.isPaused = false;
    this.timerInterval = null;
    this._score1 = 0;
    this._score2 = 0;
    this.gameMode = 'pvp';         // P4-T16: track mode
    this._blitzTimer = null;       // P4-T16: blitz per-problem timer
    this.blitzTimePerProblem = 3;
  }

  start() {
    this.gameActive = true;
    this.timerSeconds = 60;
    this.ui.updateTimer(60);

    // Trigger GO! animation
    this.animEngine.triggerGoAnimation();

    // P3-T9: Practice mode — no timer countdown, show infinity
    if (this.gameMode === 'practice') {
      const timerEl = document.getElementById('timerDisplay');
      if (timerEl) timerEl.textContent = '∞';
      return; // don't start interval
    }

    // Start timer with a small delay (GO! anim plays first)
    setTimeout(() => {
      this.timerInterval = setInterval(() => {
        if (!this.gameActive) return;
        this.timerSeconds--;
        this.ui.updateTimer(this.timerSeconds);
        if (this.timerSeconds <= 0) {
          this.onTimerEnd();
        }
      }, 1000);
    }, 1500);
  }

  onCorrectAnswer(player) {
    if (!this.gameActive) return;

    // Track scores & move rope
    if (player === 1) {
      this._score1++;
      this.ropePosition -= 15;
    } else {
      this._score2++;
      this.ropePosition += 15;
    }
    this.ropePosition = Math.max(-100, Math.min(100, this.ropePosition));
    this.animEngine.setTarget(this.ropePosition);

    // Enhanced visual feedback: rope shake + pull heave + dust particles
    this.animEngine.triggerRopeShake();
    // side: -1 means P1 is pulling (rope goes left), +1 means P2
    const side = player === 1 ? -1 : 1;
    // Approximate ground coords — AnimationEngine reads canvas internally
    const canvas = document.getElementById('arenaCanvas');
    const W = canvas ? canvas.width  : 200;
    const H = canvas ? canvas.height : 300;
    const offset = (this.ropePosition / 100) * W * 0.22;
    const groundX = player === 1 ? W * 0.28 + offset : W * 0.72 + offset;
    const groundY = H * 0.72;
    this.animEngine.triggerPull(side, groundX, groundY);

    this.checkWin();
  }


  checkWin() {
    if (this.ropePosition <= -100) {
      this.endGame(1);
    } else if (this.ropePosition >= 100) {
      this.endGame(2);
    }
  }

  onTimerEnd() {
    if (this.ropePosition < 0) {
      this.endGame(1);
    } else if (this.ropePosition > 0) {
      this.endGame(2);
    } else {
      this.endGame('tie');
    }
  }

  // P3-T9: Speed bonus — award +1 extra to score
  onSpeedBonus(player) {
    if (!this.gameActive) return;
    if (player === 1) {
      this._score1++;
      this.ui.updateScore(1, this._score1);
      this.ropePosition -= 8;
    } else {
      this._score2++;
      this.ui.updateScore(2, this._score2);
      this.ropePosition += 8;
    }
    this.ropePosition = Math.max(-100, Math.min(100, this.ropePosition));
    this.animEngine.setTarget(this.ropePosition);
  }

  endGame(winner) {
    this.stopGame();
    this.ui.showWinModal(winner, this._score1, this._score2);
  }

  stopGame() {
    this.gameActive = false;
    this.isPaused = false;
    clearInterval(this.timerInterval);
    this.timerInterval = null;
  }

  // P3-T10: Pause/Resume system
  pause() {
    if (!this.gameActive || this.isPaused) return;
    this.isPaused = true;
    this.gameActive = false;
    clearInterval(this.timerInterval);
    this.timerInterval = null;
  }

  resume() {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.gameActive = true;
    this.timerInterval = setInterval(() => {
      if (!this.gameActive) return;
      this.timerSeconds--;
      this.ui.updateTimer(this.timerSeconds);
      if (this.timerSeconds <= 0) this.onTimerEnd();
    }, 1000);
  }

  reset() {
    this.ropePosition = 0;
    this.timerSeconds = 60;
    this.gameActive = false;
    this.isPaused = false;
    this._score1 = 0;
    this._score2 = 0;
    this.gameMode = 'pvp';
    clearInterval(this.timerInterval);
    clearTimeout(this._blitzTimer);
    this.timerInterval = null;
    this._blitzTimer = null;
    this.animEngine.setTarget(0);
    this.animEngine.resetPosition();
    this.ui.updateTimer(60);
  }

  // P4-T16: Speed Blitz Mode
  startBlitz() {
    this.gameMode = 'blitz';
    this.blitzTimePerProblem = 3;
    this.gameActive = true;
    this.timerSeconds = 60;
    this.ui.updateTimer(60);
    this.animEngine.triggerGoAnimation();
    setTimeout(() => {
      this.timerInterval = setInterval(() => {
        if (!this.gameActive) return;
        this.timerSeconds--;
        this.ui.updateTimer(this.timerSeconds);
        if (this.timerSeconds <= 0) this.onTimerEnd();
      }, 1000);
      this._startBlitzProblemTimer();
    }, 1500);
  }

  _startBlitzProblemTimer() {
    clearTimeout(this._blitzTimer);
    this._blitzTimer = setTimeout(() => {
      if (!this.gameActive) return;
      this.ui.flashIncorrect(1);
      this.ui.flashIncorrect(2);
      if (typeof sounds !== 'undefined' && sounds) sounds.wrong();
      const penalty = 5;
      if (this.ropePosition > 0) {
        this.ropePosition = Math.max(-100, this.ropePosition - penalty);
      } else {
        this.ropePosition = Math.min(100, this.ropePosition + penalty);
      }
      this.animEngine.setTarget(this.ropePosition);
      this.checkWin();
      if (this.gameActive) this._startBlitzProblemTimer();
    }, this.blitzTimePerProblem * 1000);
  }

  // Survival Mode ☠️ — 90s with random chaos events
  startSurvival() {
    this.gameMode = 'survival';
    this.gameActive = true;
    this.timerSeconds = 90;
    this._pointMultiplier = 1;
    this.ui.updateTimer(90);
    this.animEngine.triggerGoAnimation();
    this._scheduleChaosEvent();
    setTimeout(() => {
      this.timerInterval = setInterval(() => {
        if (!this.gameActive) return;
        this.timerSeconds--;
        this.ui.updateTimer(this.timerSeconds);
        if (this.timerSeconds <= 0) this.onTimerEnd();
      }, 1000);
    }, 1500);
  }

  _scheduleChaosEvent() {
    const next = 8000 + Math.random() * 5000;
    this._chaosTimer = setTimeout(() => {
      if (!this.gameActive) return;
      this._triggerChaosEvent();
      this._scheduleChaosEvent();
    }, next);
  }

  _triggerChaosEvent() {
    const events = ['double_points','rope_spring','problem_swap'];
    const ev = events[Math.floor(Math.random() * events.length)];
    const labels = { double_points:'⚡ DOUBLE POINTS!', rope_spring:'🌪 ROPE SPRING!', problem_swap:'🔀 PROBLEM SWAP!' };
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:500;font-family:"Fredoka One",cursive;font-size:2.5rem;color:#FFD700;text-shadow:0 0 30px rgba(255,215,0,0.8);pointer-events:none;opacity:1;transition:opacity 1.5s;';
    banner.textContent = labels[ev] || '⚡ CHAOS!';
    document.body.appendChild(banner);
    setTimeout(() => { banner.style.opacity = '0'; setTimeout(() => banner.remove(), 500); }, 1500);
    switch(ev) {
      case 'double_points':
        this._pointMultiplier = 2;
        setTimeout(() => { this._pointMultiplier = 1; }, 8000);
        break;
      case 'rope_spring':
        this.ropePosition *= 0.8;
        this.animEngine.setTarget(this.ropePosition);
        this.animEngine.triggerRopeShake();
        break;
      case 'problem_swap':
        this.animEngine.triggerRopeShake();
        break;
    }
  }
}


/* ════════════════════════════════════════════════════════════════
   CLASS 4: AnimationEngine — 3D Enhanced Canvas @ 60fps
   Features: Particle system · Heave animation · 3D figures
             Twisted rope · Stadium glow · Victory fireworks
   ════════════════════════════════════════════════════════════════ */

/* ── Particle ─────────────────────────────────────── */
class Particle {
  constructor(x, y, vx, vy, life, color, size = 3, type = 'dust') {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.color = color; this.size = size;
    this.type = type; // 'dust' | 'spark' | 'confetti' | 'star'
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.3;
    this.gravity = type === 'spark' ? 0.18 : type === 'confetti' ? 0.06 : 0.04;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.vx *= 0.96;
    this.life--;
    this.rotation += this.rotSpeed;
  }
  get alpha() { return Math.max(0, this.life / this.maxLife); }
  get dead() { return this.life <= 0; }
}

class AnimationEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx    = this.canvas.getContext('2d');
    // Rope
    this.ropePositionTarget  = 0;
    this.ropePositionCurrent = 0;
    // Phases
    this.animPhase   = 0;
    this.cloudOffset = 0;
    this.crowdPhase  = 0;
    // Timers
    this.ropeShakeTimer = 0;
    this.goAnimTimer    = 0;
    // Heave (pull-jerk) animation
    this.heaveTimer = 0;   // frames remaining
    this.heaveSide  = 0;   // -1=P1, +1=P2
    // Particle system
    this.particles = [];
    // Screen edge glow
    this.glowIntensity = 0;
    this.glowColor     = '#1565C0';
    // Victory burst
    this.victoryBurstDone = false;
    // RAF
    this.rafId     = null;
    this.isRunning = false;
    // Resize
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(this.canvas.parentElement);
    this.resize();
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    // Get the timer element height to exclude it
    const timerEl = document.getElementById('timerDisplay');
    const timerH = timerEl ? timerEl.offsetHeight + 14 : 0;
    this.canvas.width = parent.offsetWidth;
    this.canvas.height = parent.offsetHeight - timerH;
  }

  setTarget(target) { this.ropePositionTarget = target; }

  triggerRopeShake() { this.ropeShakeTimer = 28; }

  triggerGoAnimation() {
    this.goAnimTimer = 90;
    this.victoryBurstDone = false;
  }

  /** Spawn dust + sparks + start heave pose when player answers correctly */
  triggerPull(side, groundX, groundY) {
    this.heaveTimer = 24;
    this.heaveSide  = side; // -1=P1 left pull, +1=P2 right pull
    // Dust cloud at team's feet
    for (let i = 0; i < 16; i++) {
      const angle = Math.PI + (Math.random() - 0.5) * 1.6;
      const spd   = 1 + Math.random() * 2.8;
      this.particles.push(new Particle(
        groundX, groundY - 5,
        Math.cos(angle) * spd * -side,
        Math.sin(angle) * spd - 1.5,
        30 + Math.random() * 20,
        `rgba(${side === -1 ? '60,100,200' : '200,80,30'},${0.4 + Math.random() * 0.5})`,
        3 + Math.random() * 5, 'dust'
      ));
    }
    // Rope sparks at hand position
    for (let i = 0; i < 10; i++) {
      this.particles.push(new Particle(
        groundX, groundY - 50,
        (Math.random() - 0.5) * 5,
        -2.5 - Math.random() * 3.5,
        22 + Math.random() * 14,
        side === -1 ? '#64B5F6' : '#FF8A65',
        1.5 + Math.random() * 2.5, 'spark'
      ));
    }
    // Edge glow burst
    this.glowIntensity = 1.0;
    this.glowColor = side === -1 ? '#1565C0' : '#E64A19';
  }

  /** Spawn victory confetti burst */
  triggerVictoryBurst(side, W, H) {
    if (this.victoryBurstDone) return;
    this.victoryBurstDone = true;
    const cols = side === -1
      ? ['#42A5F5','#1565C0','#E3F2FD','#FFD700','#BBDEFB','#FFFFFF']
      : ['#FF7043','#E64A19','#FFCCBC','#FFD700','#FF8A65','#FFFFFF'];
    const cx = side === -1 ? W * 0.25 : W * 0.75;
    for (let i = 0; i < 90; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 2.5 + Math.random() * 5.5;
      this.particles.push(new Particle(
        cx, H * 0.45,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd - 4,
        55 + Math.random() * 45,
        cols[Math.floor(Math.random() * cols.length)],
        4 + Math.random() * 6, 'confetti'
      ));
    }
  }

  resetPosition() {
    this.ropePositionCurrent = 0;
    this.ropePositionTarget  = 0;
    this.goAnimTimer    = 0;
    this.ropeShakeTimer = 0;
    this.heaveTimer     = 0;
    this.heaveSide      = 0;
    this.particles      = [];
    this.glowIntensity  = 0;
    this.victoryBurstDone = false;
  }

  // P3-T7: B-02 FIX — wrap in outer RAF to let DOM fully settle before first render
  startLoop() {
    if (this.isRunning) return;
    this.isRunning = true;
    requestAnimationFrame(() => {       // <-- outer wrapping RAF lets DOM fully settle
      this.resize();                     // <-- force correct canvas size first
      const loop = () => {
        this.render();
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
    });
  }

  stopLoop() {
    this.isRunning = false;
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  render() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const ctx = this.ctx;
    if (W <= 0 || H <= 0) return;

    // State updates
    this.ropePositionCurrent += (this.ropePositionTarget - this.ropePositionCurrent) * 0.08;
    this.animPhase   += 0.08;
    this.cloudOffset  = (this.cloudOffset + 0.15) % (W + 80);
    this.crowdPhase  += 0.04;
    if (this.heaveTimer  > 0) this.heaveTimer--;
    if (this.glowIntensity > 0) this.glowIntensity = Math.max(0, this.glowIntensity - 0.025);
    ctx.clearRect(0, 0, W, H);
    const groundY = H * 0.72;

    // SKY
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#5B9FD4'); sky.addColorStop(0.5, '#A8D8EF'); sky.addColorStop(1, '#DDF0FA');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, groundY);

    // EDGE GLOW (winning side flash)
    if (this.glowIntensity > 0.02) {
      const ex = this.heaveSide <= 0 ? 0 : W;
      const eg = ctx.createRadialGradient(ex, H*0.5, 0, ex, H*0.5, W*0.65);
      const hc = this.glowColor;
      eg.addColorStop(0, hc + 'BB'); eg.addColorStop(0.6, hc + '33'); eg.addColorStop(1, hc + '00');
      ctx.save(); ctx.globalAlpha = this.glowIntensity; ctx.fillStyle = eg; ctx.fillRect(0,0,W,H); ctx.restore();
    }

    // MOVING CLOUDS
    this._drawCloud(ctx, (this.cloudOffset * 0.28) % (W + 70) - 35, H*0.07, 0.85);
    this._drawCloud(ctx, (this.cloudOffset * 0.18 + W*0.55) % (W + 70) - 35, H*0.14, 0.65);

    // CROWD SILHOUETTE
    this._drawCrowdSilhouette(ctx, W, groundY);

    // GROUND
    const gnd = ctx.createLinearGradient(0, groundY, 0, H);
    gnd.addColorStop(0,'#4CAF50'); gnd.addColorStop(0.2,'#388E3C'); gnd.addColorStop(1,'#1B5E20');
    ctx.fillStyle = gnd; ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = '#81C784'; ctx.fillRect(0, groundY, W, 4);
    ctx.fillStyle = '#A5D6A7'; ctx.fillRect(0, groundY, W, 1.5);

    // CENTER LINE + FLAG
    ctx.save(); ctx.setLineDash([10,7]); ctx.strokeStyle='rgba(255,255,255,0.75)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(W/2,0); ctx.lineTo(W/2, groundY-2); ctx.stroke(); ctx.restore();
    this._drawCenterFlag(ctx, W/2, 22);

    // POSITIONS
    const maxOffset = W * 0.22;
    const offset    = (this.ropePositionCurrent / 100) * maxOffset;
    const p1LeadX   = W * 0.28 + offset;
    const p2LeadX   = W * 0.72 + offset;
    const p1Heaving = this.heaveTimer > 0 && this.heaveSide === -1;
    const p2Heaving = this.heaveTimer > 0 && this.heaveSide ===  1;
    const heaveStr  = this.heaveTimer / 24;

    // TWISTED ROPE
    const p1HandX = p1LeadX + 24;
    const p1HandY = groundY - (p1Heaving ? 56 + heaveStr*12 : 48);
    const p2HandX = p2LeadX - 24;
    const p2HandY = groundY - (p2Heaving ? 56 + heaveStr*12 : 48);
    let shakeY = 0;
    if (this.ropeShakeTimer > 0) { shakeY = Math.sin(this.ropeShakeTimer * 1.5) * 9; this.ropeShakeTimer--; }
    const tension = Math.abs(this.ropePositionCurrent);
    const sag = Math.max(4, 24 - tension * 0.15);
    const cpX = (p1HandX + p2HandX) / 2;
    const cpY = (p1HandY + p2HandY) / 2 + sag + shakeY;
    this._drawTwistedRope(ctx, p1HandX, p1HandY, p2HandX, p2HandY, cpX, cpY);

    // Tension glow at center knot when high tension
    if (tension > 55) {
      const ta = (tension - 55) / 45 * 0.7;
      ctx.save(); ctx.shadowColor=`rgba(255,100,0,${ta})`; ctx.shadowBlur=20;
      ctx.beginPath(); ctx.arc(cpX, cpY, 5, 0, Math.PI*2);
      ctx.fillStyle=`rgba(255,120,0,${ta})`; ctx.fill(); ctx.restore();
    }

    // P3-T8: AURORA glow behind figures (B-07 FIX)
    this._drawAurora(ctx, p1LeadX - 42, groundY - 34, 'rgba(21,101,192,', 55);
    this._drawAurora(ctx, p2LeadX + 42, groundY - 34, 'rgba(198,40,40,',   55);

    // FIGURES — P1 (blue)
    this.drawFigure(ctx, p1LeadX-84, groundY,'#0D47A1','#1976D2','right',false, this.animPhase+1.5, false);
    this.drawFigure(ctx, p1LeadX-42, groundY,'#0D47A1','#1976D2','right',false, this.animPhase+0.8, false);
    this.drawFigure(ctx, p1LeadX,    groundY,'#0D47A1','#1976D2','right',true,  this.animPhase,     p1Heaving);

    // FIGURES — P2 (orange-red)
    this.drawFigure(ctx, p2LeadX,    groundY,'#BF360C','#E64A19','left',true,  this.animPhase,     p2Heaving);
    this.drawFigure(ctx, p2LeadX+42, groundY,'#BF360C','#E64A19','left',false, this.animPhase+0.8, false);
    this.drawFigure(ctx, p2LeadX+84, groundY,'#BF360C','#E64A19','left',false, this.animPhase+1.5, false);

    // PARTICLES
    this._renderParticles(ctx);

    // POWER BARS
    this._drawPowerBars(ctx, W, H, this.ropePositionCurrent);

    // WIN ZONE GLOW at extremes
    if (this.ropePositionCurrent < -72) {
      const a = (Math.abs(this.ropePositionCurrent)-72)/28*0.3;
      ctx.fillStyle=`rgba(13,71,161,${a})`; ctx.fillRect(0,0,W*0.4,H);
    } else if (this.ropePositionCurrent > 72) {
      const a = (this.ropePositionCurrent-72)/28*0.3;
      ctx.fillStyle=`rgba(191,54,12,${a})`; ctx.fillRect(W*0.6,0,W*0.4,H);
    }

    // Auto-fire victory burst
    if (Math.abs(this.ropePositionCurrent) > 85) {
      this.triggerVictoryBurst(this.ropePositionCurrent < 0 ? -1 : 1, W, H);
    }

    // GO! ANIMATION
    if (this.goAnimTimer > 0) { this._drawGoAnimation(ctx, W, H, this.goAnimTimer); this.goAnimTimer--; }
  }


  drawFigure(ctx, x, groundY, color, colorLight, facing, isLead, phase, isHeaving) {
    const s = isLead ? 1.05 : 0.88;
    const H = 68 * s;
    ctx.save();
    ctx.translate(x, groundY);

    // Heaving: extra lean-back + body strain
    const baseLean = facing === 'right' ? 0.26 : -0.26;
    const heaveLean = isHeaving ? (facing === 'right' ? -0.12 : 0.12) : 0;
    ctx.rotate(baseLean + heaveLean);

    const bW = H * 0.32;
    const bH = H * 0.35;
    const bTop = -H + H * 0.20;

    // SHADOW
    ctx.save();
    ctx.globalAlpha = isHeaving ? 0.28 : 0.18;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 2, bW * (isHeaving ? 1.2 : 0.9), 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // LEGS — wider stance when heaving
    const legTop = bTop + bH + bH * 0.52;
    const stance = isHeaving ? 1.8 : 1.0;
    const legSwing = Math.sin(phase) * (isHeaving ? 18 : 14);
    ctx.lineWidth = Math.max(5, H * 0.13);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#263238';
    ctx.beginPath();
    ctx.moveTo(-bW * 0.18 * stance, legTop);
    ctx.lineTo(-bW * 0.18 * stance - legSwing * 0.4, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bW * 0.18 * stance, legTop);
    ctx.lineTo(bW * 0.18 * stance + legSwing * 0.4, 0);
    ctx.stroke();

    // SHOES
    ctx.fillStyle = '#212121';
    const shoe1X = -bW * 0.18 * stance - legSwing * 0.4;
    const shoe2X =  bW * 0.18 * stance + legSwing * 0.4;
    ctx.beginPath(); ctx.ellipse(shoe1X, 2, H*0.11, H*0.048, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(shoe2X, 2, H*0.11, H*0.048, 0, 0, Math.PI*2); ctx.fill();

    // PANTS
    ctx.fillStyle = '#37474F';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-bW/2, bTop+bH-2, bW, bH*0.54, 3);
    else ctx.rect(-bW/2, bTop+bH-2, bW, bH*0.54);
    ctx.fill();

    // SHIRT (gradient + shading stripe for 3D)
    const grad = ctx.createLinearGradient(-bW/2, bTop, bW/2, bTop+bH);
    grad.addColorStop(0, colorLight);
    grad.addColorStop(0.6, color);
    grad.addColorStop(1, color+'CC');
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-bW/2, bTop, bW, bH, 6);
    else ctx.rect(-bW/2, bTop, bW, bH);
    ctx.fill();
    // Shirt highlight stripe
    ctx.save(); ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-bW*0.15, bTop+2, bW*0.1, bH*0.7, 3) : ctx.rect(-bW*0.15, bTop+2, bW*0.1, bH*0.7);
    ctx.fill(); ctx.restore();

    // ARMS — heaving = arms pulled way back
    const armY = bTop + bH * 0.22;
    const dir   = facing === 'right' ? 1 : -1;
    const swing  = isHeaving ? Math.sin(phase)*18 : Math.sin(phase)*10;
    const pullExt = isHeaving ? H * 0.38 : H * 0.28;
    ctx.lineWidth = Math.max(4, H * 0.105);
    ctx.lineCap = 'round';
    // Arm skin gradient
    ctx.strokeStyle = '#FFCCBC';
    // Pulling arm (extended toward rope)
    ctx.beginPath();
    ctx.moveTo(dir*bW/2, armY);
    ctx.lineTo(dir*(bW/2 + pullExt), armY - (isHeaving ? 12 : 5) + swing*0.5);
    ctx.stroke();
    // Back arm (bracing)
    ctx.beginPath();
    ctx.moveTo(-dir*bW/2, armY);
    ctx.lineTo(-dir*(bW/2 + H*0.22), armY + (isHeaving ? 8 : 4) - swing*0.4);
    ctx.stroke();

    // HEAD
    const headR = H * 0.17;
    const headY = -H + H * 0.02;
    // Hair cap
    ctx.beginPath(); ctx.arc(0, headY, headR+2.5, Math.PI, 0, false);
    ctx.fillStyle = color; ctx.fill();
    // Face skin
    ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI*2);
    ctx.fillStyle = '#FFCCBC'; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    // Eyes — narrowed/determined when heaving
    const eyeOff = headR * 0.34;
    ctx.fillStyle = '#263238';
    if (isHeaving) {
      // Squinted eyes (lines)
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#263238';
      ctx.beginPath(); ctx.moveTo(-eyeOff-headR*0.12, headY-headR*0.08); ctx.lineTo(-eyeOff+headR*0.12, headY-headR*0.08); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( eyeOff-headR*0.12, headY-headR*0.08); ctx.lineTo( eyeOff+headR*0.12, headY-headR*0.08); ctx.stroke();
      // Gritted teeth expression
      ctx.fillStyle = '#FFECB3';
      ctx.beginPath(); ctx.arc(0, headY+headR*0.28, headR*0.22, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#E0E0E0';
      for (let t = 0; t < 3; t++) {
        ctx.fillRect(-headR*0.18 + t*headR*0.14, headY+headR*0.22, headR*0.1, headR*0.12);
      }
      // Sweat drop
      ctx.fillStyle = 'rgba(100,180,255,0.8)';
      ctx.beginPath(); ctx.arc(headR*0.6, headY-headR*0.2, headR*0.07, 0, Math.PI*2); ctx.fill();
    } else {
      // Normal eyes
      ctx.beginPath(); ctx.arc(-eyeOff, headY-headR*0.1, headR*0.13, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc( eyeOff, headY-headR*0.1, headR*0.13, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, headY+headR*0.18, headR*0.28, 0.08, Math.PI-0.08, false);
      ctx.strokeStyle = '#E65100'; ctx.lineWidth = 1.3; ctx.stroke();
    }
    ctx.restore();
  }

  // P3-T8: B-07 FIX — Aurora radial glow behind stick figures
  _drawAurora(ctx, x, y, colorPrefix, radius) {
    const pulseScale = 1 + Math.sin(this.animPhase * 1.2) * 0.18;
    const r = radius * pulseScale;
    ctx.save();
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, colorPrefix + '0.22)');
    grad.addColorStop(0.5, colorPrefix + '0.10)');
    grad.addColorStop(1, colorPrefix + '0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.4, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawCloud(ctx, x, y, scale) {
    ctx.save();
    ctx.globalAlpha = 0.72;
    const r = 16 * scale;
    // Cloud shadow
    ctx.fillStyle = 'rgba(150,190,220,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + r*1.1, y + r*0.7, r*1.8, r*0.35, 0, 0, Math.PI*2);
    ctx.fill();
    // Cloud body
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x,         y,         r,        0, Math.PI*2);
    ctx.arc(x+r*1.15,  y-r*0.22,  r*0.88,   0, Math.PI*2);
    ctx.arc(x+r*2.15,  y,         r*0.78,   0, Math.PI*2);
    ctx.arc(x+r*0.55,  y+r*0.28,  r*0.72,   0, Math.PI*2);
    ctx.arc(x+r*1.6,   y+r*0.22,  r*0.65,   0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  _drawTwistedRope(ctx, x1, y1, x2, y2, cpX, cpY) {
    const SEGMENTS = 14;
    // Shadow
    ctx.beginPath();
    ctx.moveTo(x1+2, y1+4);
    ctx.quadraticCurveTo(cpX+2, cpY+5, x2+2, y2+4);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 9; ctx.lineCap='round'; ctx.stroke();

    // Draw twisted strands by sampling the quadratic curve
    const sample = (t) => ({
      x: (1-t)*(1-t)*x1 + 2*(1-t)*t*cpX + t*t*x2,
      y: (1-t)*(1-t)*y1 + 2*(1-t)*t*cpY + t*t*y2
    });
    // Outer rope
    ctx.beginPath();
    for (let i = 0; i <= SEGMENTS; i++) {
      const p = sample(i/SEGMENTS);
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 7; ctx.lineCap='round'; ctx.stroke();
    // Strand 1 (lighter)
    ctx.beginPath();
    for (let i = 0; i <= SEGMENTS; i++) {
      const p = sample(i/SEGMENTS);
      const twist = Math.sin(i/SEGMENTS * Math.PI * 4) * 2.5;
      i === 0 ? ctx.moveTo(p.x, p.y+twist) : ctx.lineTo(p.x, p.y+twist);
    }
    ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2.5; ctx.stroke();
    // Strand 2 (highlight)
    ctx.beginPath();
    for (let i = 0; i <= SEGMENTS; i++) {
      const p = sample(i/SEGMENTS);
      const twist = Math.sin(i/SEGMENTS * Math.PI * 4 + Math.PI) * 2.5;
      i === 0 ? ctx.moveTo(p.x, p.y+twist) : ctx.lineTo(p.x, p.y+twist);
    }
    ctx.strokeStyle = 'rgba(255,220,180,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    // Center knot
    ctx.beginPath(); ctx.arc(cpX, cpY, 5, 0, Math.PI*2);
    ctx.fillStyle = '#3E2723'; ctx.fill();
    ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  _drawCrowdSilhouette(ctx, W, groundY) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    const crowdY = groundY - 6;
    const cols = ['#1565C0','#E64A19','#37474F','#6A1B9A','#1B5E20'];
    for (let i = 0; i < 22; i++) {
      const cx = (W / 22) * i + (W / 44);
      const sway = Math.sin(this.crowdPhase + i * 0.7) * 2;
      const ph = i * 0.41;
      const h = 18 + Math.sin(ph) * 6;
      ctx.fillStyle = cols[i % cols.length];
      // Body
      ctx.beginPath();
      ctx.ellipse(cx, crowdY - h*0.3 + sway, 5.5, h*0.35, 0, 0, Math.PI*2); ctx.fill();
      // Head
      ctx.beginPath();
      ctx.arc(cx, crowdY - h*0.72 + sway, 5, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  _renderParticles(ctx) {
    ctx.save();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update();
      if (p.dead) { this.particles.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = p.alpha;
      if (p.type === 'confetti') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size/2, -p.size/4, p.size, p.size/2);
      } else if (p.type === 'spark') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
        // Spark trail
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.5;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx*3, p.y - p.vy*3); ctx.stroke();
      } else {
        // dust
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - p.life/p.maxLife * 0.4), 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  _drawCenterFlag(ctx, cx, flagY) {
    // Flag pole
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, flagY);
    ctx.lineTo(cx, flagY + 22);
    ctx.stroke();

    // Flag
    ctx.fillStyle = '#FF1744';
    ctx.beginPath();
    ctx.moveTo(cx, flagY);
    ctx.lineTo(cx + 14, flagY + 7);
    ctx.lineTo(cx, flagY + 14);
    ctx.closePath();
    ctx.fill();
  }

  _drawPowerBars(ctx, W, H, ropePos) {
    const barH = 7;
    const barY = H - barH - 4;
    const halfW = W / 2 - 12;

    // P1 bar (blue, left half)
    const p1Power = Math.max(0, -ropePos) / 100;
    ctx.fillStyle = 'rgba(21,101,192,0.25)';
    ctx.fillRect(6, barY, halfW, barH);
    if (p1Power > 0) {
      const grad = ctx.createLinearGradient(6, 0, 6 + halfW * p1Power, 0);
      grad.addColorStop(0, '#42A5F5');
      grad.addColorStop(1, '#1565C0');
      ctx.fillStyle = grad;
      ctx.fillRect(6, barY, halfW * p1Power, barH);
    }

    // P2 bar (red, right half)
    const p2Power = Math.max(0, ropePos) / 100;
    ctx.fillStyle = 'rgba(198,40,40,0.25)';
    ctx.fillRect(W / 2 + 6, barY, halfW, barH);
    if (p2Power > 0) {
      const grad = ctx.createLinearGradient(W / 2 + 6, 0, W / 2 + 6 + halfW * p2Power, 0);
      grad.addColorStop(0, '#C62828');
      grad.addColorStop(1, '#EF5350');
      ctx.fillStyle = grad;
      ctx.fillRect(W / 2 + 6, barY, halfW * p2Power, barH);
    }

    // Bar labels
    ctx.font = `bold ${Math.max(7, W * 0.05)}px Poppins, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(100,181,246,0.8)';
    ctx.fillText('P1', 8, barY - 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(239,154,154,0.8)';
    ctx.fillText('P2', W - 8, barY - 2);
  }

  _drawGoAnimation(ctx, W, H, timer) {
    // timer counts from 90 → 0
    const maxFrames = 90;
    const progress = 1 - timer / maxFrames;

    let scale, alpha;
    if (timer > 60) {
      // Phase 1: pop in (0→0.33)
      const t = (maxFrames - timer) / 30;
      scale = 0.5 + t * 1.0;
      alpha = t;
    } else if (timer > 30) {
      // Phase 2: hold full size
      scale = 1.5;
      alpha = 1;
    } else {
      // Phase 3: fade out & scale up
      const t = timer / 30;
      scale = 1.5 + (1 - t) * 0.6;
      alpha = t;
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.min(W * 0.22, 72)}px Poppins, sans-serif`;

    // Drop shadow
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 4;

    // Stroke
    ctx.strokeStyle = '#1B5E20';
    ctx.lineWidth = 5;
    ctx.strokeText('GO!', 0, 0);

    // Fill with gradient
    const grd = ctx.createLinearGradient(-60, -40, 60, 40);
    grd.addColorStop(0, '#76FF03');
    grd.addColorStop(1, '#CCFF90');
    ctx.fillStyle = grd;
    ctx.fillText('GO!', 0, 0);

    ctx.restore();
  }
}

/* ════════════════════════════════════════════════════════════════
   CLASS 5: UserInput — Button event routing
   ════════════════════════════════════════════════════════════════ */
class UserInput {
  constructor(calc1, calc2) {
    this.calc1 = calc1;
    this.calc2 = calc2;
  }

  init() {
    document.querySelectorAll('.btn-key').forEach(btn => {
      // Unified handler for both touch and click
      const handler = (e) => {
        e.preventDefault();
        const player = btn.dataset.player;
        const value = btn.dataset.value;

        // Visual press feedback
        btn.classList.add('active');
        setTimeout(() => btn.classList.remove('active'), 120);

        // Route to correct calculator
        if (player === '1') {
          this.calc1.handleInput(value);
        } else if (player === '2') {
          this.calc2.handleInput(value);
        }
      };

      btn.addEventListener('touchstart', handler, { passive: false });
      btn.addEventListener('click', handler);
    });
  }
}
