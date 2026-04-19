/* ================================================================
   db.js — MathWar Database v8 (Firebase Compat + localStorage)
   Regular script — NOT a module. Loaded AFTER firebase-compat CDN.
   ================================================================ */

// ── Firebase init ──
const _fbCfg = window.MATHWAR_CONFIG?.FIREBASE;
let _fbApp = null, _fbDb = null;
if (_fbCfg && typeof firebase !== 'undefined') {
  try {
    _fbApp = firebase.apps?.length ? firebase.app() : firebase.initializeApp(_fbCfg);
    _fbDb  = firebase.firestore(_fbApp);
    console.log('[MathWar] Firebase Firestore connected ✓');
  } catch(e) { console.warn('[MathWar] Firebase init failed:', e.message); }
}

// ── Storage Keys ──
const USERS_KEY   = 'mw_users_v3';
const SESSION_KEY = 'mw_session_v3';
const HIST_KEY    = 'mw_history_v3';

// ── localStorage helpers ──
function _load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch(_) { return fallback; }
}
function _save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch(_) {}
}

window.MathWarDB = {

  // ── Init (no-op — kept for compatibility with auth.js calls) ──
  async init() {
    return Promise.resolve(true);
  },

  // ── Session ──
  getSession()    { return _load(SESSION_KEY, null); },
  setSession(s)   { _save(SESSION_KEY, s); },
  clearSession()  { localStorage.removeItem(SESSION_KEY); },

  // ── Users (localStorage) ──
  getUsers()      { return _load(USERS_KEY, {}); },

  saveUser(uid, data) {
    const users = _load(USERS_KEY, {});
    users[uid]  = { ...(users[uid] || {}), ...data };
    _save(USERS_KEY, users);
  },

  async getUserProfile(uid) {
    return _load(USERS_KEY, {})[uid] || null;
  },

  getUserByUsernameOrEmail(query) {
    const users = _load(USERS_KEY, {});
    const q = (query || '').toLowerCase();
    return Object.values(users).find(u =>
      (u.email    || '').toLowerCase() === q ||
      (u.username || '').toLowerCase() === q
    ) || null;
  },

  async checkUsernameAvailable(username) {
    const users = _load(USERS_KEY, {});
    const q = (username || '').toLowerCase();
    return !Object.values(users).some(u =>
      (u.username || '').toLowerCase() === q
    );
  },

  // ── Get aggregated stats (for login hero counters) ──
  getStats() {
    const users   = _load(USERS_KEY, {});
    const rawHist = _load(HIST_KEY,  {});
    // B-10 FIX: guard against corrupted history data
    const histories = (rawHist && typeof rawHist === 'object' && !Array.isArray(rawHist))
      ? Object.values(rawHist) : [];
    const totalMatches = histories.reduce((n, arr) =>
      n + (Array.isArray(arr) ? arr.length : 0), 0);
    return {
      totalUsers:  Object.keys(users).length,
      totalMatches
    };
  },

  // ── Save Match ──
  // matchRecord = { mode, winner, duration, aiDifficulty?,
  //                 player1:{uid,username,score}, player2:{uid,username,score} }
  async saveMatch(matchRecord) {
    const sess   = this.getSession();
    const uid    = sess?.uid || 'guest';
    const id     = 'm_' + Date.now();
    const full   = {
      id,
      playedAt:     new Date().toISOString(),
      uid,
      mode:         matchRecord.mode         || 'pvp',
      aiDifficulty: matchRecord.aiDifficulty || null,
      duration:     matchRecord.duration     || '0',
      winner:       matchRecord.winner       || 'tie',
      p1Name:       matchRecord.player1?.username || 'Player 1',
      p1Score:      matchRecord.player1?.score    ?? 0,
      p2Name:       matchRecord.player2?.username || 'Player 2',
      p2Score:      matchRecord.player2?.score    ?? 0,
    };

    // 1. localStorage history (instant, offline-first, newest first)
    const all = _load(HIST_KEY, {});
    if (!all[uid]) all[uid] = [];
    all[uid].unshift(full);
    if (all[uid].length > 100) all[uid] = all[uid].slice(0, 100);
    _save(HIST_KEY, all);

    // 2. Update local user stats
    if (uid !== 'guest') {
      const users = _load(USERS_KEY, {});
      const u = users[uid];
      if (u) {
        u.totalMatches = (u.totalMatches || 0) + 1;
        const myUsername  = (sess?.username || '').toLowerCase();
        const winnerLower = (full.winner   || '').toLowerCase();
        if (winnerLower === myUsername || winnerLower === 'player1') {
          u.wins   = (u.wins   || 0) + 1;
        } else if (winnerLower !== 'tie') {
          u.losses = (u.losses || 0) + 1;
        }
        u.winRate   = u.totalMatches ? Math.round((u.wins / u.totalMatches) * 100) : 0;
        u.bestScore = Math.max(u.bestScore || 0, full.p1Score);
        this.saveUser(uid, u);
      }
    }

    // 3. Firebase Firestore (async — non-blocking)
    if (_fbDb) {
      try {
        await _fbDb.collection('Matches').add({
          ...full,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('[MathWar] Match saved to Firebase ✓', full.id);
      } catch(e) {
        console.warn('[MathWar] Firebase save failed (offline?), kept locally:', e.message);
      }
    }
    return id;
  },

  // ── Get History — localStorage first, Firebase fallback ──
  async getUserHistory(uid, limit = 10) {
    // 1. Fast path: localStorage
    const all   = _load(HIST_KEY, {});
    const local = (all[uid] || []).slice(0, Math.max(limit, 10));
    if (local.length > 0) return local;

    // 2. Fallback: Firebase (if localStorage was cleared)
    if (!_fbDb) return [];
    try {
      const snap = await _fbDb.collection('Matches')
        .where('uid', '==', uid)
        .orderBy('playedAt', 'desc')
        .limit(Math.max(limit, 10))
        .get();
      if (snap.empty) return [];
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Re-cache in localStorage for next time
      const all2 = _load(HIST_KEY, {});
      all2[uid] = docs;
      _save(HIST_KEY, all2);
      return docs;
    } catch(e) {
      console.warn('[MathWar] Firebase history fetch failed:', e.message);
      return [];
    }
  },

  // ── Export / Import ──
  exportDbFile() {
    const data = {
      users:      _load(USERS_KEY, {}),
      history:    _load(HIST_KEY, {}),
      version:    8,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'mathwar_backup_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  importData(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (data.users)   _save(USERS_KEY, data.users);
      if (data.history) _save(HIST_KEY,  data.history);
      return true;
    } catch(_) { return false; }
  }
};
