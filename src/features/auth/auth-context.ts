import type { User } from "firebase/auth"
import { createContext, use } from "react"

import type { Profile, UserRole } from "@/types/models"

export interface SignUpInput {
  email: string
  password: string
  fullName: string
  phone?: string
}

export interface AuthState {
  user: User | null
  profile: Profile | null
  /** True until the first auth check resolves. Route guards wait on it. */
  loading: boolean
  role: UserRole | null
  isAdmin: boolean
  /** Firebase Auth's own flag. Unverified farmers are held at the gate. */
  emailVerified: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: SignUpInput) => Promise<{ needsVerification: boolean }>
  resendVerification: () => Promise<void>
  reloadUser: () => Promise<boolean>
  requestPasswordReset: (email: string) => Promise<void>
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const context = use(AuthContext)
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>")
  return context
}

/** Where a signed-in user belongs when they land on "/". */
export const homeFor = (role: UserRole | null) =>
  role === "admin" ? "/admin/dashboard" : role === "farmer" ? "/farmer/dashboard" : "/sign-in"
