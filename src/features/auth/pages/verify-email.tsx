import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { AuthLayout, FormError } from "@/features/auth/auth-layout"
import { homeFor, useAuth } from "@/features/auth/auth-context"
import { toMessage } from "@/lib/firebase"

const RESEND_SECONDS = 45

/**
 * Firebase verifies by emailed link, not by a code typed back into the app, so
 * there is nothing to enter here. The page waits instead: it re-checks Firebase
 * every few seconds and moves on by itself the moment the link is clicked, so a
 * farmer who opens the email on their phone sees this tab advance on its own.
 */
export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user, role, emailVerified, resendVerification, reloadUser, signOut } = useAuth()

  const email = params.get("email") ?? user?.email ?? ""

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  // Poll, so the tab advances without the person having to come back and press.
  useEffect(() => {
    if (!user || emailVerified) return

    const timer = window.setInterval(() => void reloadUser(), 5000)
    return () => window.clearInterval(timer)
  }, [user, emailVerified, reloadUser])

  useEffect(() => {
    if (emailVerified) void navigate(homeFor(role), { replace: true })
  }, [emailVerified, role, navigate])

  async function handleCheck() {
    setChecking(true)
    setError(null)
    try {
      const verified = await reloadUser()
      if (!verified) setNotice("Not yet — open the link in your email, then try again.")
    } catch (cause) {
      setError(toMessage(cause))
    } finally {
      setChecking(false)
    }
  }

  async function handleResend() {
    setError(null)
    setNotice(null)
    try {
      await resendVerification()
      setCooldown(RESEND_SECONDS)
      setNotice("A new link is on its way.")
    } catch (cause) {
      setError(toMessage(cause))
    }
  }

  return (
    <AuthLayout
      title="Check your email"
      subtitle={
        email
          ? `We sent a verification link to ${email}. Open it and this page will continue on its own.`
          : "We sent you a verification link. Open it to continue."
      }
      footer={
        <button
          type="button"
          onClick={() => void signOut().then(() => navigate("/sign-in", { replace: true }))}
          className="text-brand-600 hover:underline"
        >
          Use a different account
        </button>
      }
    >
      <div className="flex flex-col items-center gap-6">
        <span className="flex size-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Icon name="mark_email_unread" className="text-2xl" />
        </span>

        <div className="w-full">
          <FormError message={error} />
          {notice && !error && <p className="text-center text-xs text-ink-muted">{notice}</p>}
        </div>

        <Button block size="lg" loading={checking} onClick={() => void handleCheck()}>
          I have verified — continue
        </Button>

        <button
          type="button"
          onClick={() => void handleResend()}
          disabled={cooldown > 0}
          className="text-xs text-brand-600 hover:underline disabled:text-ink-subtle disabled:no-underline"
        >
          {cooldown > 0 ? `Resend link in ${cooldown}s` : "Resend verification link"}
        </button>

        <p className="text-center text-2xs text-ink-subtle">
          Not in your inbox? Check spam — the message comes from your facility&apos;s sending
          address.
        </p>
      </div>
    </AuthLayout>
  )
}
