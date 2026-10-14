import { lazy, Suspense } from "react"
import { Route, Routes } from "react-router-dom"

import { Home, NotFound, RequireAuth, RequireRole } from "@/app/routes/guards"
import { Icon } from "@/components/ui/icon"

/* Auth screens load eagerly — they are the first thing most visits need. */
import SignInPage from "@/features/auth/pages/sign-in"
import SignUpPage from "@/features/auth/pages/sign-up"
import VerifyEmailPage from "@/features/auth/pages/verify-email"
import ForgotPasswordPage from "@/features/auth/pages/forgot-password"

/* The application itself is split per route, so a farmer never downloads the
   admin bundle and vice versa. */
const AdminDashboardPage = lazy(() => import("@/features/admin/dashboard-page"))
const AdminUsersPage = lazy(() => import("@/features/admin/users-page"))
const AdminInventoryPage = lazy(() => import("@/features/admin/inventory-page"))
const AdminMonitoringPage = lazy(() => import("@/features/admin/monitoring-page"))
const AdminPaymentsPage = lazy(() => import("@/features/admin/payments-page"))
const AdminSettingsPage = lazy(() => import("@/features/admin/settings-page"))

const FarmerDashboardPage = lazy(() => import("@/features/farmer/dashboard-page"))
const FarmerPaymentsPage = lazy(() => import("@/features/farmer/payments-page"))

const AccountPage = lazy(() => import("@/features/account/account-page"))

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <Icon name="progress_activity" className="animate-spin text-2xl text-brand-600" />
      <span className="sr-only">Loading</span>
    </div>
  )
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/verify" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        {/* Firebase hosts the reset and verification handlers itself and sends
            people back to /sign-in, so there is no callback route to own. */}

        <Route element={<RequireAuth />}>
          <Route element={<RequireRole role="admin" />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/inventory" element={<AdminInventoryPage />} />
            <Route path="/admin/monitoring" element={<AdminMonitoringPage />} />
            <Route path="/admin/payments" element={<AdminPaymentsPage />} />
            <Route path="/admin/settings" element={<AdminSettingsPage />} />
            <Route path="/admin/account" element={<AccountPage />} />
          </Route>

          <Route element={<RequireRole role="farmer" />}>
            <Route path="/farmer" element={<FarmerDashboardPage />} />
            <Route path="/farmer/dashboard" element={<FarmerDashboardPage />} />
            <Route path="/farmer/payments" element={<FarmerPaymentsPage />} />
            <Route path="/farmer/settings" element={<AccountPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
