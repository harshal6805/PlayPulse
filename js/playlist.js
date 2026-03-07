/* ============================================
   Playlist Controller
   List view, detail view, videos, player
   ============================================ */

const PlaylistPage = (() => {
  let allPlaylists = [];
  let currentPlaylist = null;
  let currentVideos = [];
  let currentPage = 1;
  let filteredVideos = [];

  async function init(user) {
    // Load playlists
    allPlaylists = await FirestoreOps.getPlaylists();
    populateTagFilter();
    renderPlaylistsList();

    // Init tag input for modal
    initTagInput();

    // Events
    document.getElementById('btn-add-playlist').addEventListener('click', openAddModal);
    document.getElementById('btn-add-playlist-fab')?.addEventListener('click', toggleAddModal);
    document.getElementById('btn-back-playlists').addEventListener('click', backToList);

    // Filters
    document.getElementById('filter-tag').addEventListener('change', renderPlaylistsList);
    document.getElementById('filter-priority').addEventListener('change', renderPlaylistsList);
    document.getElementById('video-filter').addEventListener('change', applyVideoFilters);
    document.getElementById('video-sort').addEventListener('change', applyVideoFilters);
    document.getElementById('video-search').addEventListener('input', applyVideoFilters);

    // Detail-view action buttons (FN-2, FN-3, FN-4)
    document.getElementById('btn-sync-playlist')?.addEventListener('click', () => {
      if (currentPlaylist) syncPlaylist(currentPlaylist.id);
    });
    document.getElementById('btn-bulk-complete')?.addEventListener('click', () => bulkMarkComplete(true));
    document.getElementById('btn-bulk-incomplete')?.addEventListener('click', () => bulkMarkComplete(false));
    document.getElementById('btn-export-data')?.addEventListener('click', () => exportDataJSON());

    // Edit current playlist button in detail header
    document.getElementById('btn-edit-current-playlist')?.addEventListener('click', () => {
      if (currentPlaylist) editPlaylist(currentPlaylist.id);
    });

    // Add playlist modal
    document.getElementById('add-playlist-form').addEventListener('submit', handleAddPlaylist);
    document.querySelectorAll('.close-add-playlist, #add-playlist-modal .modal-overlay').forEach(el => {
      el.addEventListener('click', closeAddModal);
    });
  }

  /* ---------- Open From Resume (called by DashboardController) ---------- */
  async function openFromResume(playlistId, videoDocId, isResume, isFocus) {
    await openPlaylistDetail(playlistId);
    if (videoDocId) {
      const v = currentVideos.find(vid => vid.id === videoDocId);
      if (v) {
        const lastTs = v.lastWatchedAt?.toDate?.()?.getTime() || 0;
        Player.open(playlistId, v.id, v.id, v.title, v.notes || '', {
          tag: currentPlaylist?.tag || 'Other',
          wasResumed: isResume,
          lastWatchedTs: lastTs,
          initialSeekSeconds: v.watchedSeconds || 0 // RESUME-1: seek to last position
        });
        Player.updateMarkButton(v.completed);
        if (isFocus && typeof Pomodoro !== 'undefined' && !Pomodoro.isRunning()) {
          Pomodoro.start();
        }
      }
    }
  }

  /* ---------- Playlists List ---------- */
  function renderPlaylistsList() {
    const tagFilter = document.getElementById('filter-tag').value;
    const prioFilter = document.getElementById('filter-priority').value;

    let filtered = allPlaylists;
    if (tagFilter) filtered = filtered.filter(p => p.tag === tagFilter);
    if (prioFilter) filtered = filtered.filter(p => p.priority === prioFilter);

    const container = document.getElementById('playlists-container');

    if (!filtered.length) {
      container.innerHTML = DOMPurify.sanitize(`<div class="empty-state"><i class="fa-solid fa-folder-open"></i><p>No playlists match your filters.</p><button class="btn-primary btn-sm" style="margin-top:12px" onclick="document.getElementById('add-playlist-modal').classList.remove('hidden')"><i class="fa-solid fa-plus"></i> Add Your First Playlist</button></div>`, { ADD_ATTR: ['onclick'] });
      return;
    }

    container.innerHTML = DOMPurify.sanitize(filtered.map(pl => {
      const total = pl.totalVideos || 0;
      const done = pl.completedCount || 0;
      const pctNum = total > 0 ? Math.round((done / total) * 100) : 0;
      const tagClass = getTagClass(pl.tag);
      const prioClass = (pl.priority || 'medium').toLowerCase();

      return `
        <div class="playlist-card ${pctNum === 100 ? 'playlist-card--complete' : ''}" onclick="PlaylistPage.openPlaylistDetail('${pl.id}')">
          ${pctNum === 100 ? '<div class="completion-ribbon"><i class="fa-solid fa-check"></i> Complete</div>' : ''}
          <div class="playlist-card-thumb">
            ${pl.thumbnail ? `<img src="${pl.thumbnail}" alt="" loading="lazy" />` : ''}
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
              ${pl.estimatedRemainingTime ? `<span><i class="fa-solid fa-clock"></i>${pl.estimatedRemainingTime}</span>` : ''}
            </div>
            <div class="playlist-card-progress">
              <div class="playlist-card-progress-label"><span>${pctNum}%</span><span>${done}/${total}</span></div>
              <div class="progress-bar-container"><div class="progress-bar" style="width:${pctNum}%"></div></div>
            </div>
            <div class="playlist-card-actions">
              <button class="btn-ghost btn-sm" onclick="event.stopPropagation(); PlaylistPage.editPlaylist('${pl.id}')">
                <i class="fa-solid fa-pen"></i> Edit
              </button>
              <button class="btn-ghost btn-sm" onclick="event.stopPropagation(); PlaylistPage.deletePlaylist('${pl.id}', '${(pl.title || '').replace(/'/g, "\\'")}')">
                <i class="fa-solid fa-trash"></i> Delete
              </button>
            </div>
          </div>
        </div>
      `;
    }).join(''), { ADD_ATTR: ['onclick'] });
  }

  /* ---------- Detail View ---------- */
  async function openPlaylistDetail(playlistId) {
    currentPlaylist = allPlaylists.find(p => p.id === playlistId) || await FirestoreOps.getPlaylist(playlistId);
    if (!currentPlaylist) { showToast('Playlist not found', 'error'); return; }

    currentVideos = await FirestoreOps.getVideos(playlistId);
    currentPage = 1;

    // Hide list, show detail
    document.getElementById('playlists-list-view').classList.add('hidden');
    document.getElementById('playlist-detail-view').classList.remove('hidden');

    // Header
    document.getElementById('detail-playlist-title').textContent = currentPlaylist.title || 'Untitled';

    // Update URL to include playlist ID
    history.replaceState(null, '', '#playlists/' + playlistId);

    // YouTube link
    const ytLink = document.getElementById('detail-yt-link');
    if (ytLink && currentPlaylist.playlistId) {
      ytLink.href = `https://www.youtube.com/playlist?list=${currentPlaylist.playlistId}`;
      ytLink.style.display = '';
    } else if (ytLink) {
      ytLink.style.display = 'none';
    }

    // Completion badge
    const detailInfo = document.querySelector('.detail-info');
    const existingBadge = document.getElementById('completion-badge');
    if (existingBadge) existingBadge.remove();
    if (currentPlaylist.completedAt) {
      const completedDate = currentPlaylist.completedAt.toDate ? currentPlaylist.completedAt.toDate() : new Date(currentPlaylist.completedAt);
      const badge = document.createElement('div');
      badge.id = 'completion-badge';
      badge.className = 'completion-date-badge';
      badge.innerHTML = DOMPurify.sanitize(`<i class="fa-solid fa-circle-check"></i> Completed on ${completedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`);
      detailInfo.appendChild(badge);
    }

    const tagClass = getTagClass(currentPlaylist.tag);
    const prioClass = (currentPlaylist.priority || 'medium').toLowerCase();
    document.getElementById('detail-tag').className = `tag-badge ${tagClass}`;
    document.getElementById('detail-tag').textContent = currentPlaylist.tag || 'Other';
    document.getElementById('detail-priority').className = `priority-badge ${prioClass}`;
    document.getElementById('detail-priority').textContent = currentPlaylist.priority || 'Medium';

    updateDetailStats();
    applyVideoFilters();
  }

  function updateDetailStats() {
    const total = currentVideos.length;
    const done = currentVideos.filter(v => v.completed).length;
    const pctNum = total > 0 ? Math.round((done / total) * 100) : 0;
    const remainingSec = currentVideos.filter(v => !v.completed).reduce((s, v) => s + (v.duration || 0), 0);

    document.getElementById('detail-total').textContent = total;
    document.getElementById('detail-completed').textContent = done;
    document.getElementById('detail-progress-text').textContent = pctNum + '%';
    document.getElementById('detail-progress-bar').style.width = pctNum + '%';
    document.getElementById('detail-remaining-time').textContent = YouTubeAPI.formatHoursMinutes(remainingSec);
  }

  function applyVideoFilters() {
    const filter = document.getElementById('video-filter').value;
    const sort = document.getElementById('video-sort').value;
    const search = (document.getElementById('video-search').value || '').trim().toLowerCase();

    filteredVideos = [...currentVideos];

    // Search
    if (search) filteredVideos = filteredVideos.filter(v => (v.title || '').toLowerCase().includes(search));

    // Filter
    if (filter === 'completed') filteredVideos = filteredVideos.filter(v => v.completed);
    else if (filter === 'incomplete') filteredVideos = filteredVideos.filter(v => !v.completed);

    // Sort
    switch (sort) {
      case 'duration-asc': filteredVideos.sort((a, b) => (a.duration || 0) - (b.duration || 0)); break;
      case 'duration-desc': filteredVideos.sort((a, b) => (b.duration || 0) - (a.duration || 0)); break;
      case 'newest': filteredVideos.sort((a, b) => (b.position || 0) - (a.position || 0)); break;
      case 'oldest': filteredVideos.sort((a, b) => (a.position || 0) - (b.position || 0)); break;
    }

    currentPage = 1;
    renderVideosList();
  }

  function renderVideosList() {
    const container = document.getElementById('videos-container');
    const start = (currentPage - 1) * VIDEOS_PER_PAGE;
    const pageVideos = filteredVideos.slice(start, start + VIDEOS_PER_PAGE);

    if (!pageVideos.length) {
      container.innerHTML = DOMPurify.sanitize('<div class="empty-state"><i class="fa-solid fa-video-slash"></i><p>No videos match your filter.</p></div>');
      renderPagination();
      return;
    }

    container.innerHTML = DOMPurify.sanitize(pageVideos.map((v, idx) => {
      const num = start + idx + 1;
      return `
        <div class="video-item ${v.completed ? 'completed' : ''}" data-id="${v.id}" onclick="PlaylistPage.openVideo('${v.id}')">
          <div class="video-number">${v.completed ? '<i class="fa-solid fa-check"></i>' : num}</div>
          ${v.thumbnail ? `<img class="video-thumb" src="${v.thumbnail}" alt="" loading="lazy" />` : ''}
          <div class="video-info">
            <div class="video-title">${v.title || 'Untitled'}</div>
            <div class="video-duration">${v.durationStr || YouTubeAPI.formatDuration(v.duration)}</div>
          </div>
          <div class="video-check">${v.completed ? '<i class="fa-solid fa-check"></i>' : ''}</div>
        </div>
      `;
    }).join(''), { ADD_ATTR: ['onclick'] });

    renderPagination();
  }

  function renderPagination() {
    const totalPages = Math.ceil(filteredVideos.length / VIDEOS_PER_PAGE);
    const container = document.getElementById('videos-pagination');

    if (totalPages <= 1) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    let html = '';

    if (currentPage > 1) {
      html += `<button onclick="PlaylistPage.goToPage(${currentPage - 1})"><i class="fa-solid fa-chevron-left"></i></button>`;
    }

    for (let i = 1; i <= totalPages; i++) {
      if (totalPages > 7 && Math.abs(i - currentPage) > 2 && i !== 1 && i !== totalPages) {
        if (i === currentPage - 3 || i === currentPage + 3) html += '<span style="padding:6px;color:var(--text-muted)">...</span>';
        continue;
      }
      html += `<button class="${i === currentPage ? 'active' : ''}" onclick="PlaylistPage.goToPage(${i})">${i}</button>`;
    }

    if (currentPage < totalPages) {
      html += `<button onclick="PlaylistPage.goToPage(${currentPage + 1})"><i class="fa-solid fa-chevron-right"></i></button>`;
    }

    container.innerHTML = DOMPurify.sanitize(html, { ADD_ATTR: ['onclick'] });
  }

  function goToPage(page) {
    currentPage = page;
    renderVideosList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Open Video ---------- */
  function openVideo(videoDocId) {
    const v = currentVideos.find(vid => vid.id === videoDocId);
    if (!v) return;
    const lastTs = v.lastWatchedAt?.toDate?.()?.getTime() || 0;
    const wasResumed = (v.watchedSeconds || 0) > 0;
    Player.open(currentPlaylist.id, v.id, v.id, v.title, v.notes || '', {
      tag: currentPlaylist?.tag || 'Other',
      wasResumed,
      lastWatchedTs: lastTs,
      initialSeekSeconds: v.watchedSeconds || 0 // RESUME-1: seek to last position
    });
    Player.updateMarkButton(v.completed);
  }

  /* ---------- Back to List ---------- */
  function backToList() {
    document.getElementById('playlist-detail-view').classList.add('hidden');
    document.getElementById('playlists-list-view').classList.remove('hidden');
    currentPlaylist = null;
    currentVideos = [];
    history.replaceState(null, '', '#playlists');
  }

  /* ---------- Add Playlist ---------- */
  function openAddModal() {
    document.getElementById('add-playlist-modal').classList.remove('hidden');
    document.getElementById('btn-add-playlist-fab')?.classList.add('active');
  }
  function closeAddModal() {
    document.getElementById('add-playlist-modal').classList.add('hidden');
    document.getElementById('btn-add-playlist-fab')?.classList.remove('active');
    document.getElementById('add-playlist-form').reset();
    document.getElementById('add-playlist-error').classList.add('hidden');
    document.getElementById('add-playlist-loading').classList.add('hidden');
  }

  function toggleAddModal() {
    const modal = document.getElementById('add-playlist-modal');
    if (modal.classList.contains('hidden')) {
      openAddModal();
    } else {
      closeAddModal();
    }
  }

  async function handleAddPlaylist(e) {
    e.preventDefault();
    const url = document.getElementById('input-playlist-url').value.trim();
    const tag = document.getElementById('input-playlist-tag').value.trim() || 'Other';
    const priority = document.getElementById('input-playlist-priority').value;

    const playlistId = YouTubeAPI.extractPlaylistId(url);
    if (!playlistId) {
      document.getElementById('add-playlist-error').textContent = 'Invalid playlist URL. Make sure it contains a valid playlist ID.';
      document.getElementById('add-playlist-error').classList.remove('hidden');
      return;
    }

    document.getElementById('add-playlist-error').classList.add('hidden');
    document.getElementById('add-playlist-loading').classList.remove('hidden');
    document.getElementById('btn-submit-playlist').disabled = true;

    try {
      const result = await YouTubeAPI.fetchFullPlaylist(playlistId);
      const docId = await FirestoreOps.addPlaylist({
        title: result.title,
        thumbnail: result.thumbnail,
        playlistId: playlistId,
        tag,
        priority,
        totalVideos: result.videos.length,
        completedCount: 0,
        estimatedRemainingTime: YouTubeAPI.formatHoursMinutes(result.totalDuration)
      });
      await FirestoreOps.addVideos(docId, result.videos);

      showToast(`"${result.title}" added successfully!`, 'success');
      closeAddModal();

      // Refresh list
      allPlaylists = await FirestoreOps.getPlaylists();
      populateTagFilter();
      renderPlaylistsList();

      // Check badges (e.g. Curriculum Builder for adding playlists)
      await Gamification.checkAchievements();

      // Refresh dashboard playlists grid if visible
      if (typeof DashboardController !== 'undefined' && DashboardController.refresh) {
        DashboardController.refresh();
      }
    } catch (err) {
      console.error(err);
      document.getElementById('add-playlist-error').textContent = err.message || 'Failed to fetch playlist.';
      document.getElementById('add-playlist-error').classList.remove('hidden');
    } finally {
      document.getElementById('add-playlist-loading').classList.add('hidden');
      document.getElementById('btn-submit-playlist').disabled = false;
    }
  }

  /* ---------- Delete Playlist ---------- */
  async function deletePlaylistFn(playlistId, title) {
    const ok = typeof showConfirm === 'function'
      ? await showConfirm('Delete Playlist', `Delete "${title}"? This cannot be undone.`, 'Delete')
      : confirm(`Delete "${title}"? This cannot be undone.`);
    if (!ok) return;
    try {
      await FirestoreOps.deletePlaylist(playlistId);
      showToast('Playlist deleted', 'success');
      allPlaylists = allPlaylists.filter(p => p.id !== playlistId);
      renderPlaylistsList();
    } catch (err) {
      console.error(err);
      showToast('Failed to delete playlist', 'error');
    }
  }

  /* ---------- Refresh (called by Player after mark complete) ---------- */
  async function refreshCurrentView() {
    if (currentPlaylist) {
      currentVideos = await FirestoreOps.getVideos(currentPlaylist.id);
      const done = currentVideos.filter(v => v.completed).length;
      await FirestoreOps.updatePlaylist(currentPlaylist.id, {
        completedCount: done,
        estimatedRemainingTime: YouTubeAPI.formatHoursMinutes(
          currentVideos.filter(v => !v.completed).reduce((s, v) => s + (v.duration || 0), 0)
        )
      });
      updateDetailStats();
      applyVideoFilters();
    }
  }

  /* ---------- Helpers ---------- */
  // getTagClass() is now a shared utility defined in config.js

  function populateTagFilter() {
    const select = document.getElementById('filter-tag');
    if (!select) return;
    const tags = new Set();
    allPlaylists.forEach(p => { if (p.tag) tags.add(p.tag); });
    // Keep first option (All Tags), replace rest
    select.innerHTML = '<option value="">All Tags</option>';
    [...tags].sort().forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      select.appendChild(opt);
    });
  }

  function initTagInput() {
    const input = document.getElementById('input-playlist-tag');
    const suggestionsEl = document.getElementById('tag-suggestions');
    if (!input || !suggestionsEl) return;

    function getExistingTags() {
      const tags = new Set();
      allPlaylists.forEach(p => { if (p.tag) tags.add(p.tag); });
      return [...tags].sort();
    }

    input.addEventListener('focus', () => showSuggestions());
    input.addEventListener('input', () => showSuggestions());

    function showSuggestions() {
      const val = input.value.trim().toLowerCase();
      const existing = getExistingTags();
      let filtered = existing.filter(t => t.toLowerCase().includes(val) || !val);

      if (!filtered.length && !val) {
        suggestionsEl.classList.add('hidden');
        return;
      }

      let html = filtered.map(t =>
        `<div class="tag-suggestion-item" data-tag="${t}"><i class="fa-solid fa-tag"></i> ${t}</div>`
      ).join('');

      if (val && !filtered.some(t => t.toLowerCase() === val)) {
        html += `<div class="tag-suggestion-item tag-suggestion-create" data-tag="${input.value.trim()}"><i class="fa-solid fa-plus"></i> Create "${input.value.trim()}"</div>`;
      }

      if (!html) { suggestionsEl.classList.add('hidden'); return; }

      suggestionsEl.innerHTML = DOMPurify.sanitize(html, { ADD_ATTR: ['onclick'] });
      suggestionsEl.classList.remove('hidden');

      suggestionsEl.querySelectorAll('.tag-suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          input.value = item.dataset.tag;
          suggestionsEl.classList.add('hidden');
        });
      });
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.tag-input-wrapper')) {
        suggestionsEl.classList.add('hidden');
      }
    });
  }

  /* ============================================
     FN-1: Edit Playlist (tag & priority)
     ============================================ */
  function editPlaylist(playlistId) {
    const pl = allPlaylists.find(p => p.id === playlistId);
    if (!pl) return;
    document.getElementById('edit-playlist-id').value = playlistId;
    document.getElementById('edit-playlist-tag').value = pl.tag || '';
    document.getElementById('edit-playlist-priority').value = pl.priority || 'Medium';
    document.getElementById('edit-playlist-modal').classList.remove('hidden');
  }

  function initEditPlaylistModal() {
    const form = document.getElementById('edit-playlist-form');
    const overlay = document.getElementById('edit-playlist-overlay');
    const closeBtn = document.getElementById('btn-close-edit-playlist');
    const closeModal = () => document.getElementById('edit-playlist-modal').classList.add('hidden');
    if (overlay) overlay.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-playlist-id').value;
        const tag = document.getElementById('edit-playlist-tag').value.trim() || 'Other';
        const priority = document.getElementById('edit-playlist-priority').value;
        try {
          await FirestoreOps.updatePlaylist(id, { tag, priority });
          const pl = allPlaylists.find(p => p.id === id);
          if (pl) { pl.tag = tag; pl.priority = priority; }
          closeModal();
          renderPlaylistsList();
          populateTagFilter();
          showToast('Playlist updated!', 'success');
        } catch (err) {
          console.error('Edit playlist error:', err);
          showToast('Failed to update playlist', 'error');
        }
      });
    }
  }

  /* ============================================
     FN-2: Re-sync Playlist from YouTube
     ============================================ */
  async function syncPlaylist(playlistId) {
    const pl = allPlaylists.find(p => p.id === playlistId) || currentPlaylist;
    if (!pl || !pl.playlistId) { showToast('No YouTube playlist ID found', 'error'); return; }
    showToast('Syncing with YouTube...', 'info');
    try {
      const result = await YouTubeAPI.fetchFullPlaylist(pl.playlistId);
      const existingVideos = await FirestoreOps.getVideos(playlistId);
      const existingIds = new Set(existingVideos.map(v => v.id));
      const newVideos = result.videos.filter(v => !existingIds.has(v.videoId));
      if (newVideos.length === 0) {
        showToast('Playlist is already up to date!', 'info');
        return;
      }
      // Add new videos starting after existing positions
      const maxPos = existingVideos.reduce((m, v) => Math.max(m, v.position || 0), 0);
      newVideos.forEach((v, i) => { v.position = maxPos + i + 1; });
      await FirestoreOps.addVideos(playlistId, newVideos);
      await FirestoreOps.updatePlaylist(playlistId, {
        totalVideos: existingVideos.length + newVideos.length,
        estimatedRemainingTime: YouTubeAPI.formatHoursMinutes(
          [...existingVideos, ...newVideos.map(v => ({ completed: false, duration: v.duration || 0 }))]
            .filter(v => !v.completed).reduce((s, v) => s + (v.duration || 0), 0)
        )
      });
      showToast(`Added ${newVideos.length} new video(s)!`, 'success');
      // Refresh
      currentVideos = await FirestoreOps.getVideos(playlistId);
      updateDetailStats();
      applyVideoFilters();
      allPlaylists = await FirestoreOps.getPlaylists();
    } catch (err) {
      console.error('Sync error:', err);
      showToast('Sync failed: ' + (err.message || 'Unknown error'), 'error');
    }
  }

  /* ============================================
     FN-3: Bulk Mark Complete / Incomplete
     ============================================ */
  async function bulkMarkComplete(completed) {
    if (!currentPlaylist || !currentVideos.length) return;
    const label = completed ? 'complete' : 'incomplete';
    const ok = typeof showConfirm === 'function'
      ? await showConfirm('Bulk Update', `Mark all ${currentVideos.length} videos as ${label}?`, completed ? 'Mark All Done' : 'Reset All')
      : confirm(`Mark all ${currentVideos.length} videos as ${label}?`);
    if (!ok) return;
    showToast(`Marking all videos as ${label}...`, 'info');
    try {
      for (const v of currentVideos) {
        await FirestoreOps.updateVideo(currentPlaylist.id, v.id, { completed });
      }
      const doneCount = completed ? currentVideos.length : 0;
      await FirestoreOps.updatePlaylist(currentPlaylist.id, {
        completedCount: doneCount,
        estimatedRemainingTime: YouTubeAPI.formatHoursMinutes(
          completed ? 0 : currentVideos.reduce((s, v) => s + (v.duration || 0), 0)
        )
      });
      currentVideos = await FirestoreOps.getVideos(currentPlaylist.id);
      updateDetailStats();
      applyVideoFilters();
      showToast(`All videos marked as ${label}!`, 'success');
    } catch (err) {
      console.error('Bulk mark error:', err);
      showToast('Bulk update failed', 'error');
    }
  }

  /* ============================================
     FN-4: JSON Data Export
     ============================================ */
  async function exportDataJSON() {
    showToast('Preparing export...', 'info');
    try {
      const userData = await FirestoreOps.getUserData();
      const playlists = await FirestoreOps.getPlaylists();
      const achievements = await FirestoreOps.getAchievements();
      const skills = await FirestoreOps.getSkillProgress();
      const exportData = {
        exportedAt: new Date().toISOString(),
        user: userData,
        playlists: [],
        achievements,
        skills
      };
      for (const pl of playlists) {
        const videos = await FirestoreOps.getVideos(pl.id);
        exportData.playlists.push({ ...pl, videos });
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `playpulse_export_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Data exported successfully!', 'success');
    } catch (err) {
      console.error('Export error:', err);
      showToast('Export failed', 'error');
    }
  }

  return {
    init,
    openPlaylistDetail,
    openFromResume,
    openVideo,
    goToPage,
    deletePlaylist: deletePlaylistFn,
    editPlaylist,
    syncPlaylist,
    bulkMarkComplete,
    exportDataJSON,
    refreshCurrentView,
    _getVideos: () => currentVideos,
    initEditPlaylistModal
  };
})();
