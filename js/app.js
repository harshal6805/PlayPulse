/* ============================================
   App Router â€” Tab switching controller
   Manages tab navigation for the single-page app
   ============================================ */

const AppRouter = (() => {
  let currentTab = 'dashboard';
  const tabInited = { dashboard: false, playlists: false, analytics: false, profile: false };

  const TAB_TITLES = {
    dashboard: 'Dashboard',
    playlists: 'Playlists',
    analytics: 'Analytics',
    profile: 'Profile'
  };

  const TAB_ICONS = {
    dashboard: 'fa-solid fa-gauge-high',
    playlists: 'fa-solid fa-list',
    analytics: 'fa-solid fa-chart-line',
    profile: 'fa-solid fa-user'
  };

  function switchTab(tab) {
    if (!TAB_TITLES[tab]) return;
    currentTab = tab;

    // Hide all tab panels
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    // Show target panel
    const panel = document.getElementById('tab-' + tab);
    if (panel) panel.classList.add('active');

    // Update sidebar nav active state (profile is not in sidebar)
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tab);
    });

    // Handle FAB visibility
    const fab = document.getElementById('btn-add-playlist-fab');
    if (fab) {
      fab.classList.toggle('hidden', tab !== 'playlists');
    }

    // Update page title with logo
    const titleEl = document.getElementById('page-title');
    if (titleEl) {
      titleEl.innerHTML = `<img src="favicon/favicon.svg" alt="" class="page-title-logo" /> ${TAB_TITLES[tab]}`;
    }

    // Update URL hash (preserve playlist sub-route if already set)
    const currentHash = window.location.hash.replace('#', '');
    if (!(tab === 'playlists' && currentHash.startsWith('playlists/'))) {
      history.replaceState(null, '', '#' + tab);
    }

    // Close mobile sidebar if open
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');

    // Lazy-initialize the tab content
    initTab(tab);

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  async function initTab(tab) {
    if (tabInited[tab]) return;
    tabInited[tab] = true;

    const user = Auth.getUser();
    if (!user) return;

    switch (tab) {
      case 'dashboard':
        await initDashboardTab(user);
        break;
      case 'playlists':
        await initPlaylistsTab(user);
        break;
      case 'analytics':
        await initAnalyticsTab();
        break;
      case 'profile':
        await initProfileTab(user);
        break;
    }
  }

  /* ---------- Dashboard Tab Init ---------- */
  async function initDashboardTab(user) {
    // Dashboard is initialized by dashboard.js on page load
    // This is handled there via DashboardController.init()
  }

  /* ---------- Playlists Tab Init ---------- */
  async function initPlaylistsTab(user) {
    // PlaylistPage.init() is called from app.js boot
  }

  /* ---------- Analytics Tab Init ---------- */
  async function initAnalyticsTab() {
    try {
      await Analytics.renderAnalyticsPage();

      // Populate summary stats (UX-21)
      const data = await FirestoreOps.getUserData();
      const playlists = await FirestoreOps.getPlaylists();
      let totalDone = 0, totalWatchSec = 0;
      for (const pl of playlists) {
        const vids = await FirestoreOps.getVideos(pl.id);
        totalDone += vids.filter(v => v.completed).length;
        totalWatchSec += vids.reduce((s, v) => s + (v.watchedSeconds || 0), 0);
      }
      const hrs = Math.floor(totalWatchSec / 3600);
      const mins = Math.floor((totalWatchSec % 3600) / 60);
      const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
      el('analytics-total-hours', hrs > 0 ? hrs + 'h ' + mins + 'm' : mins + 'm');
      el('analytics-best-streak', data?.longestStreak || data?.currentStreak || 0);
      el('analytics-completed', totalDone);
      // Avg videos/week approximation
      const createdAt = data?.createdAt?.toDate?.() || new Date();
      const weeksActive = Math.max(1, Math.ceil((Date.now() - createdAt.getTime()) / (7 * 24 * 60 * 60 * 1000)));
      el('analytics-avg-week', Math.round(totalDone / weeksActive));
    } catch (e) {
      console.error('Analytics init error:', e);
    }
  }

  /* ---------- Profile Tab Init ---------- */
  async function initProfileTab(user) {
    try {
      const data = await FirestoreOps.getUserData();

      // Profile header
      document.getElementById('profile-avatar').src = user.photoURL || '';
      document.getElementById('profile-name').textContent = user.displayName || 'Student';
      document.getElementById('profile-email').textContent = user.email || '';
      const joined = data?.createdAt?.toDate?.() || new Date();
      document.getElementById('profile-joined-date').textContent = joined.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      // XP & Level
      const xp = data?.totalXP || 0;
      const levelInfo = getLevelFromXP(xp);
      const pct = levelInfo.nextLevelXP > 0 ? (levelInfo.currentXP / levelInfo.nextLevelXP) * 100 : 0;

      document.getElementById('profile-level').textContent = levelInfo.level;
      document.getElementById('profile-total-xp').textContent = xp.toLocaleString();
      document.getElementById('profile-next-xp').textContent = levelInfo.nextLevelXP.toLocaleString();
      document.getElementById('profile-xp-bar').style.width = pct + '%';

      // Stats
      document.getElementById('profile-streak').textContent = data?.currentStreak || 0;
      const playlists = await FirestoreOps.getPlaylists();
      document.getElementById('profile-playlists').textContent = playlists.length;

      let totalDone = 0, totalWatchSec = 0;
      for (const pl of playlists) {
        const vids = await FirestoreOps.getVideos(pl.id);
        totalDone += vids.filter(v => v.completed).length;
        totalWatchSec += vids.reduce((s, v) => s + (v.watchedSeconds || 0), 0);
      }
      document.getElementById('profile-videos-done').textContent = totalDone;
      const hrs = Math.floor(totalWatchSec / 3600);
      const mins = Math.floor((totalWatchSec % 3600) / 60);
      document.getElementById('profile-watch-time').textContent = hrs > 0 ? hrs + 'h ' + mins + 'm' : mins + 'm';

      // Badges
      Gamification.renderBadges(document.getElementById('profile-badges-grid'));

      // Skill Tree
      Gamification.renderSkillTree(document.getElementById('skill-tree-grid'));

      // Combo Display
      const comboStreak = data?.comboStreak || 0;
      const multi = COMBO_THRESHOLDS.reduce((m, t) => comboStreak >= t.days ? t.multiplier : m, 1);
      const comboEl = document.getElementById('profile-combo-display');
      if (comboEl) {
        comboEl.innerHTML = `<i class="fa-solid fa-bolt"></i> ${comboStreak}-day combo${multi > 1 ? ` <span class="combo-multi">x${multi}</span>` : ''}`;
        comboEl.className = `combo-display ${multi > 1 ? 'combo-active' : ''}`;
      }

      // Profile Logout button
      const profileLogout = document.getElementById('btn-profile-logout');
      if (profileLogout && !profileLogout._bound) {
        profileLogout._bound = true;
        profileLogout.addEventListener('click', () => Auth.logout());
      }
    } catch (e) {
      console.error('Profile init error:', e);
    }
  }

  /* ---------- Refresh profile if already loaded ---------- */
  function refreshProfile() {
    tabInited.profile = false;
    if (currentTab === 'profile') {
      const user = Auth.getUser();
      if (user) initProfileTab(user);
    }
  }

  function getCurrentTab() {
    return currentTab;
  }

  function markInited(tab) {
    tabInited[tab] = true;
  }

  return { switchTab, getCurrentTab, refreshProfile, markInited };
})();

