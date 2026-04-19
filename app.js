/* ================================================================
   MATHWAR — APP.JS v3.1 — FULLY UPGRADED
   N-01: API key from config.js (never hardcoded)
   N-02: endGame double-call guard (_endGameCalled flag)
   N-05: touchstart added for neon typing glow
   N-08: 4 game modes (pvp, pvc, blitz, practice)
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Layer Instantiation ── */
  const ui         = new UIPresentation();
  const animEngine = new AnimationEngine('arenaCanvas');
  const gameCtrl   = new GameController(animEngine, ui);
  const calc1      = new Calculator(1, gameCtrl, ui);
  const calc2      = new Calculator(2, gameCtrl, ui);
  const inputCtrl  = new UserInput(calc1, calc2);

  inputCtrl.init();
  animEngine.startLoop();

  /* ── Generate first problems ── */
  calc1.newProblem();
  calc2.newProblem();

  /* ── Sound System ── */
  let sounds = null;
  try {
    if (typeof SoundSystem !== 'undefined') sounds = new SoundSystem();
  } catch(_) {}
  window.sounds = sounds;

  /* ── Session & User Badge ── */
  const session = (typeof MathWarDB !== 'undefined' && MathWarDB.getSession) ? MathWarDB.getSession() : null;
  if (session) {
    const badgeEl  = document.getElementById('userBadge');
    const avatarEl = document.getElementById('userAvatar');
    const nameEl   = document.getElementById('userNameBadge');
    if (badgeEl)  badgeEl.classList.remove('hidden');
    if (avatarEl) avatarEl.textContent = session.avatar || '🧑';
    if (nameEl)   nameEl.textContent   = session.username || session.displayName || 'Player';
    const p1Label = document.querySelector('.p1-panel .player-label');
    if (p1Label) p1Label.textContent = `⚔ ${(session.username || 'Player 1').toUpperCase()}`;
  }

  const oldStart = document.getElementById('startBtn');
  if (oldStart) oldStart.style.display = 'none';

  /* ── Game Mode State ── */
  let gameMode = 'pvp';
  let aiDiff   = 'medium';
  let matchStartTime = 0;

  // N-02 FIX: simple flag to prevent double endGame calls
  let _endGameCalled = false;

  /* ── AI Opponent ── */
  const ai = typeof ComputerOpponent !== 'undefined' ? new ComputerOpponent('medium') : null;

  if (ai) {
    ai.onAnswer = (ans) => {
      if ((gameMode !== 'pvc' && gameMode !== 'blitz') || !gameCtrl.gameActive) return;
      ai.animateTyping(ans, ui, 80);
      const delay = String(ans).length * 80 + 220;
      setTimeout(() => {
        if (!gameCtrl.gameActive) return;
        const guess = parseInt(String(ans), 10);
        if (guess === calc2.currentProblem?.answer) {
          gameCtrl.onCorrectAnswer(2);
          ui.flashCorrect(2);
          calc2.correctCount++;
          calc2.upgradeDifficulty();
          ui.updateScore(2, calc2.correctCount);
          if (sounds) sounds.correct();
          calc2.newProblem();
          // B-09 FIX: reset blitz per-problem timer after AI correct answer
          if (gameMode === 'blitz' && typeof gameCtrl._startBlitzProblemTimer === 'function') {
            gameCtrl._startBlitzProblemTimer();
          }
        } else {
          ui.flashIncorrect(2);
          if (sounds) sounds.wrong();
          ai.setProblem(calc2.currentProblem);
        }
        ui.updateInput(2, '');
      }, delay);
    };

    const _origNewProb2 = calc2.newProblem.bind(calc2);
    calc2.newProblem = () => {
      _origNewProb2();
      if ((gameMode === 'pvc' || gameMode === 'blitz') && gameCtrl.gameActive) {
        ai.setProblem(calc2.currentProblem);
      }
    };
  }

  /* ── P4-T15: Mode Selector (4 modes) ── */
  window.selectMode = (m) => {
    gameMode = m;
    ['modePvP','modePvC','modeBlitz','modePractice'].forEach(id => {
      document.getElementById(id)?.classList.remove('selected');
    });
    const modeIdMap = { pvp:'modePvP', pvc:'modePvC', blitz:'modeBlitz', practice:'modePractice' };
    document.getElementById(modeIdMap[m])?.classList.add('selected');

    const diffSel = document.getElementById('difficultySelector');
    diffSel?.classList.toggle('hidden', m !== 'pvc');

    const p2Label = document.querySelector('.p2-header .player-label');
    if (p2Label) {
      if (m === 'pvc')        p2Label.textContent = 'COMPUTER 🤖';
      else if (m === 'blitz')    p2Label.textContent = 'BLITZ ⚡';
      else if (m === 'practice') p2Label.textContent = 'PRACTICE 📚';
      else                       p2Label.textContent = 'PLAYER 2 ⚔';
    }

    // P2 keypad: disable for AI-controlled modes
    const aiControlled = (m === 'pvc' || m === 'blitz' || m === 'practice');
    document.querySelectorAll('#keypad2 .btn-key').forEach(btn => {
      btn.disabled = aiControlled;
      btn.style.opacity = aiControlled ? '0.35' : '1';
      btn.style.cursor  = aiControlled ? 'not-allowed' : '';
    });
  };

  window.selectDiff = (d) => {
    aiDiff = d;
    if (ai) ai.difficulty = d;
    document.querySelectorAll('.diff-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.diff === d);
    });
  };

  /* ── Start Game ── */
  const _origStart = gameCtrl.start.bind(gameCtrl);
  gameCtrl.start = () => {
    document.getElementById('modeSelector')?.classList.add('hidden');
    matchStartTime = Date.now();
    _endGameCalled = false;

    if (gameMode === 'blitz') {
      gameCtrl.gameMode = 'blitz';
      gameCtrl.startBlitz();
    } else {
      gameCtrl.gameMode = gameMode;
      _origStart();
    }

    document.getElementById('pauseBtn')?.classList.remove('hidden');
    document.getElementById('soundBtn')?.classList.remove('hidden'); // MOBILE: show sound button
    if (sounds) sounds._resume(); // attempt audio context unlock

    if ((gameMode === 'pvc' || gameMode === 'blitz') && ai) {
      ai.difficulty = aiDiff;
      ai.reset();
      ai.start();
      ai.setProblem(calc2.currentProblem);
    }
  };

  const modeStartBtn = document.getElementById('modeStartBtn');
  if (modeStartBtn) {
    modeStartBtn.addEventListener('click', () => gameCtrl.start());
    modeStartBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      gameCtrl.start();
    }, { passive: false });
  }

  /* ── Sound Toggle (mobile-friendly, also unlocks AudioContext) ── */
  window.toggleSound = () => {
    if (!sounds) return;
    sounds._resume(); // unlock context on first tap
    const isOn = sounds.toggle();
    const btn = document.getElementById('soundBtn');
    if (btn) {
      btn.textContent = isOn ? '🔊' : '🔇';
      btn.classList.toggle('muted', !isOn);
    }
  };

  /* ── Pause System ── */
  // B-06 FIX: null check for _startBlitzProblemTimer
  window.togglePause = () => {
    const overlay = document.getElementById('pauseOverlay');
    if (gameCtrl.gameActive) {
      gameCtrl.pause();
      overlay?.classList.remove('hidden');
      if (ai) ai.stop();
      if (gameMode === 'blitz') clearTimeout(gameCtrl._blitzTimer);
    } else if (gameCtrl.isPaused) {
      gameCtrl.resume();
      overlay?.classList.add('hidden');
      if ((gameMode === 'pvc' || gameMode === 'blitz') && ai) ai.start();
      // B-06 FIX: null check before calling
      if (gameMode === 'blitz' && typeof gameCtrl._startBlitzProblemTimer === 'function') {
        gameCtrl._startBlitzProblemTimer();
      }
    }
  };

  /* ── (Tournament state removed — mode removed in v3.4) ── */

  /* ── Override gameCtrl.endGame ── */
  const _origEndGame = gameCtrl.endGame.bind(gameCtrl);
  gameCtrl.endGame = async (winner) => {
    if (_endGameCalled) return;
    _endGameCalled = true;

    document.getElementById('pauseBtn')?.classList.add('hidden');
    document.getElementById('soundBtn')?.classList.add('hidden');  // MOBILE: hide sound btn
    document.getElementById('pauseOverlay')?.classList.add('hidden');
    // B-08 FIX: always clear blitz timer regardless of mode (harmless if undefined)
    clearTimeout(gameCtrl._blitzTimer);

    // Determine correct winner from actual scores
    let finalWinner = 'tie';
    if (gameCtrl._score1 > gameCtrl._score2)      finalWinner = 1;
    else if (gameCtrl._score2 > gameCtrl._score1) finalWinner = 2;

    _origEndGame(finalWinner);
    if (ai) ai.stop();
    if (sounds) sounds.win();

    const sess       = (typeof MathWarDB !== 'undefined' && MathWarDB.getSession) ? MathWarDB.getSession() : null;
    const player1Name = sess?.username || 'Player 1';
    // B-01 FIX: no more survival reference
    const player2Name = (gameMode === 'pvc' || gameMode === 'blitz')
      ? `Computer (${aiDiff})` : 'Player 2';
    const finalScore1 = gameCtrl._score1;
    const finalScore2 = gameCtrl._score2;
    const winnerName  = finalWinner === 1 ? player1Name
                       : finalWinner === 2 ? player2Name
                       : 'tie';

    // Save match to Firebase + localStorage
    if (typeof window.MathWarDB !== 'undefined' && typeof window.MathWarDB.saveMatch === 'function') {
      await window.MathWarDB.saveMatch({
        mode:         gameMode,
        aiDifficulty: (gameMode === 'pvc' || gameMode === 'blitz') ? aiDiff : null,
        winner:       winnerName,
        duration:     matchStartTime > 0 ? ((Date.now() - matchStartTime) / 1000).toFixed(1) : '0',
        player1: {
          uid:      sess?.uid || 'guest',
          username: player1Name,
          score:    finalScore1
        },
        player2: {
          uid:      (gameMode === 'pvc' || gameMode === 'blitz') ? 'computer' : 'guest2',
          username: player2Name,
          score:    finalScore2
        }
      });
    }

    const record = {
      mode: gameMode,
      duration: matchStartTime > 0 ? ((Date.now() - matchStartTime) / 1000).toFixed(1) : '0',
      player1: { username: player1Name, score: finalScore1 },
      player2: { username: player2Name, score: finalScore2 }
    };
    _postGameAnalysis(record, finalWinner);
  };

  /* ── Post-Game AI Analysis (N-01 FIX: key from config) ── */
  async function _postGameAnalysis(record, winner) {
    // N-01 FIX: get key from config — never hardcoded
    const key = window.MATHWAR_CONFIG?.GEMINI_API_KEY || '';
    if (!key) return;
    try {
      const winnerName = winner === 1 ? (record.player1.username || 'Player 1') :
                         winner === 2 ? (record.player2.username || 'Player 2') : 'Nobody';
      const prompt = `A math game just ended. Winner: ${winnerName}. P1 score: ${record.player1.score}, P2 score: ${record.player2.score}, Duration: ${record.duration}s, Mode: ${record.mode}. Give exactly 1 encouraging sentence (max 20 words) to the winner.`;

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );
      const data = await resp.json();
      const msg = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (msg) {
        const detailEl = document.getElementById('winDetail');
        if (detailEl) detailEl.textContent = msg.trim();
      }
    } catch(e) { /* silent fail */ }
  }

  /* ── AI Hint System (N-01 FIX: key from config) ── */
  window.getAIHint = async function(problem, player) {
    const hintEl = document.getElementById(`hint${player}`);
    if (!hintEl || !problem) return;

    // Practice mode: show exact answer immediately
    if (window._currentGameMode === 'practice') {
      hintEl.textContent = `✓ Answer: ${problem.answer}`;
      hintEl.classList.remove('hidden');
      setTimeout(() => hintEl.classList.add('hidden'), 3000);
      return;
    }

    const key = window.MATHWAR_CONFIG?.GEMINI_API_KEY || '';
    if (!key) {
      hintEl.textContent = '💡 Think step by step!';
      hintEl.classList.remove('hidden');
      setTimeout(() => hintEl.classList.add('hidden'), 3000);
      return;
    }

    hintEl.textContent = '💡 Thinking of a hint...';
    hintEl.classList.remove('hidden');
    try {
      const prompt = `You are a math tutor for kids. Give ONE short hint (max 15 words) for this problem: ${problem.question}. Be encouraging. No spoilers — don't give the answer.`;
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );
      const data = await resp.json();
      const hint = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Try breaking it into smaller steps!';
      hintEl.textContent = '💡 ' + hint.trim();
      setTimeout(() => hintEl.classList.add('hidden'), 5000);
    } catch(e) {
      hintEl.textContent = '💡 Think step by step!';
      setTimeout(() => hintEl.classList.add('hidden'), 3000);
    }
  };

  /* ── Play Again ── */
  const playAgainBtn = document.getElementById('playAgainBtn');
  if (playAgainBtn) {
    const playAgain = (e) => {
      e.preventDefault();
      ui.hideModal();
      gameCtrl.reset();
      calc1.reset();
      calc2.reset();
      if (ai) ai.reset();
      _endGameCalled = false; // N-02 FIX: reset flag for next game
      document.getElementById('modeSelector')?.classList.remove('hidden');
      document.getElementById('pauseBtn')?.classList.add('hidden');
      document.getElementById('soundBtn')?.classList.add('hidden');
    };
    playAgainBtn.addEventListener('touchstart', playAgain, { passive: false });
    playAgainBtn.addEventListener('click', playAgain);
  }

  /* ── Keyboard Support ── */
  document.addEventListener('keydown', (e) => {
    if (!gameCtrl.gameActive) return;
    const k = e.key;
    if (/^[0-9\-]$/.test(k)) { calc1.handleInput(k); return; }
    if (k === 'Backspace') { e.preventDefault(); calc1.handleInput('delete'); return; }
    if (k === 'Enter')     { e.preventDefault(); calc1.handleInput('submit'); return; }
    if (k === 'Escape')    { e.preventDefault(); window.togglePause?.(); return; }
    if (k === 'p' || k === 'P') { window.togglePause?.(); return; }
  });

  document.addEventListener('contextmenu', e => e.preventDefault());

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      if (typeof MathWarAuth !== 'undefined') MathWarAuth.logout();
    };
  }

  /* ── Neon Glow on Input Boxes ── */
  ['inputBox1', 'inputBox2'].forEach((id, i) => {
    const box = document.getElementById(id);
    if (!box) return;
    box.classList.add(i === 0 ? 'p1-input' : 'p2-input');
  });

  // N-05 FIX: Add BOTH mousedown AND touchstart for neon glow
  document.querySelectorAll('.btn-key').forEach(btn => {
    const addTyping = () => {
      const player = btn.dataset.player;
      const box = document.getElementById(`inputBox${player}`);
      if (box) {
        box.classList.add('typing');
        clearTimeout(box._typingTimer);
        box._typingTimer = setTimeout(() => box.classList.remove('typing'), 1200);
      }
    };
    btn.addEventListener('mousedown', addTyping);
    btn.addEventListener('touchstart', addTyping, { passive: true }); // N-05 FIX
  });

  // Expose gameMode for hint system
  Object.defineProperty(window, '_currentGameMode', { get: () => gameMode });
});
