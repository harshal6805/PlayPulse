/* ============================================
   Firebase Initialization
   Separated from constants for clarity (ORG-4)
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