/* ============================================
   Global Search
   ============================================ */
function initGlobalSearch() {
  const input = document.getElementById('global-search-input');
  const results = document.getElementById('global-search-results');
  const wrapper = document.querySelector('.global-search-wrapper');
  if (!input || !results || !wrapper) return;

  let debounceTimer = null;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => doSearch(input.value.trim()), 300);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim()) doSearch(input.value.trim());
  });

  // Mobile: icon-only by default, expand on click
  function isMobile() { return window.matchMedia('(max-width: 768px)').matches; }
  wrapper.addEventListener('click', (e) => {
    if (!isMobile()) return;
    if (wrapper.classList.contains('search-expanded')) return;
    if (e.target === input) return;
    e.preventDefault();
    wrapper.classList.add('search-expanded');
    input.focus();
  });

  function closeSearch() {
    results.classList.add('hidden');
    input.value = '';
    input.blur();
    if (isMobile()) {
      wrapper.classList.add('search-closing');
      setTimeout(() => {
        wrapper.classList.remove('search-expanded');
        wrapper.classList.remove('search-closing');
      }, 300); // Match CSS transition time
    }
  }

  // Close on click-outside or Escape (pointerdown for mobile: fires before focus can steal)
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest?.('.global-search-wrapper')) closeSearch();
  }, { capture: true });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.global-search-wrapper')) closeSearch();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearch();
  });

  async function doSearch(query) {
    if (!query || query.length < 2) { results.classList.add('hidden'); return; }
    const q = query.toLowerCase();

    try {
      const playlists = await FirestoreOps.getPlaylists();
      const matchedPlaylists = playlists.filter(p => (p.title || '').toLowerCase().includes(q)).slice(0, 5);

      let matchedVideos = [];
      let matchedNotes = [];
      // Search videos and notes across ALL playlists, stop early once we have enough
      for (const pl of playlists) {
        const vids = await FirestoreOps.getVideos(pl.id);
        const matched = vids.filter(v => (v.title || '').toLowerCase().includes(q)).slice(0, 3);
        matched.forEach(v => matchedVideos.push({ ...v, playlistId: pl.id, playlistTitle: pl.title }));

        // FN-5: Search through video notes content
        if (matchedNotes.length < 5) {
          const noteMatches = vids.filter(v => (v.notes || '').toLowerCase().includes(q));
          for (const v of noteMatches) {
            if (matchedNotes.length >= 5) break;
            // Avoid duplicates with video matches
            if (matchedVideos.find(mv => mv.id === v.id && mv.playlistId === pl.id)) continue;
            const noteText = (v.notes || '').replace(/<[^>]*>/g, ''); // strip HTML tags
            const idx = noteText.toLowerCase().indexOf(q);
            const start = Math.max(0, idx - 15);
            const snippet = noteText.substring(start, start + 60) + (noteText.length > start + 60 ? '...' : '');
            matchedNotes.push({
              ...v,
              playlistId: pl.id,
              playlistTitle: pl.title,
              noteSnippet: snippet
            });
          }
        }

        if (matchedVideos.length >= 8) break;
      }
      matchedVideos = matchedVideos.slice(0, 8);

      if (!matchedPlaylists.length && !matchedVideos.length && !matchedNotes.length) {
        results.innerHTML = '<div class="search-no-results">No results found</div>';
        results.classList.remove('hidden');
        return;
      }

      let html = '';
      if (matchedPlaylists.length) {
        html += '<div class="search-group-label">Playlists</div>';
        html += matchedPlaylists.map(pl =>
          `<div class="search-result-item" data-type="playlist" data-id="${pl.id}"><i class="fa-solid fa-list"></i><span>${pl.title}</span></div>`
        ).join('');
      }
      if (matchedVideos.length) {
        html += '<div class="search-group-label">Videos</div>';
        html += matchedVideos.map(v =>
          `<div class="search-result-item" data-type="video" data-plid="${v.playlistId}" data-vid="${v.id}"><i class="fa-solid fa-play"></i><span>${v.title}</span></div>`
        ).join('');
      }
      if (matchedNotes.length) {
        html += '<div class="search-group-label">Notes</div>';
        html += matchedNotes.map(n =>
          `<div class="search-result-item" data-type="video" data-plid="${n.playlistId}" data-vid="${n.id}"><i class="fa-solid fa-sticky-note"></i><span>${n.title}<br><small style="color:var(--text-muted)">${n.noteSnippet}</small></span></div>`
        ).join('');
      }

      results.innerHTML = html;
      results.classList.remove('hidden');

      results.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
          results.classList.add('hidden');
          input.value = '';
          input.blur();
          if (item.dataset.type === 'playlist') {
            AppRouter.switchTab('playlists');
            PlaylistPage.openPlaylistDetail(item.dataset.id);
          } else if (item.dataset.type === 'video') {
            AppRouter.switchTab('playlists');
            PlaylistPage.openFromResume(item.dataset.plid, item.dataset.vid, false, false);
          }
        });
      });
    } catch (e) {
      console.error('Search error:', e);
    }
  }
}

