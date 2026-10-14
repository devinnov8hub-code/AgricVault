import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile as updateAuthProfile,
  type User,
} from "firebase/auth"
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import { AuthContext, type AuthState } from "@/features/auth/auth-context"
import { auth, db, nowIso } from "@/lib/firebase"
import { COLLECTIONS, type Profile } from "@/types/models"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  // Firebase mutates the User object in place on reload() rather than handing
  // back a new one, so this forces a render when verification completes.
  const [verifiedTick, setVerifiedTick] = useState(0)

  const loadProfile = useCallback(async (uid: string | undefined) => {
    if (!uid) {
      setProfile(null)
      return
    }
    const snapshot = await getDoc(doc(db, COLLECTIONS.profiles, uid))
    setProfile(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Profile) : null)
  }, [])

  useEffect(() => {
    return onAuthStateChanged(auth, (next) => {
      setUser(next)
      void loadProfile(next?.uid).finally(() => setLoading(false))
    })
  }, [loadProfile])

  const value = useMemo<AuthState>(() => {
    const role = profile?.role ?? null

    return {
      user,
      profile,
      loading,
      role,
      isAdmin: role === "admin",
      emailVerified: Boolean(user?.emailVerified),

      async signIn(email, password) {
        await signInWithEmailAndPassword(auth, email, password)
      },

      async signUp({ email, password, fullName, phone }) {
        const credential = await createUserWithEmailAndPassword(auth, email, password)

        await updateAuthProfile(credential.user, { displayName: fullName })

        // The profile document is created here rather than by a trigger, and
        // the rules refuse any role other than "farmer" on self-signup — an
        // admin is only ever made by the seed script or by another admin.
        const newProfile: Omit<Profile, "id"> = {
          role: "farmer",
          fullName,
          email,
          phone: phone ?? null,
          address: null,
          avatarUrl: null,
          status: "active",
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }

        await setDoc(doc(db, COLLECTIONS.profiles, credential.user.uid), {
          ...newProfile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })

        await sendEmailVerification(credential.user, {
          url: `${window.location.origin}/sign-in`,
        })

        await loadProfile(credential.user.uid)
        return { needsVerification: true }
      },

      async resendVerification() {
        if (!auth.currentUser) throw new Error("Sign in first.")
        await sendEmailVerification(auth.currentUser, {
          url: `${window.location.origin}/sign-in`,
        })
      },

      /** Re-check whether the inbox link has been clicked yet. */
      async reloadUser() {
        if (!auth.currentUser) return false
        await auth.currentUser.reload()
        setUser(auth.currentUser)
        setVerifiedTick((tick) => tick + 1)
        return auth.currentUser.emailVerified
      },

      async requestPasswordReset(email) {
        await sendPasswordResetEmail(auth, email, {
          url: `${window.location.origin}/sign-in`,
        })
      },

      async refreshProfile() {
        await loadProfile(user?.uid)
      },

      async signOut() {
        await firebaseSignOut(auth)
        setProfile(null)
      },
    }
    // verifiedTick is a deliberate dependency: Firebase mutates the User object
    // in place on reload(), so nothing else here changes identity when an email
    // is verified and the memo would otherwise hand back a stale emailVerified.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile, loading, verifiedTick, loadProfile])

  return <AuthContext value={value}>{children}</AuthContext>
}
