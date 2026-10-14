import { useMemo, useState } from "react"

import { adminNav, farmerNav } from "@/app/routes/nav"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { Field, Input } from "@/components/ui/field"
import { Icon } from "@/components/ui/icon"
import { useAuth } from "@/features/auth/auth-context"
import { doc, updateDoc } from "firebase/firestore"

import { db, nowIso, toMessage } from "@/lib/firebase"
import { COLLECTIONS } from "@/types/models"

interface Details {
  fullName: string
  phone: string
  address: string
}

/** Profile and password, for whoever is signed in. Shared by both roles. */
export default function AccountPage() {
  const { profile, isAdmin, refreshProfile, requestPasswordReset } = useAuth()

  /** Edits the user has made. Null means "showing what the server has". */
  const [draft, setDraft] = useState<Details | null>(null)
  const [sendingReset, setSendingReset] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // Derived rather than copied into state by an effect, so the fields fill in
  // the moment the profile loads without a second render pass.
  const saved_ = useMemo<Details>(
    () => ({
      fullName: profile?.fullName ?? "",
      phone: profile?.phone ?? "",
      address: profile?.address ?? "",
    }),
    [profile],
  )

  const { fullName, phone, address } = draft ?? saved_

  const set = <K extends keyof Details>(key: K, value: string) => {
    setDraft((current) => ({ ...(current ?? saved_), [key]: value }))
    setSaved(false)
  }

  async function handlePasswordReset() {
    if (!profile) return
    setSendingReset(true)
    setError(null)
    try {
      await requestPasswordReset(profile.email)
      setResetSent(true)
    } catch (cause) {
      setError(toMessage(cause))
    } finally {
      setSendingReset(false)
    }
  }

  async function handleSave() {
    if (!profile) return

    if (!fullName.trim()) {
      setError("Your name cannot be empty.")
      return
    }
    setError(null)
    setSaving(true)
    try {
      await updateDoc(doc(db, COLLECTIONS.profiles, profile.id), {
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        updatedAt: nowIso(),
      })

      await refreshProfile()
      setDraft(null)
      setSaved(true)
    } catch (cause) {
      setError(toMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell
      nav={isAdmin ? adminNav : farmerNav}
      title="Account"
      subtitle="Your details and sign-in"
    >
      <Card>
        <CardHeader icon="person" title="Profile" description="How the facility reaches you." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required>
            {(props) => (
              <Input
                {...props}
                value={fullName}
                onChange={(event) => set("fullName", event.target.value)}
              />
            )}
          </Field>

          <Field label="Email" hint="Contact the facility to change your sign-in address.">
            {(props) => <Input {...props} value={profile?.email ?? ""} disabled />}
          </Field>

          <Field label="Phone number">
            {(props) => (
              <Input
                {...props}
                type="tel"
                numeric
                value={phone}
                onChange={(event) => set("phone", event.target.value)}
              />
            )}
          </Field>

          <Field label="Address">
            {(props) => (
              <Input
                {...props}
                value={address}
                onChange={(event) => set("address", event.target.value)}
              />
            )}
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon="lock"
          title="Password"
          description="We email you a secure link rather than changing it here."
        />
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-md text-xs text-ink-muted">
            For your security the new password is set on a page only you can reach, from a link sent
            to {profile?.email}. The link expires after an hour.
          </p>
          <Button
            variant="outline"
            icon="mail"
            loading={sendingReset}
            onClick={() => void handlePasswordReset()}
          >
            Email me a reset link
          </Button>
        </CardBody>
      </Card>

      {resetSent && (
        <p className="flex items-center gap-2 text-xs text-ok">
          <Icon name="check_circle" className="text-base" />
          Reset link sent to {profile?.email}.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-4">
        {error && (
          <span role="alert" className="flex items-center gap-2 text-xs text-critical">
            <Icon name="error" className="text-base" />
            {error}
          </span>
        )}
        {saved && !error && (
          <span className="flex items-center gap-2 text-xs text-ok">
            <Icon name="check_circle" className="text-base" />
            Saved
          </span>
        )}
        <Button loading={saving} onClick={() => void handleSave()}>
          Save changes
        </Button>
      </div>
    </AppShell>
  )
}