/* ============================================
   UI-6: Styled Confirm Modal (replaces native confirm())
   ============================================ */
function showConfirm(title, message, okLabel = 'Delete') {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    if (!modal) { resolve(confirm(message)); return; }
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const okBtn = document.getElementById('btn-confirm-ok');
    okBtn.textContent = okLabel;
    modal.classList.remove('hidden');

    function cleanup(result) {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      document.getElementById('btn-confirm-cancel').removeEventListener('click', onCancel);
      document.getElementById('confirm-modal-overlay').removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    okBtn.addEventListener('click', onOk);
    document.getElementById('btn-confirm-cancel').addEventListener('click', onCancel);
    document.getElementById('confirm-modal-overlay').addEventListener('click', onCancel);
  });
}

/* ============================================
   ORG-3: Bind inline onclick/onsubmit handlers via JS
   ============================================ */
function initDOMEventBindings() {
  // Sidebar nav + brand
  document.querySelectorAll('.sidebar-nav .nav-item, .sidebar-brand').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.activeElement?.blur();
      const tab = link.dataset.tab;
      if (tab) AppRouter.switchTab(tab);
    });
  });

  // Pomodoro topbar toggle
  const pomoBtn = document.getElementById('btn-pomodoro-topbar');
  if (pomoBtn) pomoBtn.addEventListener('click', () => {
    document.getElementById('pomodoro-widget')?.classList.toggle('hidden');
  });

  // User dropdown â†’ Profile
  const dpProfile = document.getElementById('btn-dropdown-profile');
  if (dpProfile) dpProfile.addEventListener('click', () => AppRouter.switchTab('profile'));

  // Dashboard "View All" playlists
  const viewAll = document.getElementById('btn-dashboard-view-all');
  if (viewAll) viewAll.addEventListener('click', () => AppRouter.switchTab('playlists'));

  // All "Add Playlist" buttons (use shared class)
  document.addEventListener('click', (e) => {
    if (e.target.closest('.btn-open-add-playlist')) {
      document.getElementById('add-playlist-modal')?.classList.remove('hidden');
    }
  });

  // Edit Profile button
  const editProfile = document.getElementById('btn-edit-profile');
  if (editProfile) editProfile.addEventListener('click', () => ProfileEditor.open());

  // Edit Profile modal close (overlay + X button)
  const epOverlay = document.getElementById('edit-profile-overlay');
  const epClose = document.getElementById('btn-close-edit-profile');
  if (epOverlay) epOverlay.addEventListener('click', () => ProfileEditor.close());
  if (epClose) epClose.addEventListener('click', () => ProfileEditor.close());

  // Edit Profile form submit
  const epForm = document.getElementById('edit-profile-form');
  if (epForm) epForm.addEventListener('submit', (e) => ProfileEditor.save(e));

  // Shortcuts modal close
  const scOverlay = document.getElementById('shortcuts-modal-overlay');
  const scClose = document.getElementById('btn-close-shortcuts');
  const closeShortcuts = () => document.getElementById('shortcuts-modal')?.classList.add('hidden');
  if (scOverlay) scOverlay.addEventListener('click', closeShortcuts);
  if (scClose) scClose.addEventListener('click', closeShortcuts);

  // Goal modal close
  const goalOverlay = document.getElementById('goal-modal-overlay');
  const goalClose = document.getElementById('btn-close-goal');
  const closeGoal = () => document.getElementById('goal-modal')?.classList.add('hidden');
  if (goalOverlay) goalOverlay.addEventListener('click', closeGoal);
  if (goalClose) goalClose.addEventListener('click', closeGoal);

  // FN-8: Escape key closes all modals, dropdowns, and pomodoro widget
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    // Close player modal first (needs special close to stop video)
    const playerModal = document.getElementById('player-modal');
    if (playerModal && !playerModal.classList.contains('hidden')) {
      if (typeof Player !== 'undefined' && Player.close) Player.close();
      return; // Only close one thing per Escape press
    }

    // Close any visible modals
    const openModal = document.querySelector('.modal:not(.hidden)');
    if (openModal) {
      openModal.classList.add('hidden');
      return;
    }

    // Close pomodoro widget if visible
    const pomoWidget = document.getElementById('pomodoro-widget');
    if (pomoWidget && !pomoWidget.classList.contains('hidden')) {
      pomoWidget.classList.add('hidden');
      return;
    }

    // Close user dropdown if open
    const dropdown = document.querySelector('.dropdown-menu:not(.hidden)');
    if (dropdown) {
      dropdown.classList.add('hidden');
      return;
    }

    // Close global search results
    const searchResults = document.getElementById('global-search-results');
    if (searchResults && !searchResults.classList.contains('hidden')) {
      searchResults.classList.add('hidden');
    }
  });
}

