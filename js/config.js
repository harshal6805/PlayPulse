/* ============================================
   Firebase Configuration
   ============================================ */

// IMPORTANT: Replace with your own Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyDFzSjkCkjq3OwH0xssyj9XR7q0bDYOxaI",
  authDomain: "yt-study-os.firebaseapp.com",
  projectId: "yt-study-os",
  storageBucket: "yt-study-os.firebasestorage.app",
  messagingSenderId: "27804587974",
  appId: "1:27804587974:web:eab33e16ec298faaaec4c7"
};

// YouTube Data API Key
// SECURITY: Restrict this key by HTTP referrer in the Google Cloud Console
// to prevent unauthorized usage. Navigate to:
// GCP Console → APIs & Services → Credentials → Edit API Key → Application Restrictions → HTTP referrers
// Add your production domain(s) and localhost for development.
// TODO: Consider moving to an environment variable loaded at build time if a build step is introduced.
const YOUTUBE_API_KEY = "AIzaSyC-l7Rd1FXHJLOuyUv55iVpDtJFiunj8-M";

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Enable Firestore offline persistence
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore persistence failed: multiple tabs open.');
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore persistence not supported in this browser.');
  }
});

// XP & Level constants
const XP_PER_VIDEO = 10;
const XP_PER_HOUR = 20;
const XP_PER_PLAYLIST = 100;
const XP_BASE = 100;       // XP needed for level 2
const XP_MULTIPLIER = 1.5; // Each level needs 1.5x more XP

// Momentum & Combo constants
const MOMENTUM_MULTIPLIER = 1.5;   // XP multiplier for resumed sessions
const RESUME_24H_BONUS = 5;        // Resume within 24h
const RESUME_SAME_DAY_BONUS = 10;  // Resume same day
const FINISH_RESUMED_BONUS = 15;   // Finish a resumed video
const COMBO_THRESHOLDS = [
  { days: 3, multiplier: 2 },
  { days: 7, multiplier: 3 }
];
const STREAK_RECOVERY_COOLDOWN_DAYS = 30;

function xpForLevel(level) {
  return Math.floor(XP_BASE * Math.pow(XP_MULTIPLIER, level - 1));
}

function getLevelFromXP(totalXP) {
  let level = 1;
  let remaining = totalXP;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, currentXP: remaining, nextLevelXP: xpForLevel(level) };
}

// Badge definitions
const BADGE_DEFS = [
  { id: 'first_video',       name: 'First Video Completed',    icon: 'fa-solid fa-play',               check: s => s.totalVideos >= 1 },
  { id: 'first_playlist',    name: 'First Playlist Completed', icon: 'fa-solid fa-list-check',         check: s => s.totalPlaylistsCompleted >= 1 },
  { id: 'streak_7',          name: '7 Day Streak',             icon: 'fa-solid fa-fire',               check: s => s.longestStreak >= 7 },
  { id: 'streak_30',         name: '30 Day Streak',            icon: 'fa-solid fa-fire-flame-curved',  check: s => s.longestStreak >= 30 },
  { id: 'videos_100',        name: '100 Videos Completed',     icon: 'fa-solid fa-trophy',             check: s => s.totalVideos >= 100 },
  { id: 'hours_50',          name: '50 Hours Watched',         icon: 'fa-solid fa-clock',              check: s => s.totalHours >= 50 },
  { id: 'focus_beast',       name: 'Focus Beast',              icon: 'fa-solid fa-bolt',               check: s => (s.totalPomodoroSessions || 0) >= 25, desc: 'Complete 25 focus sessions' },
  { id: 'completion_master', name: 'Completion Master',        icon: 'fa-solid fa-check-double',       check: s => (s.totalPlaylistsCompleted || 0) >= 5, desc: 'Complete 5 playlists' },
  { id: 'discipline_king',   name: 'Discipline King',          icon: 'fa-solid fa-crown',              check: s => (s.longestStreak || 0) >= 60, desc: '60 day streak' },
  { id: 'momentum_legend',   name: 'Momentum Legend',          icon: 'fa-solid fa-rocket',             check: s => (s.comboStreak || 0) >= 7, desc: '7+ combo streak' },
  // Expanded badges
  { id: 'getting_started',    name: 'Getting Started',           icon: 'fa-solid fa-seedling',           check: s => s.totalVideos >= 10, desc: 'Complete 10 videos' },
  { id: 'half_century',       name: 'Half Century',              icon: 'fa-solid fa-medal',              check: s => s.totalVideos >= 50, desc: 'Complete 50 videos' },
  { id: 'curriculum_builder', name: 'Curriculum Builder',         icon: 'fa-solid fa-sitemap',            check: s => (s.totalPlaylists || 0) >= 3, desc: 'Add 3 playlists' },
  { id: 'dedicated_learner',  name: 'Dedicated Learner',         icon: 'fa-solid fa-graduation-cap',     check: s => s.totalHours >= 10, desc: 'Study for 10 hours' },
  { id: 'century_scholar',    name: 'Century Scholar',           icon: 'fa-solid fa-scroll',             check: s => s.totalHours >= 100, desc: 'Study for 100 hours' },
  { id: 'on_a_roll',          name: 'On a Roll',                 icon: 'fa-solid fa-dice',               check: s => s.longestStreak >= 3, desc: '3-day streak' },
  { id: 'two_weeks_strong',   name: 'Two Weeks Strong',          icon: 'fa-solid fa-calendar-check',     check: s => s.longestStreak >= 14, desc: '14-day streak' },
  { id: 'focus_trainee',      name: 'Focus Trainee',             icon: 'fa-solid fa-bullseye',           check: s => (s.totalPomodoroSessions || 0) >= 10, desc: 'Complete 10 focus sessions' },
];

// Pagination
const VIDEOS_PER_PAGE = 20;

// Daily Study Goal
const DEFAULT_DAILY_GOAL_MIN = 60;

// Level Titles
const LEVEL_TITLES = [
  { minLevel: 1,  title: 'Novice' },
  { minLevel: 5,  title: 'Student' },
  { minLevel: 10, title: 'Scholar' },
  { minLevel: 15, title: 'Expert' },
  { minLevel: 20, title: 'Master' },
  { minLevel: 30, title: 'Grandmaster' },
  { minLevel: 50, title: 'Legend' }
];

function getLevelTitle(level) {
  let title = 'Novice';
  for (const t of LEVEL_TITLES) {
    if (level >= t.minLevel) title = t.title;
  }
  return title;
}

// Toast helper — Implementation moved to ui.js (ORG-1)
// This stub ensures showToast is available for modules that load before ui.js
function showToast(message, type = 'info') {
  // If ui.js has loaded and overridden this, that version will be used.
  // This is a fallback for early-loading modules (auth.js, firestore.js).
  const container = document.getElementById('toast-container');
  if (!container) { console.log(`[Toast] ${type}: ${message}`); return; }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-check' : type === 'error' ? 'fa-xmark' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-info-circle'}"></i> ${message}`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 300); }, 3000);
}

// Shared utility: tag class helper
function getTagClass(tag) {
  if (!tag) return '';
  return 'tag-custom';
}
