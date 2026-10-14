/**
 * send-email
 *
 * The one way application mail leaves AgriVault. Renders a named template,
 * hands it to Resend, and records the attempt in email_log either way.
 *
 * POST /functions/v1/send-email
 *   { "template": "payment_receipt", "to": "a@b.ng", "payload": { … } }
 *
 * Callers
 *   * An admin, with their session token — for anything they trigger by hand
 *     (resend a receipt, chase a balance).
 *   * A farmer, but only for templates addressed to their own email.
 *   * A trusted backend, with the service-role key — for scheduled mail such
 *     as expiry warnings.
 */

import { fail, json, preflight } from "../_shared/http.ts"
import { sendEmail } from "../_shared/resend.ts"
import { adminClient, resolveCaller } from "../_shared/supabase.ts"
import { render, templateNames, type TemplateName } from "../_shared/email/templates.ts"

/** Templates a farmer may trigger for themselves; everything else is admin-only. */
const SELF_SERVICE: ReadonlySet<string> = new Set<TemplateName>(["payment_receipt", "welcome"])

/** Templates only ever addressed to staff. */
const ADMIN_ONLY: ReadonlySet<string> = new Set<TemplateName>([
  "withdrawal_requested",
  "climate_alert",
])

interface Body {
  template?: string
  to?: string | string[]
  payload?: Record<string, unknown>
  recipientId?: string
}

Deno.serve(async (request) => {
  const early = preflight(request)
  if (early) return early

  if (request.method !== "POST") return fail(request, "Use POST.", 405)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return fail(request, "Body must be JSON.")
  }

  const { template, to, payload, recipientId } = body

  if (!template || !templateNames.includes(template as TemplateName)) {
    return fail(request, `Unknown template. Expected one of: ${templateNames.join(", ")}`)
  }
  if (!to || (Array.isArray(to) && to.length === 0)) {
    return fail(request, "A recipient is required.")
  }
  if (!payload || typeof payload !== "object") {
    return fail(request, "A payload is required.")
  }

  const name = template as TemplateName
  const recipients = Array.isArray(to) ? to : [to]

  // ---- Authorisation -------------------------------------------------------
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "")
  const isService = Boolean(serviceKey && bearer === serviceKey)

  if (!isService) {
    const caller = await resolveCaller(request)
    if (!caller) return fail(request, "Sign in to send mail.", 401)

    if (caller.role !== "admin") {
      if (ADMIN_ONLY.has(name) || !SELF_SERVICE.has(name)) {
        return fail(request, "You cannot send this email.", 403)
      }
      const toSelf = recipients.every(
        (address) => address.toLowerCase() === caller.email.toLowerCase(),
      )
      if (!toSelf) return fail(request, "You can only send this to yourself.", 403)
    }
  }

  // ---- Render and send -----------------------------------------------------
  let rendered
  try {
    rendered = render(name, payload as never)
  } catch (cause) {
    return fail(request, "That payload does not fit the template.", 422, String(cause))
  }

  const db = adminClient()

  const { data: logRow } = await db
    .from("email_log")
    .insert({
      recipient_email: recipients[0],
      recipient_id: recipientId ?? null,
      template: name,
      subject: rendered.subject,
      payload,
      status: "queued",
    })
    .select("id")
    .single()

  const result = await sendEmail({
    to: recipients,
    email: rendered,
    tags: [{ name: "template", value: name }],
  })

  if (logRow?.id) {
    await db
      .from("email_log")
      .update(
        result.ok
          ? {
              status: "sent",
              provider_message_id: result.messageId,
              sent_at: new Date().toISOString(),
            }
          : { status: "failed", error: result.error },
      )
      .eq("id", logRow.id)
  }

  if (!result.ok) return fail(request, result.error ?? "The email could not be sent.", 502)

  return json(request, { sent: true, messageId: result.messageId, template: name })
})