/* ============================================
   Offline Indicator
   ============================================ */
function initOfflineIndicator() {
  const badge = document.getElementById('offline-badge');
  if (!badge) return;

  function updateStatus() {
    if (!navigator.onLine) {
      badge.classList.remove('hidden');
      showToast('You are offline. Some features may be unavailable.', 'warning');
    } else {
      badge.classList.add('hidden');
    }
  }

  window.addEventListener('offline', () => {
    badge.classList.remove('hidden');
    showToast('You are offline.', 'warning');
  });

  window.addEventListener('online', () => {
    badge.classList.add('hidden');
    showToast('You\'re back online!', 'success');
  });

  // Set initial state
  if (!navigator.onLine) badge.classList.remove('hidden');
}

/* ============================================
   PWA Install Prompt
   ============================================ */
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;

  if (localStorage.getItem('playpulse_pwa_dismissed')) return;

  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.classList.add('hidden');
  showToast('App installed successfully!', 'success');
});

function initPWAInstallPrompt() {
  const installBtn = document.getElementById('btn-pwa-install');
  const dismissBtn = document.getElementById('btn-pwa-dismiss');
  const banner = document.getElementById('pwa-install-banner');

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const result = await deferredInstallPrompt.userChoice;
      if (result.outcome === 'accepted') {
        if (banner) banner.classList.add('hidden');
      }
      deferredInstallPrompt = null;
    });
  }

  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      if (banner) banner.classList.add('hidden');
      localStorage.setItem('playpulse_pwa_dismissed', '1');
    });
  }
}

