import { cert, getApp, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getDatabase } from "firebase-admin/database"
import { getFirestore } from "firebase-admin/firestore"

/**
 * The Admin SDK, for server routes only.
 *
 * This bypasses every Firestore security rule, which is the whole point — the
 * sync route has to write sensor readings that no browser is permitted to
 * write. It also means a mistake here has no safety net, so keep the surface
 * small and never expose these clients to anything that takes user input
 * without checking it first.
 *
 * Credentials come from FIREBASE_SERVICE_ACCOUNT, the service-account JSON as
 * a single-line string. Never commit it, never prefix it with VITE_.
 */
function credentials(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT. Paste the service-account JSON as one line " +
        "into the environment (Vercel: Project Settings → Environment Variables).",
    )
  }

  let parsed: Record<string, string>
  try {
    parsed = JSON.parse(raw) as Record<string, string>
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.")
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    // Vercel stores newlines escaped, so put them back.
    privateKey: parsed.private_key?.replace(/\\n/g, "\n"),
  }
}

function app() {
  if (getApps().length) return getApp()

  return initializeApp({
    credential: cert(credentials()),
    databaseURL: process.env.FIREBASE_DB_URL,
  })
}

export const adminDb = () => getFirestore(app())
export const adminAuth = () => getAuth(app())
export const adminRtdb = () => getDatabase(app())

/** Read a required environment variable, failing loudly rather than silently. */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

/**
 * Resolve the caller from a Firebase ID token, or null.
 *
 * Verifying the token is not optional: anything that trusts a uid sent in the
 * request body is trusting the browser, which is the same as trusting anyone.
 */
export async function resolveCaller(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return null

  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const snapshot = await adminDb().collection("profiles").doc(decoded.uid).get()
    if (!snapshot.exists) return null

    const profile = snapshot.data() as { role: string; status: string; email: string }
    if (profile.status !== "active") return null

    return { uid: decoded.uid, email: profile.email, role: profile.role }
  } catch {
    return null
  }
}
