import { QueryClientProvider } from "@tanstack/react-query"
import { Component, type ErrorInfo, type ReactNode } from "react"
import { BrowserRouter } from "react-router-dom"

import { AuthProvider } from "@/features/auth/auth-provider"
import { queryClient } from "@/lib/query-client"

/** Stops one broken screen from blanking the whole application. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error", error, info.componentStack)
  }

  override render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas p-6 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-md text-sm text-ink-muted">
          The page could not be displayed. Reloading usually clears it; if it keeps happening, let
          the facility know.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-brand-600 px-6 py-3 text-sm font-medium text-neutral-0 hover:bg-brand-700"
        >
          Reload
        </button>
      </div>
    )
  }
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>{children}</AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
