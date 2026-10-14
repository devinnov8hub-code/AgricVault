import { createClient } from "@supabase/supabase-js"

import { env } from "@/lib/env"
import type { Database } from "@/types/database"

/**
 * The single Supabase client for the browser. It carries the user's session,
 * so every query runs under Row Level Security as that user — the policies in
 * the migration are the real authorisation layer, not the UI.
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
  global: {
    headers: { "x-application-name": "agrivault-web" },
  },
})

/** Narrow a PostgREST error into something worth showing a person. */
export function toMessage(error: unknown, fallback = "Something went wrong. Try again."): string {
  if (!error) return fallback
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message) return message
  }
  return fallback
}
