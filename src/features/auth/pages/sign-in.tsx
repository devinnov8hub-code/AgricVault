import { useState, type FormEvent } from "react"
import { Link, Navigate, useLocation } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/field"
import { AuthLayout, FormError } from "@/features/auth/auth-layout"
import { homeFor, useAuth } from "@/features/auth/auth-context"
import { toMessage } from "@/lib/firebase"

export default function SignInPage() {
  const { signIn, user, role, loading } = useAuth()
  const location = useLocation()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user && role) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? homeFor(role)} replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError("Enter your email and password.")
      return
    }

    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
    } catch (cause) {
      const message = toMessage(cause)
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue operations and real-time visibility."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link to="/sign-up" className="font-medium text-brand-600 hover:underline">
            Create one
          </Link>
        </>
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
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>

        <Field label="Password">
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>

        <Link
          to="/forgot-password"
          className="-mt-2 self-end text-xs text-brand-600 hover:underline"
        >
          Forgot password?
        </Link>

        <FormError message={error} />

        <Button type="submit" size="lg" block loading={submitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}
