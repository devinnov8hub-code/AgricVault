import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"

import { requireEnv } from "./http.ts"

/**
 * Service-role client. It bypasses RLS, so only use it after you have
 * established who is calling and what they are allowed to do.
 */
export function adminClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** A client acting as the caller, so RLS applies to it exactly as in the app. */
export function callerClient(request: Request): SupabaseClient {
  const authorization = request.headers.get("Authorization") ?? ""
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
}

export interface Caller {
  id: string
  email: string
  role: "admin" | "farmer"
}

/** Resolve the signed-in caller, or null when the token is missing or stale. */
export async function resolveCaller(request: Request): Promise<Caller | null> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return null

  const admin = adminClient()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, role, status")
    .eq("id", data.user.id)
    .single()

  if (!profile || profile.status !== "active") return null

  return { id: profile.id, email: profile.email, role: profile.role }
}
