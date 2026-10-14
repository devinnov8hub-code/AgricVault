import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/field"
import { AuthLayout, FormError } from "@/features/auth/auth-layout"
import { useAuth } from "@/features/auth/auth-context"
import { toMessage } from "@/lib/firebase"

interface FormState {
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
  confirmPassword: string
}

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
}

function validate(form: FormState): string | null {
  if (!form.firstName.trim() || !form.lastName.trim()) return "Enter your first and last name."
  if (!/^\S+@\S+\.\S+$/.test(form.email)) return "Enter a valid email address."
  if (form.password.length < 8) return "Your password must be at least 8 characters."
  if (!/[a-z]/.test(form.password) || !/[A-Z]/.test(form.password) || !/\d/.test(form.password)) {
    return "Use upper and lower case letters and at least one number."
  }
  if (form.password !== form.confirmPassword) return "Those passwords do not match."
  return null
}

export default function SignUpPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const update = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }))
    setError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const problem = validate(form)
    if (problem) {
      setError(problem)
      return
    }

    setSubmitting(true)
    try {
      await signUp({
        email: form.email.trim(),
        password: form.password,
        fullName: `${form.firstName.trim()} ${form.lastName.trim()}`,
        phone: form.phone.trim() || undefined,
      })

      await navigate(`/verify?email=${encodeURIComponent(form.email.trim())}`, { replace: true })
    } catch (cause) {
      setError(toMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Track your produce in cold storage from anywhere."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/sign-in" className="font-medium text-brand-600 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required>
            {(props) => (
              <Input
                {...props}
                autoComplete="given-name"
                value={form.firstName}
                onChange={update("firstName")}
              />
            )}
          </Field>
          <Field label="Last name" required>
            {(props) => (
              <Input
                {...props}
                autoComplete="family-name"
                value={form.lastName}
                onChange={update("lastName")}
              />
            )}
          </Field>
        </div>

        <Field label="Email" required>
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={update("email")}
            />
          )}
        </Field>

        <Field label="Phone number" hint="Used for SMS alerts about your storage.">
          {(props) => (
            <Input
              {...props}
              type="tel"
              autoComplete="tel"
              numeric
              placeholder="080..."
              value={form.phone}
              onChange={update("phone")}
            />
          )}
        </Field>

        <Field
          label="Password"
          hint="At least 8 characters, with a number and mixed case."
          required
        >
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={update("password")}
            />
          )}
        </Field>

        <Field label="Confirm password" required>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={update("confirmPassword")}
            />
          )}
        </Field>

        <FormError message={error} />

        <Button type="submit" size="lg" block loading={submitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
