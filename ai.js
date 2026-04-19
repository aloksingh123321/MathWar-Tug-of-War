/* ================================================================
   ai.js — MathWar Computer Opponent
   Standalone class — no dependencies on game.js internals
   ================================================================ */
class ComputerOpponent {
  constructor(difficulty = 'medium') {
    this.difficulty = difficulty;
    this.isActive   = false;
    this.currentProblem = null;
    this.solveTimer = null;
    // Difficulty tuning: delay in ms + error rate
    this.params = {
      easy:   { minDelay: 7000,  maxDelay: 11000, errorRate: 0.35 },
      medium: { minDelay: 3500,  maxDelay: 6000,  errorRate: 0.15 },
      hard:   { minDelay: 1000,  maxDelay: 2800,  errorRate: 0.04 },
    };
  }

  setProblem(problem) {
    this.currentProblem = problem;
    if (!this.isActive || !problem) return;
    this._scheduleSolve();
  }

  _scheduleSolve() {
    clearTimeout(this.solveTimer);
    const p = this.params[this.difficulty] || this.params.medium;
    const delay = p.minDelay + Math.random() * (p.maxDelay - p.minDelay);

    this.solveTimer = setTimeout(() => {
      if (!this.isActive || !this.currentProblem) return;

      let answer;
      if (Math.random() < p.errorRate) {
        // Realistic mistake: off by 1–4 or multiply by 2
        const offsets = [1, 2, 3, -1, -2, -3, 4, -4];
        const off = offsets[Math.floor(Math.random() * offsets.length)];
        answer = this.currentProblem.answer + off;
        if (answer < 0) answer = Math.abs(answer); // keep positive-ish
      } else {
        answer = this.currentProblem.answer;
      }

      this.onAnswer(answer);
    }, delay);
  }

  /** Override this to handle the AI's answer */
  onAnswer(answer) { /* set externally */ }

  /**
   * Animate digits appearing in P2 input box one by one
   * @param {number} answer
   * @param {UIPresentation} ui
   * @param {number} typingDelay ms between keystrokes
   */
  animateTyping(answer, ui, typingDelay = 120) {
    const str = String(answer);
    let i = 0;
    const iv = setInterval(() => {
      if (i <= str.length) {
        ui.updateInput(2, i === 0 ? '' : str.slice(0, i));
        i++;
      } else {
        clearInterval(iv);
      }
    }, typingDelay);
  }

  start() {
    this.isActive = true;
    if (this.currentProblem) this._scheduleSolve();
  }

  stop() {
    this.isActive = false;
    clearTimeout(this.solveTimer);
  }

  reset() {
    this.stop();
    this.currentProblem = null;
  }
}
