const ALLOWED = (process.env.ALLOWED_ORIGINS ?? "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? ""
  const allowed = ALLOWED.includes("*") || ALLOWED.includes(origin) ? origin || "*" : ALLOWED[0]!

  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "86400",
    vary: "origin",
  }
}

export function preflight(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}

export function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "content-type": "application/json" },
  })
}

export function fail(request: Request, message: string, status = 400, detail?: unknown): Response {
  if (status >= 500) console.error(message, detail)
  return json(request, { error: message, detail }, status)
}
