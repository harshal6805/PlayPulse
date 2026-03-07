<div align="center">

<img src="favicon/favicon.svg" alt="PlayPulse Logo" width="80" />

# PlayPulse

**Turn any YouTube playlist into a trackable course.**

[![Live Site](https://img.shields.io/badge/Live-playpulse-pearl.vercel.app-2563eb?style=for-the-badge&logo=googlechrome&logoColor=white)](https://playpulse-pearl.vercel.app)
[![Firebase](https://img.shields.io/badge/Backend-Firebase-ffca28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com)


*Free forever. No credit card. No setup.*

</div>

---

## What is PlayPulse?

PlayPulse transforms any YouTube playlist into a structured, trackable learning experience. Stop losing your place in 40-video playlists — track every video, take notes, earn XP, and actually finish what you start.

### The Problem
Everyone finds an amazing YouTube playlist, watches the first 3 videos, gets distracted, and never comes back.

### The Solution
PlayPulse gives you the structure of a paid course — with progress tracking, analytics, gamification, and a built-in player — completely free.

---

## Features

| Feature | Description |
|---|---|
| **Playlist Tracking** | Import any YouTube playlist. See your progress grow in real time. |
| **Built-in Player** | Watch videos inside the app. Auto-marks complete when you finish. |
| **Analytics** | 365-day heatmap, weekly charts, total hours, XP growth graphs. |
| **Pomodoro Timer** | Built-in focus timer with custom durations. Lives in your topbar. |
| **Video Notes** | Rich-text notes per video. Auto-saved to the cloud. Export as Markdown. |
| **XP & Leveling** | Earn XP for every video. Level up as you learn. |
| **Streaks & Combos** | Daily streaks + combo multipliers (3+ days = 2x XP, 7+ days = 3x XP). |
| **Achievements** | Unlock badges like "First Blood", "Marathon", "Century" and more. |
| **Global Search** | Search across all your playlists and videos instantly. |
| **Dark / Light Mode** | Fully themeable. Remembers your preference. |
| **Fully Responsive** | Works great on phones, tablets, and desktops. |
| **PWA Support** | Install as a native-like app on any device. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Backend / DB** | Google Firebase (Firestore, Authentication) |
| **Video Data** | YouTube Data API v3 |
| **Charts** | Chart.js |
| **Fonts & Icons** | Google Fonts (Inter), Font Awesome 6 |
| **Email** | EmailJS |
| **Forms** | Formspree |
| **Analytics** | Google Analytics 4 (via GTM) |
| **Session Recording** | Microsoft Clarity |
| **Security** | DOMPurify, Firebase Security Rules, Security Headers |
| **Hosting** | Firebase Hosting |

---

## Project Structure

```
PlayPulse/
├── index.html          # Landing page
├── app.html            # Main dashboard (requires auth)
├── about.html          # About page
├── help.html           # Help & docs
├── privacy.html        # Privacy Policy
├── terms.html          # Terms of Service
├── firebase.json       # Firebase Hosting config + security headers
├── manifest.json       # PWA manifest
├── robots.txt          # SEO crawl rules
├── sitemap.xml         # SEO sitemap
│
├── css/
│   ├── style.css       # Global design system & variables
│   ├── landing.css     # Landing page styles
│   └── app.css         # Dashboard styles
│
├── js/
│   ├── config.js       # Firebase config
│   ├── constants.js    # App constants (XP values, badge defs, etc.)
│   ├── auth.js         # Google Authentication
│   ├── app.js          # Core app logic & state
│   ├── playlists.js    # Playlist CRUD & YouTube API calls
│   ├── player.js       # YouTube player integration
│   ├── analytics.js    # Charts & stats rendering
│   ├── gamification.js # XP, levels, streaks, badges
│   ├── notes.js        # Rich-text notes (per video)
│   ├── pomodoro.js     # Pomodoro timer logic
│   ├── search.js       # Global search
│   ├── ui.js           # Shared UI utilities & landing page init
│   ├── email.js        # Welcome email via EmailJS
│   └── firebase-init.js# Firebase initialization (consolidated)
│
├── favicon/
│   ├── favicon.svg
│   ├── favicon.ico
│   ├── favicon-96x96.png
│   └── apple-touch-icon.png
│
└── assets/
    └── social-preview.png
```

---

## Getting Started (Local Development)

### Prerequisites
- A Google account
- A Firebase project ([console.firebase.google.com](https://console.firebase.google.com))
- A YouTube Data API v3 key ([console.cloud.google.com](https://console.cloud.google.com))

### Setup

**1. Clone the repo**
```bash
git clone https://github.com/harshal6805/PlayPulse.git
cd PlayPulse
```

**2. Configure Firebase**

Create `js/config.js` with your Firebase credentials:
```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
firebase.initializeApp(firebaseConfig);
```

**3. Add your YouTube API key**

In `js/constants.js`, set:
```js
const YOUTUBE_API_KEY = 'YOUR_YOUTUBE_API_KEY';
```

**4. Serve locally**

Since the app uses Firebase Auth (which requires a proper origin), use any local server:
```bash
# With VS Code Live Server, or:
npx serve .
# or:
python -m http.server 8000
```

Open `http://localhost:8000`.

---

## Firebase Setup

### Firestore Rules
Deploy the security rules from `firebase.json`:
```bash
firebase deploy --only firestore:rules
```

### Hosting
```bash
firebase deploy --only hosting
```

### Required Firebase Services
- **Authentication** → Enable Google sign-in provider
- **Firestore** → Create database in production mode
- **Hosting** → Connect your custom domain

---

## Analytics & Tracking

- **Google Tag Manager** (`GTM-PPTPR3FR`) — manages all tags from one place
- **Google Analytics 4** (`G-Z7B02MHBKW`) — page views, user journeys, conversions
- **Microsoft Clarity** — heatmaps and session recordings

All tracking scripts are placed optimally in `<head>` for minimal performance impact.

---

## Security

PlayPulse takes security seriously:

- **XSS Protection** — All `innerHTML` usage sanitized with DOMPurify
- **Security Headers** — `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` via Firebase Hosting
- **Firestore Rules** — Users can only read/write their own data
- **API Key Restrictions** — YouTube API key restricted to production domain
- **No Debug Logs** — All `console.log` statements removed in production
- **Bot Protection** — Honeypot fields on all forms

---

## Contributing

Contributions are welcome! Please:

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

For bugs or feature requests, use the **Feedback & Bug Report** form in the app.

---

## Acknowledgements

- [Firebase](https://firebase.google.com) — backend & hosting
- [YouTube Data API](https://developers.google.com/youtube/v3) — playlist & video metadata
- [Chart.js](https://www.chartjs.org) — beautiful charts
- [Font Awesome](https://fontawesome.com) — icons
- [DOMPurify](https://github.com/cure53/DOMPurify) — XSS protection
- [EmailJS](https://www.emailjs.com) — welcome emails
- [Formspree](https://formspree.io) — feedback form handling

---

<div align="center">

Made with ️ by [harshal6805](https://github.com/harshal6805)

**[playpulse-pearl.vercel.app](https://playpulse-pearl.vercel.app)** · [Privacy Policy](https://playpulse-pearl.vercel.app/privacy.html) · [Terms](https://playpulse-pearl.vercel.app/terms.html)

</div>
