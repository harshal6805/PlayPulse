/* ============================================
   Dashboard Controller (ORG-2: all functions inside IIFE)
   ============================================ */

const DashboardController = (() => {

  // ---------- Utility: format seconds ----------
  function formatSeconds(seconds) {
    if (!seconds || seconds <= 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  }

  // ---------- Init ----------
  async function init(user, data) {
    // ---------- Daily Stats ----------
    const todayLog = await FirestoreOps.getTodayLog();
    document.getElementById('stat-minutes-today').textContent = Math.round(todayLog.minutesStudied || 0);
    document.getElementById('stat-videos-today').textContent = todayLog.videosCompleted || 0;
    document.getElementById('stat-streak').textContent = data?.currentStreak || 0;
    document.getElementById('stat-total-xp').textContent = data?.totalXP || 0;

    // ---------- Combo Display ----------
    await Gamification.updateComboDisplay();

    // ---------- Daily Goal ----------
    renderGoalSection(todayLog);

    // ---------- Resume ----------
    await loadResume();

    // ---------- Streak Recovery ----------
    const canRecover = await Gamification.canUseStreakRecovery();
    const recoveryBtn = document.getElementById('btn-streak-recovery');
    if (recoveryBtn) {
      if (canRecover) {
        recoveryBtn.classList.remove('hidden');
        // BUG-4: Prevent duplicate listeners using data attribute flag
        if (!recoveryBtn.dataset.bound) {
          recoveryBtn.dataset.bound = '1';
          recoveryBtn.addEventListener('click', async () => {
            const ok = await Gamification.useStreakRecovery();
            if (ok) {
              recoveryBtn.classList.add('hidden');
              const ud = await FirestoreOps.getUserData();
              Gamification.updateStreakDisplay(ud.currentStreak || 0, ud.longestStreak || 0);
            }
          });
        }
      }
    }

    // ---------- Load Playlists ----------
    const playlists = await FirestoreOps.getPlaylists();
    renderDashboardPlaylists(playlists);

    // ---------- Tag Input ----------
    // Uses initTagInput() from playlist.js which reads from allPlaylists directly

    // ---------- Weekly Chart ----------
    await Analytics.renderWeeklyDashboard();

    // ---------- FN-7: Watch History Timeline ----------
    await renderWatchHistory();

    // ---------- Keyboard Shortcuts ----------
    initKeyboardShortcuts();
  }

  async function refresh() {
    const playlists = await FirestoreOps.getPlaylists();
    renderDashboardPlaylists(playlists);
  }

  // ---------- Resume ----------
  async function loadResume() {
    const resumeSection = document.getElementById('resume-section');
    const resumeCard = document.getElementById('resume-card');
    if (!resumeSection || !resumeCard) return;

    try {
      const candidates = await FirestoreOps.getResumeVideos();
      // console.log('[Resume] Firestore candidates:', candidates.length);

      // localStorage fallback — guarantees Resume works even if Firestore fields are missing
      if (candidates.length === 0) {
        const lsResume = JSON.parse(localStorage.getItem('playpulse_resume') || 'null');
        if (lsResume) {
          candidates.push({
            playlistId: lsResume.playlistId,
            playlistTitle: '',
            playlistTag: lsResume.tag || 'Other',
            videoDocId: lsResume.videoDocId,
            videoId: lsResume.videoId,
            title: lsResume.title,
            thumbnail: lsResume.thumbnail || `https://i.ytimg.com/vi/${lsResume.videoId}/mqdefault.jpg`,
            duration: 0,
            watchedSeconds: 0,
            completionPct: 0,
            remaining: 0,
            lastWatchedTs: Date.now(),
            withinDay: true,
            withinSameDay: true
          });
        }
      }
      // console.log('[Resume] After LS fallback:', candidates.length);

      if (!candidates.length) {
        // RESUME-4: Show empty state instead of hiding entirely
        resumeSection.classList.remove('hidden');
        resumeCard.innerHTML = DOMPurify.sanitize(`
          <div class="empty-state resume-empty-state">
            <i class="fa-solid fa-forward" style="font-size:2rem;color:var(--text-muted);margin-bottom:8px"></i>
            <p>Start watching a video to unlock Resume!</p>
            <span style="font-size:.8rem;color:var(--text-muted)">Your in-progress videos will appear here for quick access.</span>
          </div>
        `);
        return;
      }

      const top = candidates[0];
      const remainFormatted = formatSeconds(top.remaining);

      resumeSection.classList.remove('hidden');
      resumeSection.classList.add('resume-hero-animate');

      resumeCard.innerHTML = DOMPurify.sanitize(`
        <div class="resume-hero">
          <div class="resume-hero-thumb">
            ${top.thumbnail ? `<img src="${top.thumbnail}" alt="${top.title}" />` : '<div class="resume-thumb-placeholder"><i class="fa-solid fa-play"></i></div>'}
            <div class="resume-completion-ring">
              <svg viewBox="0 0 36 36">
                <path class="ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path class="ring-fill" stroke-dasharray="${top.completionPct}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <span class="ring-text">${top.completionPct}%</span>
            </div>
          </div>
          <div class="resume-hero-info">
            <div class="resume-hero-label"><i class="fa-solid fa-bolt"></i> Continue where you left off</div>
            <div class="resume-hero-title">${top.title}</div>
            <div class="resume-hero-meta">
              <span class="tag-badge tag-custom">${top.playlistTag}</span>
              ${top.remaining > 0 ? `<span><i class="fa-solid fa-clock"></i> ${remainFormatted} remaining</span>` : ''}
              ${top.withinDay ? '<span class="resume-recent-badge"><i class="fa-solid fa-fire"></i> Recent</span>' : ''}
            </div>
            <div class="resume-hero-actions">
              <button class="btn btn-primary resume-btn" id="btn-smart-resume"><i class="fa-solid fa-play"></i> Resume</button>
              <button class="btn btn-secondary resume-btn" id="btn-focus-session"><i class="fa-solid fa-brain"></i> Focus Session</button>
            </div>
          </div>
        </div>
      `);

      // Bind resume button
      document.getElementById('btn-smart-resume').addEventListener('click', () => {
        AppRouter.switchTab('playlists');
        PlaylistPage.openFromResume(top.playlistId, top.videoDocId, true, false);
      });

      // Focus session — start pomodoro then resume
      document.getElementById('btn-focus-session').addEventListener('click', () => {
        AppRouter.switchTab('playlists');
        PlaylistPage.openFromResume(top.playlistId, top.videoDocId, true, true);
      });

    } catch (e) {
      console.error('Resume error:', e);
      resumeSection.classList.add('hidden');
    }
  }

  // ---------- Daily Goal ----------
  function renderGoalSection(todayLog) {
    const goal = parseInt(localStorage.getItem('playpulse_daily_goal')) || DEFAULT_DAILY_GOAL_MIN;
    const studied = Math.round(todayLog.minutesStudied || 0);
    const pct = Math.min(100, Math.round((studied / goal) * 100));

    const goalLabel = document.getElementById('goal-label');
    const goalMessage = document.getElementById('goal-message');
    const goalBar = document.getElementById('goal-bar');

    if (goalLabel) goalLabel.textContent = `${studied} / ${goal} min`;
    if (goalBar) goalBar.style.width = pct + '%';

    let msg = 'Get started!';
    if (pct > 0 && pct < 50) msg = 'Keep going!';
    else if (pct >= 50 && pct < 100) msg = 'Almost there!';
    else if (pct >= 100) msg = '🎉 Goal reached!';
    if (goalMessage) goalMessage.textContent = msg;

    // Edit goal button
    const editBtn = document.getElementById('btn-edit-goal');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        document.getElementById('input-daily-goal').value = goal;
        document.getElementById('goal-modal').classList.remove('hidden');
      });
    }

    // Goal form
    const goalForm = document.getElementById('goal-form');
    if (goalForm && !goalForm._bound) {
      goalForm._bound = true;
      goalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const newGoal = parseInt(document.getElementById('input-daily-goal').value) || DEFAULT_DAILY_GOAL_MIN;
        localStorage.setItem('playpulse_daily_goal', String(newGoal));
        document.getElementById('goal-modal').classList.add('hidden');
        renderGoalSection(todayLog);
        showToast('Daily goal updated!', 'success');
      });
    }
  }

  // ---------- Dashboard Playlists ----------
  function renderDashboardPlaylists(playlists) {
    const container = document.getElementById('dashboard-playlists');
    if (!playlists.length) {
      container.innerHTML = DOMPurify.sanitize('<div class="empty-state"><i class="fa-solid fa-folder-open"></i><p>No playlists yet. Add your first one!</p><button class="btn-primary btn-sm" style="margin-top:12px" onclick="document.getElementById(\'add-playlist-modal\').classList.remove(\'hidden\')"><i class="fa-solid fa-plus"></i> Add Your First Playlist</button></div>', { ADD_ATTR: ['onclick'] });
      return;
    }

    // UX-12: Show only in-progress and recently added playlists (max 3)
    const recentPlaylists = playlists
      .filter(pl => {
        const total = pl.totalVideos || 0;
        const done = pl.completedCount || 0;
        return done < total;
      })
      .slice(0, 3);

    const toShow = recentPlaylists.length ? recentPlaylists : playlists.slice(0, 3);

    container.innerHTML = DOMPurify.sanitize(toShow.map(pl => {
      const total = pl.totalVideos || 0;
      const done = pl.completedCount || 0;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const tagClass = getTagClass(pl.tag);
      const prioClass = (pl.priority || 'medium').toLowerCase();

      return `
        <div class="playlist-card ${pct === 100 ? 'playlist-card--complete' : ''}" data-id="${pl.id}" onclick="AppRouter.switchTab('playlists'); PlaylistPage.openPlaylistDetail('${pl.id}');">
          ${pct === 100 ? '<div class="completion-ribbon"><i class="fa-solid fa-check"></i> Complete</div>' : ''}
          <div class="playlist-card-thumb">
            ${pl.thumbnail ? `<img src="${pl.thumbnail}" alt="${pl.title}" loading="lazy" />` : ''}
          </div>
          <div class="playlist-card-body">
            <div class="playlist-card-title">${pl.title || 'Untitled'}</div>
            <div class="playlist-card-meta">
              <span class="tag-badge ${tagClass}">${pl.tag || 'Other'}</span>
              <span class="priority-badge ${prioClass}">${pl.priority || 'Medium'}</span>
            </div>
            <div class="playlist-card-stats">
              <span><i class="fa-solid fa-video"></i>${total} videos</span>
              <span><i class="fa-solid fa-circle-check"></i>${done} done</span>
            </div>
            <div class="playlist-card-progress">
              <div class="playlist-card-progress-label"><span>${pct}%</span><span>${done}/${total}</span></div>
              <div class="progress-bar-container"><div class="progress-bar" style="width:${pct}%"></div></div>
            </div>
          </div>
        </div>
      `;
    }).join(''), { ADD_ATTR: ['onclick'] });
  }

  // ---------- FN-7: Watch History Timeline ----------
  async function renderWatchHistory() {
    const container = document.getElementById('watch-history-container');
    const section = document.getElementById('watch-history-section');
    if (!container) return;

    try {
      const playlists = await FirestoreOps.getPlaylists();
      // history is initialized below from results

      const historyResults = await Promise.all(playlists.map(async (pl) => {
        const videos = await FirestoreOps.getVideos(pl.id);
        return videos
          .filter(v => v.lastWatchedAt)
          .map(v => {
            const ts = v.lastWatchedAt.toDate ? v.lastWatchedAt.toDate().getTime() : (typeof v.lastWatchedAt === 'number' ? v.lastWatchedAt : 0);
            if (ts <= 0) return null;
            return {
              title: v.title || 'Untitled',
              playlistId: pl.id,
              videoDocId: v.id,
              playlistTitle: pl.title,
              timestamp: ts,
              completed: !!v.completed,
              watchedSeconds: v.watchedSeconds || 0,
              duration: v.duration || 0
            };
          })
          .filter(Boolean);
      }));

      const history = historyResults.flat();

      // Sort by most recent
      history.sort((a, b) => b.timestamp - a.timestamp);

      if (!history.length) {
        if (section) section.classList.add('hidden');
        return;
      }

      if (section) section.classList.remove('hidden');

      const PAGE_SIZE = 5;
      let visibleCount = PAGE_SIZE;

      function renderPage() {
        const slice = history.slice(0, visibleCount);

        container.innerHTML = DOMPurify.sanitize(slice.map(item => {
          const date = new Date(item.timestamp);
          const now = Date.now();
          const diffMs = now - item.timestamp;
          let timeAgo;
          if (diffMs < 60000) timeAgo = 'Just now';
          else if (diffMs < 3600000) timeAgo = Math.floor(diffMs / 60000) + 'm ago';
          else if (diffMs < 86400000) timeAgo = Math.floor(diffMs / 3600000) + 'h ago';
          else if (diffMs < 172800000) timeAgo = 'Yesterday';
          else timeAgo = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

          const pct = item.duration > 0 ? Math.round((item.watchedSeconds / item.duration) * 100) : 0;
          const icon = item.completed ? 'fa-circle-check' : 'fa-play';
          const statusClass = item.completed ? 'completed' : 'in-progress';

          return `
            <div class="timeline-item" data-plid="${item.playlistId}" data-vid="${item.videoDocId}">
              <div class="timeline-status-icon ${statusClass}"><i class="fa-solid ${icon}"></i></div>
              <div class="timeline-body">
                <div class="timeline-title">${item.title.substring(0, 55)}${item.title.length > 55 ? '...' : ''}</div>
                <div class="timeline-subtitle">
                  <span>${item.playlistTitle.substring(0, 30)}${item.playlistTitle.length > 30 ? '...' : ''}</span>
                </div>
              </div>
              <span class="timeline-pct">${pct}%</span>
              <span class="timeline-time">${timeAgo}</span>
            </div>
          `;
        }).join(''));

        if (visibleCount < history.length) {
          container.insertAdjacentHTML('beforeend', DOMPurify.sanitize(`
            <div style="text-align:center;margin-top:8px;">
              <button id="watch-history-show-more" class="btn-ghost btn-sm">
                <i class="fa-solid fa-chevron-down"></i> Show more
              </button>
            </div>
          `));
        }

        container.querySelectorAll('.timeline-item').forEach(item => {
          item.addEventListener('click', () => {
            AppRouter.switchTab('playlists');
            PlaylistPage.openFromResume(item.dataset.plid, item.dataset.vid, false, false);
          });
        });

        const showMoreBtn = document.getElementById('watch-history-show-more');
        if (showMoreBtn) {
          showMoreBtn.addEventListener('click', () => {
            visibleCount = Math.min(visibleCount + PAGE_SIZE, history.length);
            renderPage();
          });
        }
      }

      renderPage();
    } catch (e) {
      console.error('Watch history error:', e);
      if (section) section.classList.add('hidden');
    }
  }

  // ---------- Keyboard Shortcuts ----------
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      switch (e.key.toLowerCase()) {
        case 'r':
          const resumeBtn = document.getElementById('btn-smart-resume');
          if (resumeBtn) resumeBtn.click();
          break;
        case 'n':
          const modal = document.getElementById('add-playlist-modal');
          if (modal) modal.classList.remove('hidden');
          break;
        case '?':
          const shortcutsModal = document.getElementById('shortcuts-modal');
          if (shortcutsModal) shortcutsModal.classList.toggle('hidden');
          break;
      }
    });
  }

  return { init, refresh };
})();
