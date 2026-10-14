import { useMemo, useState } from "react"

import { adminNav } from "@/app/routes/nav"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { Field, Input, Toggle } from "@/components/ui/field"
import { Icon } from "@/components/ui/icon"
import {
  useAddProduce,
  useFacility,
  useProduceTypes,
  useSaveFacility,
  useSaveThresholds,
  useThresholds,
} from "@/features/facility/queries"
import { useAuth } from "@/features/auth/auth-context"
import { toMessage } from "@/lib/firebase"

interface FormState {
  facilityName: string
  location: string
  capacityTonnes: string
  temperatureMin: string
  temperatureMax: string
  humidityMin: string
  humidityMax: string
  tariffNaira: string
  notifySms: boolean
  notifyWhatsapp: boolean
  notifyEmail: boolean
  alertPhone: string
  alertEmail: string
}

const EMPTY: FormState = {
  facilityName: "",
  location: "",
  capacityTonnes: "",
  temperatureMin: "",
  temperatureMax: "",
  humidityMin: "",
  humidityMax: "",
  tariffNaira: "",
  notifySms: true,
  notifyWhatsapp: true,
  notifyEmail: true,
  alertPhone: "",
  alertEmail: "",
}

function validate(form: FormState): string | null {
  const num = (value: string) => (value.trim() === "" ? Number.NaN : Number(value))

  if (!form.facilityName.trim()) return "The facility needs a name."
  if (!(num(form.capacityTonnes) > 0)) return "Capacity must be greater than zero."

  const [tMin, tMax, hMin, hMax] = [
    num(form.temperatureMin),
    num(form.temperatureMax),
    num(form.humidityMin),
    num(form.humidityMax),
  ]
  if ([tMin, tMax, hMin, hMax].some(Number.isNaN)) return "Fill in all four thresholds."
  if (tMin >= tMax) return "Minimum temperature must be below the maximum."
  if (hMin >= hMax) return "Minimum humidity must be below the maximum."
  if (hMin < 0 || hMax > 100) return "Humidity must sit between 0 and 100."
  // The rig stores humidity thresholds as whole percentage points. Saying so
  // beats rounding behind the operator's back and showing them a number they
  // did not type.
  if (!Number.isInteger(hMin) || !Number.isInteger(hMax)) {
    return "Humidity thresholds must be whole numbers — the sensor uses whole percent."
  }

  if (!(num(form.tariffNaira) > 0)) return "The tariff must be greater than zero."
  if ((form.notifySms || form.notifyWhatsapp) && !form.alertPhone.trim()) {
    return "Add a phone number for SMS or WhatsApp alerts."
  }
  if (form.notifyEmail && !/^\S+@\S+\.\S+$/.test(form.alertEmail)) {
    return "Add a valid email address for alerts."
  }
  return null
}

