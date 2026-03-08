/* ============================================
   Video Player Module (YouTube IFrame API)
   ============================================ */

const Player = (() => {
  let ytPlayer = null;
  let currentVideoId = null;
  let currentPlaylistId = null;
  let currentVideoDocId = null;
  let currentPlaylistTag = null;
  let watchTimer = null;
  let watchedSeconds = 0;
  let lastSaveTime = null; // Timestamp of last save for accurate elapsed tracking
  let wasResumed = false;
  let resumeLastTs = 0;
  let initialSeekSeconds = 0; // RESUME-1: Seek position on player ready

  window.onYouTubeIframeAPIReady = () => {
    // console.log('YouTube IFrame API ready');
  };

  function open(playlistId, videoDocId, videoId, title, notes, opts = {}) {
    currentPlaylistId = playlistId;
    currentVideoDocId = videoDocId;
    currentVideoId = videoId;
    currentPlaylistTag = opts.tag || null;
    wasResumed = opts.wasResumed || false;
    resumeLastTs = opts.lastWatchedTs || 0;
    initialSeekSeconds = opts.initialSeekSeconds || 0; // RESUME-1

    document.getElementById('player-video-title').textContent = title;
    document.getElementById('player-modal').classList.remove('hidden');

    const notesEditor = document.getElementById('notes-editor');
    if (notesEditor) notesEditor.innerHTML = DOMPurify.sanitize(notes || '');
    Notes.setContext(playlistId, videoDocId);

    const container = document.getElementById('youtube-player-container');
    container.innerHTML = '';

    ytPlayer = new YT.Player(container, {
      width: '100%',
      height: '100%',
      videoId: videoId,
      playerVars: {
        autoplay: 1,
        modestbranding: 1,
        rel: 0,
        origin: window.location.origin
      },
      host: 'https://www.youtube-nocookie.com',
      events: {
        onStateChange: onPlayerStateChange,
        onReady: onPlayerReady
      }
    });

    FirestoreOps.updateVideo(playlistId, videoDocId, {
      lastWatchedAt: new Date()
    });

    // Immediately save a small watchedSeconds so Resume can find this video
    FirestoreOps.updateVideo(playlistId, videoDocId, {
      watchedSeconds: firebase.firestore.FieldValue.increment(1)
    });

    localStorage.setItem('playpulse_resume', JSON.stringify({
      playlistId, videoDocId, videoId, title, tag: currentPlaylistTag,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
    }));

    // Award resume bonus if applicable
    if (wasResumed && resumeLastTs) {
      Gamification.awardResumeBonus(resumeLastTs);
    }
  }

  function onPlayerReady() {
    // Restore saved playback speed
    const savedSpeed = localStorage.getItem('playpulse_speed');
    const speed = savedSpeed ? parseFloat(savedSpeed) : 1;
    if (ytPlayer && ytPlayer.setPlaybackRate) ytPlayer.setPlaybackRate(speed);
    const speedSelect = document.getElementById('playback-speed-select');
    if (speedSelect) speedSelect.value = String(speed);

    // RESUME-1: Seek to last watched position
    if (initialSeekSeconds > 0 && ytPlayer && ytPlayer.seekTo) {
      ytPlayer.seekTo(initialSeekSeconds, true);
    }

    startWatchTimer();
    if (typeof Pomodoro !== 'undefined' && Pomodoro.isAutoStart && Pomodoro.isAutoStart() && !Pomodoro.isRunning()) {
      Pomodoro.start();
    }
  }

  function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
      startWatchTimer();
    } else if (event.data === YT.PlayerState.PAUSED) {
      stopWatchTimer();
    } else if (event.data === YT.PlayerState.ENDED) {
      stopWatchTimer();
      markCurrentCompleted();
      // Auto-advance to next video if autoplay is enabled
      const autoplayToggle = document.getElementById('toggle-autoplay');
      if (autoplayToggle && autoplayToggle.checked) {
        setTimeout(() => navigateVideo(1), 3000);
      }
    }
  }

  function startWatchTimer() {
    stopWatchTimer(false); // Don't do partial save when restarting
    lastSaveTime = Date.now();
    watchTimer = setInterval(() => {
      watchedSeconds++;
      if (watchedSeconds % 60 === 0) saveWatchProgress();
    }, 1000);
  }

  function stopWatchTimer(doPartialSave = true) {
    if (watchTimer) {
      clearInterval(watchTimer);
      watchTimer = null;
      if (doPartialSave) savePartialProgress();
    }
  }

  async function saveWatchProgress() {
    if (!currentPlaylistId || !currentVideoDocId || !lastSaveTime) return;
    const now = Date.now();
    const elapsedSec = Math.round((now - lastSaveTime) / 1000);
    lastSaveTime = now;
    if (elapsedSec <= 0) return;
    await FirestoreOps.updateVideo(currentPlaylistId, currentVideoDocId, {
      watchedSeconds: firebase.firestore.FieldValue.increment(elapsedSec)
    });
    const log = await FirestoreOps.getTodayLog();
    await FirestoreOps.updateTodayLog({
      date: FirestoreOps.todayStr(),
      minutesStudied: (log.minutesStudied || 0) + (elapsedSec / 60)
    });
  }

  /** Save partial progress on pause/stop with actual elapsed seconds since last save */
  async function savePartialProgress() {
    if (!currentPlaylistId || !currentVideoDocId || !lastSaveTime) return;
    const now = Date.now();
    const elapsedSec = Math.round((now - lastSaveTime) / 1000);
    lastSaveTime = now;
    if (elapsedSec <= 0) return;
    await FirestoreOps.updateVideo(currentPlaylistId, currentVideoDocId, {
      watchedSeconds: firebase.firestore.FieldValue.increment(elapsedSec)
    });
    const log = await FirestoreOps.getTodayLog();
    await FirestoreOps.updateTodayLog({
      date: FirestoreOps.todayStr(),
      minutesStudied: (log.minutesStudied || 0) + (elapsedSec / 60)
    });
  }

  async function markCurrentCompleted() {
    if (!currentPlaylistId || !currentVideoDocId) return;

    await FirestoreOps.updateVideo(currentPlaylistId, currentVideoDocId, { completed: true });

    const videos = await FirestoreOps.getVideos(currentPlaylistId);
    const completedCount = videos.filter(v => v.completed).length;
    const totalVideos = videos.length;
    const remainingDuration = videos.filter(v => !v.completed).reduce((s, v) => s + (v.duration || 0), 0);

    await FirestoreOps.updatePlaylist(currentPlaylistId, {
      completedCount,
      estimatedRemainingTime: YouTubeAPI.formatHoursMinutes(remainingDuration)
    });

    const log = await FirestoreOps.getTodayLog();
    await FirestoreOps.updateTodayLog({
      date: FirestoreOps.todayStr(),
      videosCompleted: (log.videosCompleted || 0) + 1
    });

    // Award XP with momentum/tag info
    await Gamification.awardVideoComplete({ wasResumed, tag: currentPlaylistTag });

    // Update combo
    await Gamification.updateCombo();

    if (completedCount >= totalVideos) {
      await Gamification.awardPlaylistComplete();
      // Write completedAt timestamp
      await FirestoreOps.updatePlaylist(currentPlaylistId, {
        completedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    await FirestoreOps.checkAndUpdateStreak();
    await Gamification.checkAchievements();

    showToast('Video marked as completed!', 'success');
    updateMarkButton(true);

    // Clear resume only if this video was the resume target (RESUME-3)
    const savedResume = JSON.parse(localStorage.getItem('playpulse_resume') || 'null');
    if (savedResume && savedResume.videoDocId === currentVideoDocId) {
      localStorage.removeItem('playpulse_resume');
    }

    if (typeof PlaylistPage !== 'undefined' && PlaylistPage.refreshCurrentView) {
      PlaylistPage.refreshCurrentView();
    }
  }

  function updateMarkButton(completed) {
    const btn = document.getElementById('btn-mark-completed');
    if (!btn) return;
    if (completed) {
      btn.innerHTML = DOMPurify.sanitize('<i class="fa-solid fa-check-double"></i> Completed');
      btn.style.opacity = '0.6';
      btn.disabled = true;
    } else {
      btn.innerHTML = DOMPurify.sanitize('<i class="fa-solid fa-check"></i> Mark Completed');
      btn.style.opacity = '1';
      btn.disabled = false;
    }
  }

  function close() {
    stopWatchTimer();
    if (ytPlayer && ytPlayer.destroy) ytPlayer.destroy();
    ytPlayer = null;
    currentVideoId = null;
    currentPlaylistId = null;
    currentVideoDocId = null;
    currentPlaylistTag = null;
    watchedSeconds = 0;
    lastSaveTime = null;
    wasResumed = false;
    resumeLastTs = 0;
    initialSeekSeconds = 0;
    document.getElementById('player-modal').classList.add('hidden');
    document.getElementById('youtube-player-container').innerHTML = '';
  }

  /** Show YouTube-style half-circle ripple skip animation */
  function showSkipAnimation(seconds, direction) {
    const wrapper = document.querySelector('.player-wrapper');
    if (!wrapper) return;
    // Remove any existing skip overlays
    wrapper.querySelectorAll('.skip-animation-overlay').forEach(el => el.remove());
    const overlay = document.createElement('div');
    const icon = direction === 'forward' ? 'fa-forward' : 'fa-backward';
    overlay.className = `skip-animation-overlay skip-${direction}`;
    overlay.innerHTML = DOMPurify.sanitize(`<div class="skip-ripple"></div><div class="skip-label"><i class="fa-solid ${icon}"></i><span>${seconds}s</span></div>`);
    wrapper.appendChild(overlay);
    setTimeout(() => overlay.remove(), 500);
  }

  function initEvents() {
    const closeBtn = document.getElementById('btn-close-player');
    const overlay = document.querySelector('#player-modal .modal-overlay');
    const markBtn = document.getElementById('btn-mark-completed');
    const prevBtn = document.getElementById('btn-player-prev');
    const nextBtn = document.getElementById('btn-player-next');
    const fullscreenBtn = document.getElementById('btn-fullscreen-toggle');
    const insertTimestampBtn = document.getElementById('btn-insert-timestamp');
    const notesEditor = document.getElementById('notes-editor');
    if (!closeBtn) return;
    closeBtn.addEventListener('click', close);
    if (overlay) overlay.addEventListener('click', close);
    if (markBtn) markBtn.addEventListener('click', markCurrentCompleted);

    // Prev/Next buttons (UX-18)
    if (prevBtn) prevBtn.addEventListener('click', () => navigateVideo(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => navigateVideo(1));

    // Expand notes toggle
    const expandNotesBtn = document.getElementById('btn-expand-notes');
    if (expandNotesBtn) {
      expandNotesBtn.addEventListener('click', () => {
        const editor = document.getElementById('notes-editor');
        if (editor) {
          editor.classList.toggle('expanded');
          const isExpanded = editor.classList.contains('expanded');
          expandNotesBtn.innerHTML = DOMPurify.sanitize(isExpanded
            ? '<i class="fa-solid fa-compress"></i>'
            : '<i class="fa-solid fa-expand"></i>');
          expandNotesBtn.title = isExpanded ? 'Collapse notes' : 'Expand notes';
        }
      });
    }

    // Playback speed control
    const speedSelect = document.getElementById('playback-speed-select');
    if (speedSelect) {
      speedSelect.addEventListener('change', () => {
        const rate = parseFloat(speedSelect.value);
        if (ytPlayer && ytPlayer.setPlaybackRate) ytPlayer.setPlaybackRate(rate);
        localStorage.setItem('playpulse_speed', String(rate));
      });
    }

    // Fullscreen Toggle
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        const modalContent = document.querySelector('.player-modal-content');
        if (!document.fullscreenElement) {
          if (modalContent.requestFullscreen) {
            modalContent.requestFullscreen();
          } else if (modalContent.webkitRequestFullscreen) { /* Safari */
            modalContent.webkitRequestFullscreen();
          } else if (modalContent.msRequestFullscreen) { /* IE11 */
            modalContent.msRequestFullscreen();
          }
          fullscreenBtn.innerHTML = DOMPurify.sanitize('<i class="fa-solid fa-compress"></i>');
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          }
          fullscreenBtn.innerHTML = DOMPurify.sanitize('<i class="fa-solid fa-expand"></i>');
        }
      });
      // Handle ESC key or native exit
      document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && fullscreenBtn) {
          fullscreenBtn.innerHTML = DOMPurify.sanitize('<i class="fa-solid fa-expand"></i>');
        }
      });
    }

    // Insert Timestamp Button
    if (insertTimestampBtn) {
      insertTimestampBtn.addEventListener('click', () => {
        if (!ytPlayer || !ytPlayer.getCurrentTime) return;
        const timeSec = Math.floor(ytPlayer.getCurrentTime());
        const mins = Math.floor(timeSec / 60);
        const secs = timeSec % 60;
        const timeStr = `[${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}]`;
        
        const timestampHtml = `<span class="note-timestamp" contenteditable="false" data-time="${timeSec}">${timeStr}</span>&nbsp;`;
        if (notesEditor) {
          notesEditor.focus();
          document.execCommand('insertHTML', false, timestampHtml);
          // Manually trigger input event to force autosave
          notesEditor.dispatchEvent(new Event('input'));
        }
      });
    }

    // Timestamp Click Listener in Editor
    if (notesEditor) {
      notesEditor.addEventListener('click', (e) => {
        const timestampEl = e.target.closest('.note-timestamp');
        if (timestampEl) {
          e.preventDefault();
          const time = parseInt(timestampEl.getAttribute('data-time'), 10);
          if (!isNaN(time) && ytPlayer && ytPlayer.seekTo) {
            ytPlayer.seekTo(time, true);
          }
        }
      });
    }

    // UI-7: Player keyboard shortcuts (Space/K, J, L, M, Left/Right arrows)
    document.addEventListener('keydown', (e) => {
      const playerModal = document.getElementById('player-modal');
      if (!playerModal || playerModal.classList.contains('hidden')) return;
      // Don't hijack when user is typing in notes/input
      if (e.target.closest('[contenteditable], input, textarea, select')) return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          if (ytPlayer && ytPlayer.getPlayerState) {
            const state = ytPlayer.getPlayerState();
            if (state === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
            else ytPlayer.playVideo();
          }
          break;
        case 'j':
        case 'J':
          e.preventDefault();
          if (ytPlayer && ytPlayer.getCurrentTime) {
            ytPlayer.seekTo(Math.max(0, ytPlayer.getCurrentTime() - 10), true);
            showSkipAnimation(10, 'backward');
          }
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          if (ytPlayer && ytPlayer.getCurrentTime) {
            ytPlayer.seekTo(ytPlayer.getCurrentTime() + 10, true);
            showSkipAnimation(10, 'forward');
          }
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          if (ytPlayer && ytPlayer.isMuted) {
            if (ytPlayer.isMuted()) ytPlayer.unMute();
            else ytPlayer.mute();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (ytPlayer && ytPlayer.getCurrentTime) {
            ytPlayer.seekTo(Math.max(0, ytPlayer.getCurrentTime() - 5), true);
            showSkipAnimation(5, 'backward');
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (ytPlayer && ytPlayer.getCurrentTime) {
            ytPlayer.seekTo(ytPlayer.getCurrentTime() + 5, true);
            showSkipAnimation(5, 'forward');
          }
          break;
      }
    });
  }

  /* ---------- Navigate to Prev/Next Video (UX-18) ---------- */
  function navigateVideo(direction) {
    if (!currentPlaylistId || !currentVideoDocId) return;
    if (typeof PlaylistPage === 'undefined') return;

    // Get the current video list from PlaylistPage
    const videos = PlaylistPage._getVideos ? PlaylistPage._getVideos() : [];
    if (!videos.length) return;

    const currentIndex = videos.findIndex(v => v.id === currentVideoDocId);
    if (currentIndex === -1) return;

    const newIndex = currentIndex + direction;
    if (newIndex < 0 || newIndex >= videos.length) {
      showToast(direction < 0 ? 'Already at first video' : 'Already at last video', 'info');
      return;
    }

    const nextVid = videos[newIndex];
    // BUG-5: Currently Firestore doc IDs equal YouTube video IDs (set in addVideos).
    // If this assumption changes, use a separate field like nextVid.videoId for the YouTube ID.
    stopWatchTimer();
    if (ytPlayer && ytPlayer.destroy) ytPlayer.destroy();
    ytPlayer = null;
    watchedSeconds = 0;

    const lastTs = nextVid.lastWatchedAt?.toDate?.()?.getTime() || 0;
    open(currentPlaylistId, nextVid.id, nextVid.id, nextVid.title, nextVid.notes || '', {
      tag: currentPlaylistTag,
      wasResumed: false,
      lastWatchedTs: lastTs
    });
    updateMarkButton(nextVid.completed);
  }

  return { open, close, initEvents, updateMarkButton };
})();
