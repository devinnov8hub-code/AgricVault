import { getApp, getApps, initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import {
  getFirestore,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore"
import { getStorage } from "firebase/storage"

import { firebaseConfig } from "@/lib/env"

// Vite hot-reloads this module, so guard against initialising twice.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

/**
 * Turn a snapshot into a typed object with its id attached.
 *
 * Also normalises Firestore Timestamps to ISO strings: documents written by
 * the server routes use serverTimestamp(), while those written by the browser
 * carry plain strings, and the UI should not have to care which.
 */
export function fromSnapshot<T>(snapshot: QueryDocumentSnapshot<DocumentData>): T {
  const data = snapshot.data()

  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Timestamp) {
      data[key] = value.toDate().toISOString()
    }
  }

  return { id: snapshot.id, ...data } as T
}

export const nowIso = () => new Date().toISOString()

/** Turn a Firebase error into something worth showing a person. */
export function toMessage(error: unknown, fallback = "Something went wrong. Try again."): string {
  if (!error) return fallback

  const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""

  const friendly: Record<string, string> = {
    "auth/invalid-credential": "That email and password do not match an account.",
    "auth/invalid-email": "That does not look like a valid email address.",
    "auth/user-not-found": "That email and password do not match an account.",
    "auth/wrong-password": "That email and password do not match an account.",
    "auth/email-already-in-use": "An account already uses that email. Sign in instead.",
    "auth/weak-password": "Pick a longer password — at least 8 characters.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
    "auth/network-request-failed": "Could not reach the server. Check your connection.",
    "auth/requires-recent-login": "Sign in again before making this change.",
    "auth/invalid-action-code": "That link is invalid or has already been used.",
    "auth/expired-action-code": "That link has expired. Ask for a new one.",
    "permission-denied": "You do not have access to that.",
    unavailable: "Could not reach the database. Check your connection.",
  }

  if (friendly[code]) return friendly[code]
  if (error instanceof Error && error.message) return error.message
  return fallback
}