/* ============================================
   Custom Select â€” replaces native <select>
   ============================================ */
function initCustomSelects() {
  document.querySelectorAll('select.select-field').forEach(sel => {
    if (sel.classList.contains('native-select')) return; // Keep as native dropdown
    if (sel.closest('.custom-select')) return; // already wrapped

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select';
    sel.parentNode.insertBefore(wrapper, sel);
    wrapper.appendChild(sel);

    // Trigger button
    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    const selText = sel.options[sel.selectedIndex]?.text || '';
    trigger.innerHTML = `<span class="cs-label">${selText}</span><i class="fa-solid fa-chevron-down cs-arrow"></i>`;
    wrapper.insertBefore(trigger, sel);

    // Options panel
    const panel = document.createElement('div');
    panel.className = 'custom-select-options';
    wrapper.appendChild(panel);

    function buildOptions() {
      panel.innerHTML = '';
      Array.from(sel.options).forEach((opt, idx) => {
        const div = document.createElement('div');
        div.className = 'custom-select-option' + (idx === sel.selectedIndex ? ' selected' : '');
        div.textContent = opt.text;
        div.dataset.value = opt.value;
        div.addEventListener('click', (e) => {
          e.stopPropagation();
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          trigger.querySelector('.cs-label').textContent = opt.text;
          panel.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
          div.classList.add('selected');
          wrapper.classList.remove('open');
        });
        panel.appendChild(div);
      });
    }
    buildOptions();

    // Watch for options being added/changed dynamically (e.g. tag filter)
    const observer = new MutationObserver(() => {
      buildOptions();
      trigger.querySelector('.cs-label').textContent = sel.options[sel.selectedIndex]?.text || '';
    });
    observer.observe(sel, { childList: true, subtree: true });

    // Also listen for programmatic value changes
    sel.addEventListener('change', () => {
      trigger.querySelector('.cs-label').textContent = sel.options[sel.selectedIndex]?.text || '';
      panel.querySelectorAll('.custom-select-option').forEach(o => {
        o.classList.toggle('selected', o.dataset.value === sel.value);
      });
    });

    // Toggle
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = wrapper.classList.contains('open');
      // Close all other custom selects
      document.querySelectorAll('.custom-select.open').forEach(w => w.classList.remove('open'));
      if (!isOpen) wrapper.classList.add('open');
    });
  });

  // Close on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select.open').forEach(w => w.classList.remove('open'));
  });
}

