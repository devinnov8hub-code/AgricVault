import { requireEnv } from "./firebase-admin.ts"
import type { RenderedEmail } from "./email/templates.ts"

const RESEND_ENDPOINT = "https://api.resend.com/emails"

export interface SendResult {
  ok: boolean
  messageId?: string
  error?: string
}

/**
 * Send one email through Resend.
 *
 * Firebase Auth sends its own mail (verification, password reset) from its own
 * templates — that never passes through here. This is for the application's
 * transactional mail: receipts, reminders, withdrawal decisions, alerts.
 */
export async function sendEmail(options: {
  to: string | string[]
  email: RenderedEmail
  replyTo?: string
  tags?: Array<{ name: string; value: string }>
}): Promise<SendResult> {
  const apiKey = requireEnv("RESEND_API_KEY")
  const from = requireEnv("RESEND_FROM")

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.email.subject,
        html: options.email.html,
        text: options.email.text,
        reply_to: options.replyTo ?? process.env.RESEND_REPLY_TO ?? undefined,
        tags: options.tags,
      }),
    })

    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string }

    if (!response.ok) {
      return { ok: false, error: body.message ?? `Resend responded ${response.status}` }
    }
    return { ok: true, messageId: body.id }
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Resend request failed" }
  }
}
