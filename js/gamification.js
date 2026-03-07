/* ============================================
   Gamification Module (XP, Streaks, Badges,
   Momentum, Combos, Skill XP)
   ============================================ */

const Gamification = (() => {

  // ---------- Core XP awarding ----------
  async function _addXP(amount, label) {
    const userData = await FirestoreOps.getUserData();
    const oldXP = userData.totalXP || 0;
    const oldLevel = getLevelFromXP(oldXP).level;
    const newXP = oldXP + amount;
    const levelInfo = getLevelFromXP(newXP);

    await FirestoreOps.updateUser({ totalXP: newXP, level: levelInfo.level });
    showXPPopup(label || `+${amount} XP`);
    updateXPDisplay(newXP, levelInfo);

    // Level-up confetti
    if (levelInfo.level > oldLevel && typeof launchConfetti === 'function') {
      launchConfetti();
      const title = getLevelTitle(levelInfo.level);
      showToast(`Level Up! You're now level ${levelInfo.level} — ${title}`, 'success');
    }
    return newXP;
  }

  async function awardVideoComplete(options = {}) {
    let totalXP = XP_PER_VIDEO;
    let label = `+${XP_PER_VIDEO} XP`;

    // Momentum bonus
    const combo = await getComboMultiplier();
    if (combo > 1) {
      totalXP = Math.round(totalXP * combo);
      label = `+${totalXP} XP (x${combo} combo!)`;
    }

    // Resume bonuses
    if (options.wasResumed) {
      totalXP += FINISH_RESUMED_BONUS;
      label = `+${totalXP} XP (Finish resumed!)`;
    }

    await _addXP(totalXP, label);

    // Skill XP
    if (options.tag) {
      await FirestoreOps.addSkillXP(options.tag, totalXP);
    }
  }

  async function awardPlaylistComplete() {
    await _addXP(XP_PER_PLAYLIST, `+${XP_PER_PLAYLIST} XP — Playlist Complete!`);
  }

  async function awardWatchTime(minutes) {
    if (minutes < 60) return;
    const hours = Math.floor(minutes / 60);
    const xpEarned = hours * XP_PER_HOUR;
    if (xpEarned <= 0) return;
    await _addXP(xpEarned, `+${xpEarned} XP (${hours}h watched)`);
  }

  // ---------- Momentum Bonuses ----------
  async function awardResumeBonus(lastWatchedTs) {
    if (!lastWatchedTs) return;
    const now = Date.now();
    const diff = now - lastWatchedTs;
    const sameDay = new Date(lastWatchedTs).toDateString() === new Date().toDateString();

    if (sameDay) {
      await _addXP(RESUME_SAME_DAY_BONUS, `+${RESUME_SAME_DAY_BONUS} XP (Same-day resume!)`);
    } else if (diff < 86400000) {
      await _addXP(RESUME_24H_BONUS, `+${RESUME_24H_BONUS} XP (Quick resume!)`);
    }
  }

  // ---------- Combo System ----------
  async function getComboMultiplier() {
    const userData = await FirestoreOps.getUserData();
    const comboStreak = userData.comboStreak || 0;
    let multi = 1;
    for (const t of COMBO_THRESHOLDS) {
      if (comboStreak >= t.days) multi = t.multiplier;
    }
    return multi;
  }

  async function updateCombo() {
    // Called once per day when a video is completed
    const userData = await FirestoreOps.getUserData();
    const today = FirestoreOps.todayStr();
    if (userData.lastComboDate === today) return; // already counted today

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let comboStreak = userData.comboStreak || 0;

    if (userData.lastComboDate === yesterday) {
      comboStreak++;
    } else if (userData.lastComboDate !== today) {
      comboStreak = 1;
    }

    await FirestoreOps.updateUser({ comboStreak, lastComboDate: today });

    const multi = COMBO_THRESHOLDS.reduce((m, t) => comboStreak >= t.days ? t.multiplier : m, 1);
    if (multi > 1) {
      showToast(`🔥 ${comboStreak}-day combo! x${multi} XP multiplier active`, 'success');
    }
    return comboStreak;
  }

  // ---------- Streak Recovery ----------
  async function useStreakRecovery() {
    const userData = await FirestoreOps.getUserData();
    const lastUsed = userData.lastStreakRecoveryUsed || '';
    const daysSince = lastUsed ? Math.floor((Date.now() - new Date(lastUsed).getTime()) / 86400000) : 999;

    if (daysSince < STREAK_RECOVERY_COOLDOWN_DAYS) {
      const remaining = STREAK_RECOVERY_COOLDOWN_DAYS - daysSince;
      showToast(`Recovery on cooldown — ${remaining} days left`, 'warning');
      return false;
    }

    // Restore streak
    const prevStreak = userData.currentStreak || 0;
    if (prevStreak > 0) {
      showToast('Your streak is active — no recovery needed!', 'info');
      return false;
    }

    const restoredStreak = userData.longestStreak || 1;
    await FirestoreOps.updateUser({
      currentStreak: Math.min(restoredStreak, 7), // cap recovery at 7
      lastStreakDate: FirestoreOps.todayStr(),
      lastStreakRecoveryUsed: new Date().toISOString()
    });

    showToast('Streak recovered! Don\'t miss another day 💪', 'success');
    return true;
  }

  async function canUseStreakRecovery() {
    const userData = await FirestoreOps.getUserData();
    if (!userData) return false;
    if ((userData.currentStreak || 0) > 0) return false;
    const lastUsed = userData.lastStreakRecoveryUsed || '';
    const daysSince = lastUsed ? Math.floor((Date.now() - new Date(lastUsed).getTime()) / 86400000) : 999;
    return daysSince >= STREAK_RECOVERY_COOLDOWN_DAYS;
  }

  // ---------- Display helpers ----------
  function showXPPopup(text) {
    const popup = document.getElementById('xp-popup');
    if (!popup) return;
    const el = document.getElementById('xp-popup-text');
    if (el) el.textContent = text;
    popup.classList.remove('hidden');
    popup.classList.add('xp-animate');
    setTimeout(() => { popup.classList.add('hidden'); popup.classList.remove('xp-animate'); }, 2500);
  }

  function updateXPDisplay(totalXP, levelInfo) {
    const pct = levelInfo.nextLevelXP > 0 ? (levelInfo.currentXP / levelInfo.nextLevelXP) * 100 : 0;
    const levelTitle = getLevelTitle(levelInfo.level);

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setWidth = (id, val) => { const el = document.getElementById(id); if (el) el.style.width = val; };

    setText('sidebar-level', levelInfo.level);
    setText('sidebar-xp', `${levelInfo.currentXP}/${levelInfo.nextLevelXP}`);
    setWidth('sidebar-xp-bar', `${pct}%`);
    setText('stat-total-xp', totalXP);
    setText('profile-level', levelInfo.level);
    setText('profile-level-title', levelTitle);
    setText('profile-total-xp', totalXP);
    setText('profile-current-level-xp', levelInfo.currentXP);
    setText('profile-next-xp', levelInfo.nextLevelXP);
    setWidth('profile-xp-bar', `${pct}%`);
  }

  function updateStreakDisplay(currentStreak, longestStreak) {
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText('sidebar-streak', currentStreak);
    setText('stat-streak', currentStreak);
    setText('profile-streak', currentStreak);
  }

  async function updateComboDisplay() {
    const userData = await FirestoreOps.getUserData();
    const comboStreak = userData?.comboStreak || 0;
    const multi = COMBO_THRESHOLDS.reduce((m, t) => comboStreak >= t.days ? t.multiplier : m, 1);
    const el = document.getElementById('combo-display');
    if (el) {
      el.innerHTML = DOMPurify.sanitize(`<i class="fa-solid fa-bolt"></i> ${comboStreak}-day combo${multi > 1 ? ` <span class="combo-multi">x${multi}</span>` : ''}`);
      el.className = `combo-display ${multi > 1 ? 'combo-active' : ''}`;
    }
  }

  // ---------- Achievements ----------
  async function checkAchievements() {
    const userData = await FirestoreOps.getUserData();
    const playlists = await FirestoreOps.getPlaylists();

    let totalVideosCompleted = 0;
    let totalWatchedSeconds = 0;
    let playlistsCompleted = 0;

    for (const pl of playlists) {
      const videos = await FirestoreOps.getVideos(pl.id);
      const completed = videos.filter(v => v.completed).length;
      totalVideosCompleted += completed;
      totalWatchedSeconds += videos.reduce((s, v) => s + (v.watchedSeconds || 0), 0);
      if (completed >= videos.length && videos.length > 0) playlistsCompleted++;
    }

    const stats = {
      totalVideos: totalVideosCompleted,
      totalPlaylists: playlists.length,
      totalPlaylistsCompleted: playlistsCompleted,
      longestStreak: userData.longestStreak || 0,
      totalHours: totalWatchedSeconds / 3600,
      comboStreak: userData.comboStreak || 0,
      totalPomodoroSessions: userData.totalPomodoroSessions || 0
    };

    for (const badge of BADGE_DEFS) {
      if (badge.check(stats)) {
        const unlocked = await FirestoreOps.unlockAchievement(badge.id, badge.name);
        if (unlocked) showBadgeUnlock(badge);
      }
    }
  }

  function showBadgeUnlock(badge) {
    const modal = document.getElementById('badge-unlock-modal');
    if (!modal) return;
    const nameEl = document.getElementById('badge-unlock-name');
    if (nameEl) nameEl.textContent = badge.name || badge;
    const iconEl = document.getElementById('badge-unlock-icon');
    if (iconEl) iconEl.className = badge.icon || 'fa-solid fa-trophy';
    const descEl = document.getElementById('badge-unlock-desc');
    if (descEl) descEl.textContent = badge.desc || '';
    modal.classList.remove('hidden');

    if (typeof launchConfetti === 'function') launchConfetti();

    const dismissBtn = document.getElementById('btn-badge-dismiss');
    if (dismissBtn) dismissBtn.onclick = () => modal.classList.add('hidden');
  }

  async function renderBadges(container) {
    if (!container) container = document.getElementById('profile-badges-grid');
    if (!container) return;

    const earned = await FirestoreOps.getAchievements();
    const earnedIds = earned.map(a => a.id);
    container.innerHTML = '';

    const earnedBadges = [];
    const lockedBadges = [];

    BADGE_DEFS.forEach(badge => {
      if (earnedIds.includes(badge.id)) earnedBadges.push(badge);
      else lockedBadges.push(badge);
    });

    // Earned Badges Wrapper
    const earnedWrapper = document.createElement('div');
    earnedWrapper.className = 'earned-badges-wrapper';
    
    if (earnedBadges.length > 0) {
      earnedBadges.forEach(badge => {
        const earnedData = earned.find(a => a.id === badge.id);
        const card = _createBadgeCard(badge, true, earnedData);
        earnedWrapper.appendChild(card);
      });
    } else {
      const hint = document.createElement('div');
      hint.className = 'achievements-hint-mobile';
      hint.textContent = 'Keep studying to earn your first badge!';
      earnedWrapper.appendChild(hint);
    }
    container.appendChild(earnedWrapper);

    // Toggle button (Mobile only via CSS)
    if (lockedBadges.length > 0) {
      const moreBtn = document.createElement('button');
      moreBtn.className = 'btn-toggle-locked-badges';
      moreBtn.innerHTML = `<span>Show locked achievements (${lockedBadges.length})</span><i class="fa-solid fa-chevron-down"></i>`;
      
      const lockedWrapper = document.createElement('div');
      lockedWrapper.className = 'locked-badges-wrapper mobile-hidden';
      
      lockedBadges.forEach(badge => {
        const card = _createBadgeCard(badge, false);
        lockedWrapper.appendChild(card);
      });

      moreBtn.onclick = () => {
        const isHidden = lockedWrapper.classList.toggle('mobile-hidden');
        moreBtn.classList.toggle('active', !isHidden);
        moreBtn.querySelector('span').textContent = isHidden 
          ? `Show locked achievements (${lockedBadges.length})` 
          : 'Hide locked achievements';
        moreBtn.querySelector('i').className = isHidden ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-up';
      };

      container.appendChild(moreBtn);
      container.appendChild(lockedWrapper);
    }
  }

  function _createBadgeCard(badge, isEarned, earnedData = null) {
    const card = document.createElement('div');
    card.className = `badge-card ${isEarned ? 'earned' : 'locked'}`;
    const tooltipText = isEarned
      ? `Earned ${earnedData?.earnedAt ? earnedData.earnedAt.toDate().toLocaleDateString() : ''}`
      : (badge.desc || badge.name);
    card.innerHTML = DOMPurify.sanitize(`
      <div class="badge-tooltip">${tooltipText}</div>
      <div class="badge-icon"><i class="${badge.icon}"></i></div>
      <div class="badge-name">${badge.name}</div>
      ${badge.desc ? `<div class="badge-desc">${badge.desc}</div>` : ''}
      ${isEarned && earnedData?.earnedAt ? `<div class="badge-date">${earnedData.earnedAt.toDate().toLocaleDateString()}</div>` : ''}
    `);
    return card;
  }

  // ---------- Skill Tree ----------
  async function renderSkillTree(container) {
    if (!container) container = document.getElementById('skill-tree-grid');
    if (!container) return;

    const skills = await FirestoreOps.getSkillProgress();
    container.innerHTML = '';

    if (skills.length === 0) {
      container.innerHTML = '<p class="empty-state">Complete videos to build your skill tree!</p>';
      return;
    }

    for (const skill of skills.sort((a, b) => b.totalXP - a.totalXP)) {
      const levelInfo = getLevelFromXP(skill.totalXP);
      const pct = levelInfo.nextLevelXP > 0 ? (levelInfo.currentXP / levelInfo.nextLevelXP) * 100 : 0;
      const card = document.createElement('div');
      card.className = 'skill-card';
      card.innerHTML = DOMPurify.sanitize(`
        <div class="skill-header">
          <span class="skill-name">${skill.categoryName}</span>
          <span class="skill-level">Lv ${levelInfo.level}</span>
        </div>
        <div class="skill-bar-bg"><div class="skill-bar-fill" style="width:${pct}%"></div></div>
        <div class="skill-xp">${skill.totalXP} XP · ${levelInfo.currentXP}/${levelInfo.nextLevelXP} to next</div>
      `);
      container.appendChild(card);
    }
  }

  // ---------- Lifecycle ----------
  async function loadAndDisplay() {
    const userData = await FirestoreOps.getUserData();
    if (!userData) return;
    const levelInfo = getLevelFromXP(userData.totalXP || 0);
    updateXPDisplay(userData.totalXP || 0, levelInfo);
    updateStreakDisplay(userData.currentStreak || 0, userData.longestStreak || 0);
    await updateComboDisplay();
    await renderBadges();
  }

  return {
    awardVideoComplete,
    awardPlaylistComplete,
    awardWatchTime,
    awardResumeBonus,
    updateCombo,
    getComboMultiplier,
    useStreakRecovery,
    canUseStreakRecovery,
    checkAchievements,
    updateXPDisplay,
    updateStreakDisplay,
    updateComboDisplay,
    renderBadges,
    renderSkillTree,
    loadAndDisplay
  };
})();
