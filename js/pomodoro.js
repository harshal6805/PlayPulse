/* ============================================
   Pomodoro Timer Module
   ============================================ */

const Pomodoro = (() => {
  let focusMin = 25;
  let breakMin = 5;
  let autoStartWithVideo = false;
  let mutedSound = false;
  let isBreak = false;
  let running = false;
  let paused = false;
  let totalSeconds = 0;
  let remainingSeconds = 0;
  let timerInterval = null;
  let sessionsCompleted = 0;
  const SESSIONS_PER_CYCLE = 4;
  const LONG_BREAK_MIN = 15;

  const CIRCUMFERENCE = 2 * Math.PI * 54; // ring radius = 54

  function init() {
    loadSettings();
    updateDisplay();
    updateSessionCount();
    bindEvents();
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function bindEvents() {
    document.getElementById('btn-pomodoro-open').addEventListener('click', toggle);
    document.getElementById('btn-pomodoro-minimize').addEventListener('click', minimize);
    document.getElementById('btn-pomodoro-close').addEventListener('click', () => {
      document.getElementById('pomodoro-widget').classList.add('hidden');
    });
    document.getElementById('btn-pomodoro-start').addEventListener('click', start);
    document.getElementById('btn-pomodoro-pause').addEventListener('click', pause);
    document.getElementById('btn-pomodoro-reset').addEventListener('click', reset);
    document.getElementById('btn-pomodoro-settings').addEventListener('click', toggleSettings);
    document.getElementById('btn-pomo-save-settings').addEventListener('click', saveSettings);
  }

  function toggle() {
    const widget = document.getElementById('pomodoro-widget');
    widget.classList.toggle('hidden');
  }

  function minimize() {
    const body = document.getElementById('pomodoro-body');
    body.classList.toggle('minimized');
    const icon = document.querySelector('#btn-pomodoro-minimize i');
    icon.className = body.classList.contains('minimized') ? 'fa-solid fa-expand' : 'fa-solid fa-minus';
  }

  function toggleSettings() {
    document.getElementById('pomodoro-settings-panel').classList.toggle('hidden');
  }

  function loadSettings() {
    const saved = localStorage.getItem('playpulse_pomodoro');
    if (saved) {
      const s = JSON.parse(saved);
      focusMin = s.focusMin || 25;
      breakMin = s.breakMin || 5;
      autoStartWithVideo = s.autoStart || false;
      mutedSound = s.mutedSound || false;
    }
    document.getElementById('pomo-focus-min').value = focusMin;
    document.getElementById('pomo-break-min').value = breakMin;
    document.getElementById('pomo-auto-start').checked = autoStartWithVideo;
    const muteEl = document.getElementById('pomo-mute-sound');
    if (muteEl) muteEl.checked = mutedSound;
  }

  function saveSettings() {
    focusMin = parseInt(document.getElementById('pomo-focus-min').value) || 25;
    breakMin = parseInt(document.getElementById('pomo-break-min').value) || 5;
    autoStartWithVideo = document.getElementById('pomo-auto-start').checked;
    const muteEl = document.getElementById('pomo-mute-sound');
    if (muteEl) mutedSound = muteEl.checked;
    localStorage.setItem('playpulse_pomodoro', JSON.stringify({ focusMin, breakMin, autoStart: autoStartWithVideo, mutedSound }));
    toggleSettings();
    if (!running) reset();
    showToast('Timer settings saved!', 'success');
  }

  function start() {
    if (!running || paused) {
      if (!running) {
        totalSeconds = (isBreak ? breakMin : focusMin) * 60;
        remainingSeconds = totalSeconds;
      }
      running = true;
      paused = false;
      document.getElementById('btn-pomodoro-start').classList.add('hidden');
      document.getElementById('btn-pomodoro-pause').classList.remove('hidden');

      timerInterval = setInterval(tick, 1000);
    }
  }

  function pause() {
    paused = true;
    clearInterval(timerInterval);
    document.getElementById('btn-pomodoro-start').classList.remove('hidden');
    document.getElementById('btn-pomodoro-pause').classList.add('hidden');
    document.getElementById('btn-pomodoro-start').innerHTML = '<i class="fa-solid fa-play"></i> Resume';
  }

  function reset() {
    running = false;
    paused = false;
    isBreak = false;
    sessionsCompleted = 0;
    clearInterval(timerInterval);
    totalSeconds = focusMin * 60;
    remainingSeconds = totalSeconds;
    updateDisplay();
    updateSessionCount();
    document.getElementById('btn-pomodoro-start').classList.remove('hidden');
    document.getElementById('btn-pomodoro-pause').classList.add('hidden');
    document.getElementById('btn-pomodoro-start').innerHTML = '<i class="fa-solid fa-play"></i> Start';
    document.getElementById('pomodoro-mode').textContent = 'Focus';
  }

  function tick() {
    remainingSeconds--;
    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      running = false;
      onTimerEnd();
    }
    updateDisplay();
  }

  function onTimerEnd() {
    // Play beep sound
    if (!mutedSound) playBeep();

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      const body = isBreak ? 'Break over! Time to focus.' : 'Session done! Take a break.';
      new Notification('Pomodoro', { body, icon: 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 48 48%27%3E%3Crect width=%2748%27 height=%2748%27 rx=%2712%27 fill=%27%232563eb%27/%3E%3Cpolygon points=%2719,14 19,34 35,24%27 fill=%27white%27/%3E%3C/svg%3E' });
    }

    if (isBreak) {
      showToast('Break over! Time to focus.', 'info');
      isBreak = false;
      document.getElementById('pomodoro-mode').textContent = 'Focus';
    } else {
      sessionsCompleted++;
      // Persist session count to Firestore for badge tracking + daily log for FN-6 chart
      FirestoreOps.updateUser({ totalPomodoroSessions: firebase.firestore.FieldValue.increment(1) }).catch(e => console.warn('Pomo session save error:', e));
      FirestoreOps.updateTodayLog({ pomodoroSessions: firebase.firestore.FieldValue.increment(1) }).catch(e => console.warn('Pomo daily log error:', e));
      // Check badges (Focus Trainee, Focus Beast)
      Gamification.checkAchievements().catch(e => console.warn('Badge check error:', e));
      const isLongBreak = sessionsCompleted % SESSIONS_PER_CYCLE === 0;
      if (isLongBreak) {
        showToast('Great work! Time for a long break.', 'success');
      } else {
        showToast('Focus session done! Take a short break.', 'success');
      }
      isBreak = true;
      document.getElementById('pomodoro-mode').textContent = isLongBreak ? 'Long Break' : 'Break';
    }
    const breakDuration = isBreak
      ? (sessionsCompleted % SESSIONS_PER_CYCLE === 0 ? LONG_BREAK_MIN : breakMin)
      : focusMin;
    totalSeconds = (isBreak ? breakDuration : focusMin) * 60;
    remainingSeconds = totalSeconds;
    updateDisplay();
    updateSessionCount();
    document.getElementById('btn-pomodoro-start').classList.remove('hidden');
    document.getElementById('btn-pomodoro-pause').classList.add('hidden');
    document.getElementById('btn-pomodoro-start').innerHTML = '<i class="fa-solid fa-play"></i> Start';
    // Change ring color for break mode
    const ringEl = document.getElementById('pomodoro-ring-progress');
    if (ringEl) {
      ringEl.style.stroke = isBreak ? 'var(--success)' : 'var(--accent)';
    }
  }

  function updateSessionCount() {
    const el = document.getElementById('pomodoro-session-count');
    if (el) {
      const current = (sessionsCompleted % SESSIONS_PER_CYCLE) + (isBreak ? 0 : 1);
      el.textContent = `Session ${current} of ${SESSIONS_PER_CYCLE}`;
    }
  }

  function updateDisplay() {
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    document.getElementById('pomodoro-time').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    // Update ring
    const progress = totalSeconds > 0 ? (totalSeconds - remainingSeconds) / totalSeconds : 0;
    const offset = CIRCUMFERENCE * (1 - progress);
    document.getElementById('pomodoro-ring-progress').style.strokeDashoffset = offset;
  }

  function isAutoStart() { return autoStartWithVideo; }
  function isRunning() { return running && !paused; }

  function playBeep(freq = 880, duration = 0.3) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Beep failed:', e);
    }
  }

  return { init, start, pause, reset, isAutoStart, isRunning };
})();