export default function AdminSettingsPage() {
  const { profile } = useAuth()
  const { data: facility } = useFacility()
  const { data: settings } = useThresholds()
  const produce = useProduceTypes()

  const saveFacility = useSaveFacility()
  const saveSettings = useSaveThresholds()
  const addProduce = useAddProduce()

  /** Edits the user has made. Null means "nothing touched yet". */
  const [draft, setDraft] = useState<FormState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [newProduce, setNewProduce] = useState("")

  // Derived from what the server returned, so there is no effect copying
  // fetched data into state and no cascading render when it arrives.
  const baseline = useMemo<FormState>(() => {
    if (!facility || !settings) return EMPTY
    return {
      facilityName: facility.name,
      location: facility.location ?? "",
      capacityTonnes: String(facility.capacityKg / 1000),
      temperatureMin: String(settings.temperatureMinC),
      temperatureMax: String(settings.temperatureMaxC),
      humidityMin: String(settings.humidityMinPct),
      humidityMax: String(settings.humidityMaxPct),
      tariffNaira: String(facility.tariffKoboPerTonneMonth / 100),
      notifySms: settings.notifySms,
      notifyWhatsapp: settings.notifyWhatsapp,
      notifyEmail: settings.notifyEmail,
      alertPhone: settings.alertPhone ?? "",
      alertEmail: settings.alertEmail ?? "",
    }
  }, [facility, settings])

  const form = draft ?? baseline
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(baseline)
  const saving = saveFacility.isPending || saveSettings.isPending

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setDraft((current) => ({ ...(current ?? baseline), [key]: value }))
    setSaved(false)
    setError(null)
  }

  async function handleSave() {
    const problem = validate(form)
    if (problem) {
      setError(problem)
      return
    }
    if (!facility || !settings) return

    try {
      // The tariff lives on the facility document, not beside the thresholds:
      // farmers can read the price and must never read the climate settings.
      await saveFacility.mutateAsync({
        name: form.facilityName.trim(),
        location: form.location.trim() || null,
        capacityKg: Number(form.capacityTonnes) * 1000,
        tariffKoboPerTonneMonth: Math.round(Number(form.tariffNaira) * 100),
      })

      await saveSettings.mutateAsync({
        temperatureMinC: Number(form.temperatureMin),
        temperatureMaxC: Number(form.temperatureMax),
        humidityMinPct: Math.round(Number(form.humidityMin)),
        humidityMaxPct: Math.round(Number(form.humidityMax)),
        notifySms: form.notifySms,
        notifyWhatsapp: form.notifyWhatsapp,
        notifyEmail: form.notifyEmail,
        alertPhone: form.alertPhone.trim() || null,
        alertEmail: form.alertEmail.trim() || null,
        updatedBy: profile?.id ?? null,
      })

      setDraft(null)
      setSaved(true)
    } catch (cause) {
      setError(toMessage(cause))
    }
  }

  return (
    <AppShell nav={adminNav} title="Settings" subtitle="Facility and system preferences">
      <Card>
        <CardHeader
          icon="warehouse"
          title="Facility"
          description="Basic details about the cold store."
        />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field label="Facility name" required>
            {(props) => (
              <Input
                {...props}
                value={form.facilityName}
                onChange={(event) => set("facilityName", event.target.value)}
              />
            )}
          </Field>
          <Field label="Location">
            {(props) => (
              <Input
                {...props}
                value={form.location}
                onChange={(event) => set("location", event.target.value)}
              />
            )}
          </Field>
          <Field label="Total capacity" hint="Drives the capacity ring on the dashboard.">
            {(props) => (
              <Input
                {...props}
                numeric
                suffix="t"
                value={form.capacityTonnes}
                onChange={(event) => set("capacityTonnes", event.target.value)}
              />
            )}
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon="nutrition"
          title="Produce"
          description="What this facility accepts into storage."
        />
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {produce.map((item) => (
              <span
                key={item}
                className="rounded-md border border-line-strong px-3 py-1 text-xs text-ink"
              >
                {item}
              </span>
            ))}
            {produce.length === 0 && <p className="text-xs text-ink-muted">Nothing listed yet.</p>}
          </div>

          <div className="flex gap-2">
            <div className="w-full max-w-xs">
              <Input
                placeholder="Add produce, then press Enter"
                value={newProduce}
                onChange={(event) => setNewProduce(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || !newProduce.trim() || !facility) return
                  event.preventDefault()
                  addProduce.mutate({ current: produce, name: newProduce.trim() })
                  setNewProduce("")
                }}
              />
            </div>
            <Button
              variant="outline"
              icon="add"
              loading={addProduce.isPending}
              disabled={!newProduce.trim() || !facility}
              onClick={() => {
                if (!facility) return
                addProduce.mutate({ current: produce, name: newProduce.trim() })
                setNewProduce("")
              }}
            >
              Add
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon="thermostat"
          title="Alert thresholds"
          description="Readings outside these bands raise an alert automatically."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Temperature min" hint="0.1° steps">
            {(props) => (
              <Input
                {...props}
                numeric
                suffix="°C"
                value={form.temperatureMin}
                onChange={(event) => set("temperatureMin", event.target.value)}
              />
            )}
          </Field>
          <Field label="Temperature max" hint="0.1° steps">
            {(props) => (
              <Input
                {...props}
                numeric
                suffix="°C"
                value={form.temperatureMax}
                onChange={(event) => set("temperatureMax", event.target.value)}
              />
            )}
          </Field>
          <Field label="Humidity min" hint="Whole percent">
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                max={100}
                step={1}
                numeric
                suffix="%"
                value={form.humidityMin}
                onChange={(event) => set("humidityMin", event.target.value)}
              />
            )}
          </Field>
          <Field label="Humidity max" hint="Whole percent">
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                max={100}
                step={1}
                numeric
                suffix="%"
                value={form.humidityMax}
                onChange={(event) => set("humidityMax", event.target.value)}
              />
            )}
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon="notifications"
          title="Alert notifications"
          description="How staff hear about an alert."
        />
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Toggle
              label="SMS"
              icon="sms"
              checked={form.notifySms}
              onChange={(value) => set("notifySms", value)}
            />
            <Toggle
              label="WhatsApp"
              icon="chat"
              checked={form.notifyWhatsapp}
              onChange={(value) => set("notifyWhatsapp", value)}
            />
            <Toggle
              label="Email"
              icon="mail"
              checked={form.notifyEmail}
              onChange={(value) => set("notifyEmail", value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Alert phone">
              {(props) => (
                <Input
                  {...props}
                  numeric
                  placeholder="080…"
                  disabled={!form.notifySms && !form.notifyWhatsapp}
                  value={form.alertPhone}
                  onChange={(event) => set("alertPhone", event.target.value)}
                />
              )}
            </Field>
            <Field label="Alert email">
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  placeholder="alerts@example.com"
                  disabled={!form.notifyEmail}
                  value={form.alertEmail}
                  onChange={(event) => set("alertEmail", event.target.value)}
                />
              )}
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon="payments"
          title="Tariff"
          description="Used to price storage on the payments page."
        />
        <CardBody className="max-w-xs">
          <Field label="Rate per tonne per month">
            {(props) => (
              <Input
                {...props}
                numeric
                suffix="₦"
                placeholder="15000"
                value={form.tariffNaira}
                onChange={(event) => set("tariffNaira", event.target.value)}
              />
            )}
          </Field>
        </CardBody>
      </Card>

      <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-4 rounded-lg border border-line bg-surface/95 p-4 shadow-raised backdrop-blur">
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

        <Button variant="outline" disabled={!dirty || saving} onClick={() => setDraft(null)}>
          Discard changes
        </Button>
        <Button disabled={!dirty} loading={saving} onClick={() => void handleSave()}>
          Save changes
        </Button>
      </div>
    </AppShell>
  )
}
