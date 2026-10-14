import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * Every query key in the app. Keeping them here means invalidation after a
 * mutation is a lookup rather than a guess.
 */
export const keys = {
  session: ["session"] as const,
  profile: (userId: string) => ["profile", userId] as const,

  facility: ["facility"] as const,
  settings: ["facility", "settings"] as const,
  tariff: ["facility", "tariff"] as const,
  units: ["facility", "units"] as const,
  devices: ["facility", "devices"] as const,
  produce: ["facility", "produce"] as const,

  users: (search: string, page: number) => ["users", { search, page }] as const,
  batches: (search: string, page: number) => ["batches", { search, page }] as const,
  myBatches: ["batches", "mine"] as const,

  readings: (page: number) => ["readings", { page }] as const,
  readingsSeries: (hours: number) => ["readings", "series", hours] as const,
  latestReading: ["readings", "latest"] as const,
  conditions: ["conditions"] as const,

  alerts: (status: string) => ["alerts", { status }] as const,
  notifications: ["notifications"] as const,

  withdrawals: (status: string) => ["withdrawals", { status }] as const,
  myWithdrawals: ["withdrawals", "mine"] as const,

  payments: (search: string, status: string, range: string, page: number) =>
    ["payments", { search, status, range, page }] as const,
  myPayments: (page: number) => ["payments", "mine", page] as const,
  paymentStats: ["payments", "stats"] as const,

  dashboard: ["dashboard"] as const,
} as const
