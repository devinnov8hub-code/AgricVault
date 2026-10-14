import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/field"
import { AuthLayout, FormError } from "@/features/auth/auth-layout"
import { useAuth } from "@/features/auth/auth-context"
import { toMessage } from "@/lib/supabase"

export default function ResetPasswordPage() {
  const { updatePassword, session, loading } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (password.length < 8) {
      setError("Your password must be at least 8 characters.")
      return
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      setError("Use upper and lower case letters and at least one number.")
      return
    }
    if (password !== confirmPassword) {
      setError("Those passwords do not match.")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await updatePassword(password)
      await navigate("/", { replace: true })
    } catch (cause) {
      setError(toMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  // Supabase puts a recovery session in place when the emailed link is opened.
  if (!loading && !session) {
    return (
      <AuthLayout
        title="This link has expired"
        subtitle="Reset links work once and last an hour. Ask for a fresh one."
      >
        <Button size="lg" block onClick={() => void navigate("/forgot-password")}>
          Request a new link
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Pick something you have not used before.">
      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        <Field label="New password" hint="At least 8 characters, with a number and mixed case.">
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setError(null)
              }}
            />
          )}
        </Field>

        <Field label="Confirm new password">
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value)
                setError(null)
              }}
            />
          )}
        </Field>

        <FormError message={error} />

        <Button type="submit" size="lg" block loading={submitting}>
          Save new password
        </Button>
      </form>
    </AuthLayout>
  )
}
