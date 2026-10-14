import { useState, type ReactNode } from "react"
import { NavLink } from "react-router-dom"

import { NotificationsPanel } from "@/features/notifications/notifications-panel"
import { useAuth } from "@/features/auth/auth-context"
import { Icon } from "@/components/ui/icon"
import { Logo } from "@/components/ui/logo"
import { cn } from "@/lib/cn"
import { initials } from "@/lib/format"

export interface NavItem {
  label: string
  /** Material Symbols Rounded name. */
  icon: string
  to: string
  end?: boolean
}

/* -- Sidebar --------------------------------------------------------------- */

function Sidebar({
  items,
  open,
  onDismiss,
}: {
  items: NavItem[]
  open: boolean
  onDismiss: () => void
}) {
  const { profile, signOut } = useAuth()

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onDismiss}
          className="fixed inset-0 z-30 bg-neutral-900/40 lg:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-sidebar flex-col bg-brand-600 text-neutral-0",
          "transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-topbar items-center px-6">
          <Logo inverted className="h-7" />
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onDismiss}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-neutral-0 text-brand-600"
                    : "text-brand-100 hover:bg-brand-500 hover:text-neutral-0",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={item.icon} filled={isActive} className="text-base" />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-brand-500 p-3">
          <div className="flex items-center gap-3 rounded-md px-3 py-2">
            <span className="mono flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-400 text-xs font-semibold">
              {initials(profile?.fullName ?? "?")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{profile?.fullName}</p>
              <p className="truncate text-2xs text-brand-200 capitalize">{profile?.role}</p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Sign out"
              className="rounded-sm p-1 text-brand-200 transition-colors hover:bg-brand-500 hover:text-neutral-0"
            >
              <Icon name="logout" className="text-base" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

/* -- Topbar ---------------------------------------------------------------- */

function Topbar({
  title,
  subtitle,
  action,
  onOpenNav,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  onOpenNav: () => void
}) {
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  return (
    <header className="sticky top-0 z-20 flex min-h-topbar items-center gap-4 border-b border-line bg-surface px-4 py-3 lg:px-6">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="rounded-sm p-1 text-ink-muted hover:bg-neutral-100 lg:hidden"
      >
        <Icon name="menu" />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold text-ink">{title}</h1>
        {subtitle && <p className="truncate text-xs text-ink-muted">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {action}
        <NotificationsPanel open={notificationsOpen} onOpenChange={setNotificationsOpen} />
      </div>
    </header>
  )
}

/* -- Shell ----------------------------------------------------------------- */

export interface AppShellProps {
  nav: NavItem[]
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}

export function AppShell({ nav, title, subtitle, action, children }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar items={nav} open={navOpen} onDismiss={() => setNavOpen(false)} />

      <div className="lg:pl-sidebar">
        <Topbar
          title={title}
          subtitle={subtitle}
          action={action}
          onOpenNav={() => setNavOpen(true)}
        />
        <main className="flex flex-col gap-4 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
