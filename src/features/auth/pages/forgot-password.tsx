import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/field"
import { Icon } from "@/components/ui/icon"
import { AuthLayout, FormError } from "@/features/auth/auth-layout"
import { useAuth } from "@/features/auth/auth-context"
import { toMessage } from "@/lib/firebase"

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()

  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address.")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await requestPasswordReset(email.trim())
      setSent(true)
    } catch (cause) {
      setError(toMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="If an account uses that address, a reset link is on its way."
        footer={
          <Link to="/sign-in" className="font-medium text-brand-600 hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-3 rounded-md bg-ok-soft px-4 py-6 text-center">
          <Icon name="mark_email_read" className="text-2xl text-ok" />
          <p className="text-xs text-ok">
            The link expires in one hour. Check your spam folder if it has not arrived in a few
            minutes.
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We will email you a link to set a new one."
      footer={
        <Link to="/sign-in" className="font-medium text-brand-600 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        <Field label="Email">
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setError(null)
              }}
            />
          )}
        </Field>

        <FormError message={error} />

        <Button type="submit" size="lg" block loading={submitting}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  )
}
