/**
 * Validated client environment.
 *
 * Only VITE_* variables reach the browser bundle. That is fine for the Firebase
 * web config — it is public by design, and Firestore security rules are what
 * actually protect the data. Anything genuinely secret (the service-account
 * key, the Resend key, the RTDB secret) belongs to the server routes in /api
 * and must never appear here.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env and fill it in, ` +
        `then restart the dev server — Vite only reads .env at startup.`,
    )
  }
  return value
}

export const firebaseConfig = {
  apiKey: required("VITE_FIREBASE_API_KEY", import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: required("VITE_FIREBASE_AUTH_DOMAIN", import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: required("VITE_FIREBASE_PROJECT_ID", import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: required("VITE_FIREBASE_APP_ID", import.meta.env.VITE_FIREBASE_APP_ID),
} as const

export const env = {
  appUrl: import.meta.env.VITE_APP_URL ?? window.location.origin,
  isProduction: import.meta.env.PROD,
} as const
