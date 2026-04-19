/* ================================================================
   auth.js — Local Authentication System (MathWar v3)
   100% Offline-first. Uses MathWarDB (localStorage).
   Security: SHA-256 password hashing via crypto.subtle (B-01 fix)
   ================================================================ */

/* ── SHA-256 Password Hashing (B-01 FIX) ── */
async function _hashPw(pw) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(pw + 'mw_s4lt_!2026@')
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

window.MathWarAuth = {
  
  // ── SIGN UP ──
  async signUp(userData) {
    await MathWarDB.init(); // BUG #12 FIX — ensure DB ready
    const { fullName, email, phone, gender, age, username, password } = userData;
    
    // Check if username taken locally
    const isAvail = await MathWarDB.checkUsernameAvailable(username);
    if (!isAvail) throw new Error('Username already taken. Please choose another.');
    
    // Check if email taken locally
    const existing = MathWarDB.getUserByUsernameOrEmail(email);
    if (existing) throw new Error('Email already registered.');

    const uid = 'local_' + Math.random().toString(36).substr(2, 9);
    const hashedPw = await _hashPw(password); // B-01 FIX: hash password
    
    const profileData = {
      uid, fullName, email, phone: phone || '', gender, age: Number(age),
      username: username.toLowerCase(), avatar: '🧑',
      password: hashedPw, // B-01 FIX: store hash, not plain text
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      totalMatches: 0, wins: 0, losses: 0, winRate: 0, bestScore: 0,
    };
    
    MathWarDB.saveUser(uid, profileData);
    
    const sessionObj = { uid, displayName: fullName, username, email, avatar: profileData.avatar };
    MathWarDB.setSession(sessionObj);
    return sessionObj;
  },

  // ── SIGN IN ──
  async signIn(emailOrUsername, password) {
    await MathWarDB.init(); // BUG #12 FIX — ensure DB ready
    await new Promise(r => setTimeout(r, 600)); // Simulate delay
    
    const user = MathWarDB.getUserByUsernameOrEmail(emailOrUsername);
    if (!user) throw new Error('Account not found. Check username or email.');
    
    const hashedInput = await _hashPw(password); // B-01 FIX: compare hashes
    
    // Support legacy plain-text accounts (first-login migration)
    let passwordMatch = false;
    if (user.password === hashedInput) {
      passwordMatch = true;
    } else if (user.password === password && !user.password.match(/^[0-9a-f]{64}$/)) {
      // Migrate plain-text password to hash on successful login
      user.password = hashedInput;
      MathWarDB.saveUser(user.uid, user);
      passwordMatch = true;
    }
    
    if (!passwordMatch) throw new Error('Invalid credentials. Please check and try again.');
    
    // Update last login
    user.lastLogin = new Date().toISOString();
    MathWarDB.saveUser(user.uid, user);
    
    const sessionObj = { uid: user.uid, displayName: user.fullName, username: user.username, email: user.email, avatar: user.avatar };
    MathWarDB.setSession(sessionObj);
    return sessionObj;
  },

  // ── GOOGLE SIGN IN — UI Modal (B-05 FIX: no more window.prompt()) ──
  async signInWithGoogle() {
    await new Promise(r => setTimeout(r, 800)); // Simulate OAuth delay
    
    // B-05 FIX: Show a proper UI modal instead of window.prompt()
    return new Promise((resolve, reject) => {
      const modal = document.getElementById('googleAuthModal');
      if (!modal) {
        // Fallback: create modal dynamically if not in HTML
        const m = document.createElement('div');
        m.id = 'googleAuthModal';
        m.style.cssText = `
          position:fixed;top:0;left:0;right:0;bottom:0;
          background:rgba(0,0,0,0.85);z-index:9999;
          display:flex;align-items:center;justify-content:center;
          backdrop-filter:blur(8px);
        `;
        m.innerHTML = `
          <div style="background:linear-gradient(135deg,#0D2052,#1B0D3E);
            border:1px solid rgba(255,255,255,0.15);border-radius:20px;
            padding:28px;width:90%;max-width:360px;text-align:center;
            box-shadow:0 20px 60px rgba(0,0,0,0.6);">
            <div style="font-size:2rem;margin-bottom:8px;">🔑</div>
            <div style="font-family:'Fredoka One',cursive;font-size:1.4rem;
              color:#fff;margin-bottom:6px;">Google Sign-In</div>
            <div style="color:rgba(255,255,255,0.5);font-size:0.85rem;margin-bottom:20px;">
              Enter your Gmail address to continue
            </div>
            <input id="googleEmailInput" type="email" placeholder="your@gmail.com"
              style="width:100%;padding:12px;border-radius:10px;
                background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);
                color:#fff;font-size:1rem;box-sizing:border-box;margin-bottom:14px;
                outline:none;" />
            <div style="display:flex;gap:10px;">
              <button id="googleCancelBtn" style="flex:1;padding:12px;border-radius:10px;
                background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);
                color:rgba(255,255,255,0.7);font-weight:700;cursor:pointer;">Cancel</button>
              <button id="googleConfirmBtn" style="flex:1;padding:12px;border-radius:10px;
                background:#1565C0;border:none;color:#fff;font-weight:700;cursor:pointer;">
                Continue →</button>
            </div>
          </div>`;
        document.body.appendChild(m);
        
        document.getElementById('googleConfirmBtn').onclick = async () => {
          const email = document.getElementById('googleEmailInput').value.trim();
          if (!email || !email.includes('@')) {
            document.getElementById('googleEmailInput').style.borderColor = '#EF5350';
            return;
          }
          document.body.removeChild(m);
          try {
            const session = await MathWarAuth._processGoogleEmail(email);
            resolve(session);
          } catch(e) { reject(e); }
        };
        document.getElementById('googleCancelBtn').onclick = () => {
          document.body.removeChild(m);
          reject(new Error('Google Sign-In cancelled.'));
        };
        // Handle Enter key
        document.getElementById('googleEmailInput').onkeydown = (e) => {
          if (e.key === 'Enter') document.getElementById('googleConfirmBtn').onclick();
        };
      } else {
        modal.classList.remove('hidden');
      }
    });
  },

  // Internal helper for Google email processing
  async _processGoogleEmail(email) {
    let user = MathWarDB.getUserByUsernameOrEmail(email);
    if (!user) {
      const gName = email.split('@')[0];
      const username = gName.toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(Math.random()*999);
      const uid = 'google_' + Math.random().toString(36).substr(2, 9);
      user = {
        uid, fullName: gName, email, phone: '', gender: 'not specified', age: 18,
        username, avatar: '🧑', password: 'google_oauth_no_pass',
        createdAt: new Date().toISOString(), lastLogin: new Date().toISOString(),
        totalMatches:0, wins:0, losses:0, winRate:0, bestScore:0
      };
      MathWarDB.saveUser(uid, user);
    }
    const sessionObj = { uid: user.uid, displayName: user.fullName, username: user.username, email: user.email, avatar: user.avatar };
    MathWarDB.setSession(sessionObj);
    return sessionObj;
  },

  // ── REAL GOOGLE SIGN IN (via Google Identity Services) ──
  async handleGoogleResponse(credentialResponse) {
    try {
      // Decode the JWT given by Google
      const base64Url = credentialResponse.credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));

      const googleData = JSON.parse(jsonPayload);
      await MathWarDB.init();
      let user = MathWarDB.getUserByUsernameOrEmail(googleData.email);

      // Auto-create local account using real Google Data
      if (!user) {
        const username = googleData.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(Math.random()*999);
        const uid = 'google_' + googleData.sub.substring(0, 10);
        user = {
          uid, fullName: googleData.name, email: googleData.email, phone: '', gender: 'not specified', age: 18,
          username, avatar: '🤖', password: 'google_oauth_no_pass',
          profilePicture: googleData.picture,
          createdAt: new Date().toISOString(), lastLogin: new Date().toISOString(),
          totalMatches: 0, wins: 0, losses: 0, winRate: 0, bestScore: 0
        };
        MathWarDB.saveUser(uid, user);
      } else {
        user.lastLogin = new Date().toISOString();
        if (googleData.picture) user.profilePicture = googleData.picture;
        MathWarDB.saveUser(user.uid, user);
      }

      const sessionObj = { uid: user.uid, displayName: user.fullName, username: user.username, email: user.email, avatar: user.avatar };
      MathWarDB.setSession(sessionObj);
      return sessionObj;

    } catch (err) {
      console.error("Google Auth Parsing Error:", err);
      throw new Error("Failed to process Google login.");
    }
  },

  // ── FORGOT PASSWORD ──
  async sendPasswordReset(email) {
    await MathWarDB.init();
    await new Promise(r => setTimeout(r, 800));
    const user = MathWarDB.getUserByUsernameOrEmail(email);
    if (!user) throw new Error("Email not found in our system.");
    alert(`[Simulated Email Sent]\n\nPassword reset link sent to: ${email}`);
    return true;
  },

  // ── LOGOUT ──
  async logout() {
    MathWarDB.clearSession();
    window.location.href = 'login.html';
  },

  // ── INIT OBSERVER ──
  init() {
    const onLoginPage = window.location.pathname.toLowerCase().includes('login');
    const session = MathWarDB.getSession();
    
    if (session) {
      if (onLoginPage) { window.location.href = 'index.html'; return; }
      
      // Load user badge if on index
      const avatarEl = document.getElementById('userAvatar');
      const nameEl   = document.getElementById('userNameBadge');
      const badgeEl  = document.getElementById('userBadge');
      if (avatarEl) avatarEl.textContent = session.avatar || '🧑';
      if (nameEl)   nameEl.textContent   = session.username || session.displayName || 'Player';
      if (badgeEl)  badgeEl.classList.remove('hidden');
    } else {
      if (!onLoginPage) window.location.href = 'login.html';
    }
  }
};

// BUG #10 FIX — wait for DB to initialize before running auth observer
if (typeof MathWarDB !== 'undefined' && typeof MathWarDB.init === 'function') {
  MathWarDB.init().then(() => MathWarAuth.init()).catch(() => MathWarAuth.init());
} else {
  MathWarAuth.init();
}
