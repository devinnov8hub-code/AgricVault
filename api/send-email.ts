import { FieldValue } from "firebase-admin/firestore"

import { fail, json, preflight } from "./_shared/http.ts"
import { adminDb, resolveCaller } from "./_shared/firebase-admin.ts"
import { render, templateNames, type TemplateName } from "./_shared/email/templates.ts"

export const config = { runtime: "nodejs" }

/**
 * send-email — the one way application mail leaves AgriVault.
 *
 * Renders a named template, hands it to Resend, and records the attempt in
 * emailLog either way, so support can answer "did she get the receipt?".
 *
 * Firebase Auth sends its own verification and password-reset mail from its own
 * templates and never comes through here.
 *
 * POST /api/send-email
 *   Authorization: Bearer <Firebase ID token>
 *   { "template": "payment_receipt", "to": "a@b.ng", "payload": { … } }
 */

/** Templates a farmer may trigger, and only ever addressed to themselves. */
const SELF_SERVICE = new Set<TemplateName>(["payment_receipt", "welcome"])

/** Templates only ever addressed to staff. */
const ADMIN_ONLY = new Set<TemplateName>(["withdrawal_requested", "climate_alert"])

interface Body {
  template?: string
  to?: string | string[]
  payload?: Record<string, unknown>
  recipientId?: string
}

export default async function handler(request: Request): Promise<Response> {
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
  if (!to || (Array.isArray(to) && to.length === 0))
    return fail(request, "A recipient is required.")
  if (!payload || typeof payload !== "object") return fail(request, "A payload is required.")

  const name = template as TemplateName
  const recipients = Array.isArray(to) ? to : [to]

  // ---- Authorisation -------------------------------------------------------
  // A scheduler may call with the shared key; a person must present a verified
  // Firebase ID token. The uid is never taken from the body.
  const schedulerKey = process.env.SYNC_KEY
  const bearer = request.headers.get("x-sync-key")
  const isScheduler = Boolean(schedulerKey && bearer === schedulerKey)

  if (!isScheduler) {
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

  const db = adminDb()
  const logRef = db.collection("emailLog").doc()

  await logRef.set({
    recipientEmail: recipients[0],
    recipientId: recipientId ?? null,
    template: name,
    subject: rendered.subject,
    status: "queued",
    providerMessageId: null,
    error: null,
    createdAt: FieldValue.serverTimestamp(),
    sentAt: null,
  })

  const { sendEmail } = await import("./_shared/resend.ts")
  const result = await sendEmail({
    to: recipients,
    email: rendered,
    tags: [{ name: "template", value: name }],
  })

  await logRef.update(
    result.ok
      ? {
          status: "sent",
          providerMessageId: result.messageId ?? null,
          sentAt: FieldValue.serverTimestamp(),
        }
      : { status: "failed", error: result.error ?? "Unknown error" },
  )

  if (!result.ok) return fail(request, result.error ?? "The email could not be sent.", 502)

  return json(request, { sent: true, messageId: result.messageId, template: name })
}
