import { Navigate, Outlet, useLocation } from "react-router-dom"

import { Icon } from "@/components/ui/icon"
import { homeFor, useAuth } from "@/features/auth/auth-context"
import type { UserRole } from "@/types/models"

function Waiting() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <Icon name="progress_activity" className="animate-spin text-2xl text-brand-600" />
      <span className="sr-only">Loading</span>
    </div>
  )
}

/** Everything behind this needs a session. */
export function RequireAuth() {
  const { user, profile, loading, emailVerified } = useAuth()
  const location = useLocation()

  if (loading) return <Waiting />
  if (!user) return <Navigate to="/sign-in" state={{ from: location.pathname }} replace />

  // An unverified farmer is held at the gate. Admins are created by the seed
  // or by another admin, so they are trusted without an inbox round trip.
  if (!emailVerified && profile?.role !== "admin") {
    return <Navigate to={`/verify?email=${encodeURIComponent(user.email ?? "")}`} replace />
  }

  return <Outlet />
}

/**
 * Role gate. A farmer who lands on an admin URL is sent to their own home
 * rather than bounced to sign-in — the old behaviour, which locked farmers out
 * of the app entirely.
 */
export function RequireRole({ role }: { role: UserRole }) {
  const { profile, role: actual, loading } = useAuth()

  if (loading || (!profile && !actual)) return <Waiting />
  if (actual !== role) return <Navigate to={homeFor(actual)} replace />

  return <Outlet />
}

/** "/" sends people wherever their role belongs. */
export function Home() {
  const { user, role, loading } = useAuth()

  if (loading) return <Waiting />
  if (!user) return <Navigate to="/sign-in" replace />

  return <Navigate to={homeFor(role)} replace />
}

export function NotFound() {
  const { role } = useAuth()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas p-6 text-center">
      <Icon name="explore_off" className="text-2xl text-ink-subtle" />
      <div>
        <h1 className="text-lg font-semibold">That page does not exist</h1>
        <p className="pt-2 text-sm text-ink-muted">
          The link may be out of date, or the page may have moved.
        </p>
      </div>
      <a
        href={homeFor(role)}
        className="rounded-md bg-brand-600 px-6 py-3 text-sm font-medium text-neutral-0 hover:bg-brand-700"
      >
        Back to safety
      </a>
    </div>
  )
}