/* ============================================
   App Boot â€” Master initialization
   ============================================ */
document.addEventListener('DOMContentLoaded', () => {
  Auth.requireAuth(async (user) => {
    // Initialize shared modules
    UI.init();
    Notes.init();
    Pomodoro.init();
    Player.initEvents();

    const data = await FirestoreOps.getUserData();

    // ---------- Topbar ----------
    document.getElementById('topbar-avatar').src = user.photoURL || '';
    document.getElementById('topbar-name').textContent = user.displayName?.split(' ')[0] || 'User';

    // ---------- Sidebar XP ----------
    const xp = data?.totalXP || 0;
    const levelInfo = getLevelFromXP(xp);
    document.getElementById('sidebar-level').textContent = levelInfo.level;
    document.getElementById('sidebar-xp').textContent = `${levelInfo.currentXP}/${levelInfo.nextLevelXP}`;
    const pct = levelInfo.nextLevelXP > 0 ? (levelInfo.currentXP / levelInfo.nextLevelXP) * 100 : 0;
    document.getElementById('sidebar-xp-bar').style.width = pct + '%';
    document.getElementById('sidebar-streak').textContent = data?.currentStreak || 0;

    // ---------- Logout ----------
    document.getElementById('btn-logout').addEventListener('click', () => Auth.logout());

    // ---------- Initialize Dashboard (default tab) ----------
    await DashboardController.init(user, data);
    AppRouter.markInited('dashboard');

    // ---------- Initialize PlaylistPage (pre-load) ----------
    await PlaylistPage.init(user);
    PlaylistPage.initEditPlaylistModal();
    AppRouter.markInited('playlists');

    // ---------- Check badges on login (retroactive) ----------
    Gamification.checkAchievements();

    // ---------- Check URL hash for tab ----------
    const hash = window.location.hash.replace('#', '');
    if (hash && hash.startsWith('playlists/')) {
      const playlistId = hash.split('/')[1];
      AppRouter.switchTab('playlists');
      if (playlistId) PlaylistPage.openPlaylistDetail(playlistId);
    } else if (hash && ['dashboard', 'playlists', 'analytics', 'profile'].includes(hash)) {
      AppRouter.switchTab(hash);
    }

    // ---------- Listen for hash changes ----------
    window.addEventListener('hashchange', () => {
      const h = window.location.hash.replace('#', '');
      if (h && h.startsWith('playlists/')) {
        const playlistId = h.split('/')[1];
        AppRouter.switchTab('playlists');
        if (playlistId) PlaylistPage.openPlaylistDetail(playlistId);
      } else if (h && ['dashboard', 'playlists', 'analytics', 'profile'].includes(h)) {
        AppRouter.switchTab(h);
      }
    });

    // ---------- Init custom selects ----------
    initCustomSelects();

    // ---------- ORG-3: Bind DOM event handlers ----------
    initDOMEventBindings();

    // ---------- Init Global Search ----------
    initGlobalSearch();

    // ---------- Init PWA Install Prompt ----------
    initPWAInstallPrompt();

    // ---------- Init Offline Indicator ----------
    initOfflineIndicator();

    // ---------- Final Reveal (ORG-5) ----------
    // Hide loading screen only after everything is ready
    const loading = document.getElementById('auth-loading');
    const app = document.getElementById('app');
    if (loading) loading.style.display = 'none';
    if (app) app.classList.remove('hidden');
  });
});
