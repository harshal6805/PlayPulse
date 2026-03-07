/* ============================================
   Auth Module — Multi-Page Architecture
   Guards, Google Login, Logout
   ============================================ */

const Auth = (() => {
  let currentUser = null;

  function getUID() {
    return currentUser ? currentUser.uid : null;
  }

  function getUser() {
    return currentUser;
  }

  /**
   * Use on PROTECTED pages (dashboard, playlist, analytics, profile).
   * Redirects to index.html if not logged in.
   * Calls callback(user) when authenticated.
   */
  function requireAuth(callback) {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = 'index.html';
        return;
      }
      currentUser = user;

      // Ensure user doc exists
      const userRef = db.collection('users').doc(user.uid);
      const snap = await userRef.get();
      if (!snap.exists) {
        await userRef.set({
          displayName: user.displayName || '',
          email: user.email || '',
          photoURL: user.photoURL || '',
          totalXP: 0,
          level: 1,
          currentStreak: 0,
          longestStreak: 0,
          lastStreakDate: null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Send welcome email
        if (typeof EmailService !== 'undefined') {
          EmailService.sendWelcomeEmail(user);
        }
      }

      // Hide loading is now handled in app.js boot sequence

      callback(user);
    });
  }

  /**
   * Use on LANDING page (index.html).
   * If user is already logged in, redirect to dashboard.
   * Otherwise run callback.
   */
  function redirectIfLoggedIn(callback) {
    auth.onAuthStateChanged((user) => {
      if (user) {
        window.location.href = 'app.html';
        return;
      }
      if (callback) callback();
    });
  }

  async function loginWithGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
      // onAuthStateChanged will handle the redirect
    } catch (err) {
      console.error('Login error:', err);
      showToast(err.message || 'Login failed', 'error');
    }
  }

  async function logout() {
    try {
      await auth.signOut();
      window.location.href = 'index.html';
    } catch (err) {
      console.error('Logout error:', err);
      showToast('Logout failed', 'error');
    }
  }

  return { getUID, getUser, requireAuth, redirectIfLoggedIn, loginWithGoogle, logout };
})();
