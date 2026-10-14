# AgriVault

Cold storage management for farm produce — inventory, climate monitoring,
withdrawals and payments, for a facility and the farmers who store with it.

**React + TypeScript + Vite** on the front, **Firebase** on the back, deployed
to **Vercel**.

---

## Do I need to run migration files?

**No.** There are none, and there is nothing to run against Firebase.

Firestore is schemaless — collections appear the first time you write to them.
What SQL did with a migration, this project does with one script:

```bash
npm run seed
```

That creates the accounts, the facility settings, the cold rooms and the device
mapping. Run it once. It is safe to run again; nothing duplicates.

The one thing you **do** have to deploy is the security rules, because those are
not data:

```bash
npm run rules:deploy
```

---

## How the pieces fit

Firebase does two separate jobs here, and it helps to keep them apart:

```
  ┌──────────────┐        ┌───────────────────────┐
  │  Sensor rig  │ writes │  Realtime Database    │   ← IoT. Latest value only.
  │  (embedded)  │───────▶│  store_001/data       │     Your engineer owns this.
  └──────────────┘        │  store_001/settings   │
                          └───────────┬───────────┘
                                      │ every 5 min
                                      │ /api/sync-readings
                                      ▼
  ┌──────────────┐        ┌───────────────────────┐
  │  Browser     │◀──────▶│  Firestore            │   ← The database. History,
  │  (React)     │  rules │  profiles, payments,  │     records, money.
  └──────────────┘        │  batches, readings…   │
         │                └───────────────────────┘
         │                ┌───────────────────────┐
         └───────────────▶│  Firebase Auth        │   ← Sign-in, verification.
                          └───────────────────────┘
```

**Realtime Database** is the IoT side. The rig writes one node per cold room and
only ever holds the *latest* reading — it is a live register, not a history.

**Firestore** is the database. Everything the business runs on lives here.

**`/api/sync-readings`** is the bridge. Every five minutes it reads the RTDB
node, appends the reading to Firestore, raises an alert if the room is outside
its band, and updates the one-word verdict farmers are allowed to see.

A rig can also post straight to Firestore-side logic later; today the bridge is
the only path, and it is the only thing that writes sensor data.

---

## Running it locally

```bash
npm install
cp .env.example .env     # then fill in the blanks — see below
npm run seed             # one time: creates accounts and facility config
npm run rules:deploy     # one time: publishes the security rules
npm run dev
```

### Filling in `.env`

The file ships with the public Firebase values already filled. You need to add
four secrets:

| Variable | Where to get it |
| --- | --- |
| *the service account* | See below — you probably do not need to set a variable at all. |
| `RESEND_API_KEY` | [resend.com/api-keys](https://resend.com/api-keys) |
| `RESEND_FROM` | `AgriVault <onboarding@resend.dev>` works for testing; use your own verified domain for real mail. |
| `SYNC_KEY` | Any long random string: `openssl rand -hex 32` |

#### The service account — the easy way

Console → Project settings → Service accounts → **Generate new private key**.
That downloads a `.json` file. **Put it next to `package.json` and stop there** —
`npm run seed` finds it by itself, and `.gitignore` already excludes
`*firebase-adminsdk*.json` so it will not be committed.

Pasting a 2 KB JSON blob onto one line in `.env` also works, and is what Vercel
needs since there is no file to point at there. But locally, the file is easier
and harder to get wrong.

> **Windows:** if you create or edit `.env` with PowerShell redirection, it is
> saved as **UTF-16**, which most `.env` parsers read as gibberish and then
> report your variables as missing. The scripts here detect and decode it, and
> will say so — but saving as UTF-8 avoids the question entirely.

> **Why the `VITE_` split matters.** Anything named `VITE_*` is compiled into the
> JavaScript every visitor downloads. The Firebase web config belongs there and
> is safe — it is public by design, and the security rules are what protect your
> data. The four secrets above must **never** get a `VITE_` prefix.

**Vite only reads `.env` at startup.** If you change it, stop the dev server with
`Ctrl+C` and run `npm run dev` again. This is the usual cause of "I set it but
nothing changed".

### Seeded accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@agrivault.ng` | `AgriVault@2026` |
| Farmer | `amina@agrivault.ng` | `Farmer@2026` |
| Farmer | `kelechi@agrivault.ng` | `Farmer@2026` |
| Farmer | `damilare@agrivault.ng` | `Farmer@2026` |
| Farmer | `mubarak@agrivault.ng` | `Farmer@2026` |

Confirmed in place, so they sign in without an inbox. Farmers who sign up
themselves go through the real verification flow. **Change these passwords
before anyone else can reach the app.**

---

## Deploying to Vercel

```bash
npm i -g vercel
vercel link
vercel --prod
```

Or connect the GitHub repo at [vercel.com/new](https://vercel.com/new) — it
detects Vite and `vercel.json` handles the rest.

### 1. Environment variables

Vercel → your project → **Settings → Environment Variables**. Add every line
from your `.env`, for **Production, Preview and Development**.

For `FIREBASE_SERVICE_ACCOUNT`, paste the JSON as one line. Vercel escapes the
newlines in the private key; the code puts them back.

### 2. Point the app at itself

After the first deploy you get a URL. Set two more variables and redeploy:

```
VITE_APP_URL=https://your-app.vercel.app
ALLOWED_ORIGINS=https://your-app.vercel.app
```

### 3. Tell Firebase about the domain

Firebase Console → **Authentication → Settings → Authorized domains** → add
`your-app.vercel.app`. Sign-in fails silently without this, which is a
frustrating hour if you do not know to look.

### 4. The cron

`vercel.json` already schedules `/api/sync-readings` every five minutes. Vercel
sends a bearer token matching `SYNC_KEY`, so make sure that variable is set in
Vercel too, or every run returns 401.

Cron needs a Pro plan. On Hobby, call the route yourself:

```bash
curl -X POST https://your-app.vercel.app/api/sync-readings -H "x-sync-key: $SYNC_KEY"
```

---

## Who sees what

**This is the part worth reading twice.**

Authorisation lives in `firestore.rules`, not in the React app. The route guards
are a convenience for the person using the app; the rules are what actually stop
someone reading data that is not theirs.

**Farmers never see hardware data.** No temperature, no humidity, no thresholds,
no device, no alerts. Instead they get one sentence:

> Your produce is being held within the facility's operating range.

That comes from `config/conditions`, a document holding a single word and a
timestamp, written by the sync route. No numbers ever reach a farmer.

Three decisions hold that line, and all three are easy to undo by accident:

1. **`config/facility` and `config/thresholds` are separate documents.** Firestore
   rules work per document, so the tariff a farmer needs and the climate settings
   they must not see cannot live together. Do not merge them.
2. **`devices` is its own collection, not fields on `storageUnits`.** Rooms are
   reference data anyone signed in can read; the rig is not.
3. **Collections with a `farmerId` use one `allow read` rule naming it.** That is
   not a style choice. Firestore refuses a list query unless it can *prove* every
   result would pass, which it can only do when the query filters on `farmerId`.
   Splitting it into `get` and `list` with a blanket `signedIn()` on `list` would
   hand every farmer the whole collection.

| Collection | Farmer | Admin |
| --- | --- | --- |
| `profiles` | own only | all |
| `config/facility` | read | write |
| `config/thresholds` | **no access** | read + write |
| `config/conditions` | read (verdict only) | read |
| `storageUnits` | read | write |
| `devices` | **no access** | read + write |
| `sensorReadings` | **no access** | read |
| `alerts` | **no access** | read + resolve |
| `storageBatches` | own only | all |
| `withdrawalRequests` | own, create only | all + decide |
| `payments` | own only | all |
| `notifications` | own only | own |
| `emailLog` | **no access** | read |

---

## What the database no longer does for you

Postgres enforced several rules that Firestore cannot. They now live in code,
and they are the things most likely to break quietly:

| Was | Now |
| --- | --- |
| `balance` and `status` as generated columns | `derivePayment()` in `src/lib/derive.ts`. **Every** payment write goes through it. |
| `CHECK (paid <= amount)` | The same function clamps, and `useRecordPayment` refuses an overpayment. |
| Trigger validating a withdrawal against stock | `useRequestWithdrawal`, inside a transaction, counting requests already in flight. |
| `SELECT … FOR UPDATE` on stock movement | `runTransaction` in `useDecideWithdrawal`. |
| Sequences for ST-/BK-/WD-/RC- references | `nextReference()`, a transactional counter — two clerks cannot get the same storage ID. |
| Trigger raising alerts on a bad reading | `raiseAlerts()` in `api/sync-readings.ts`. |

If you add a write path, route it through these. A balance computed by hand is
how a farmer's money quietly goes wrong.

---

## Email

Two separate senders, one design.

**Firebase Auth** sends verification and password-reset mail from its own
templates. Generate them and paste them in once:

```bash
npm run emails:auth
```

Then Firebase Console → **Authentication → Templates** → paste each file from
`email-templates/` into the HTML editor.

**`/api/send-email`** sends everything else through Resend — receipts,
reminders, withdrawal decisions, climate alerts — and logs every attempt to
`emailLog`, success or failure. Templates live in `api/_shared/email/templates.ts`
with typed payloads, so a template and its caller cannot drift apart.

---

## Layout

```
src/
  app/            entry, providers, router, route guards, navigation
  components/
    ui/           the design system — button, field, card, table, badge, modal
    layout/       app shell: sidebar, topbar
  features/
    auth/         context, provider, sign-in / sign-up / verify / forgot
    account/      profile and password, shared by both roles
    admin/        dashboard, users, inventory, monitoring, payments, settings
    farmer/       dashboard, payments
    facility/     config, units, devices, conditions — queries
    inventory/    batches and the farmer directory — queries, QR tag
    monitoring/   readings, alerts, live listeners, climate chart
    payments/     payment queries and the receipt PDF
    withdrawals/  request and decision queries
    notifications/ the bell and its panel
  lib/            firebase client, env, formatting, derived rules, references
  styles/         tokens.css (the design system) and index.css
  types/          models.ts — the Firestore data model

api/              Vercel serverless routes
  _shared/        firebase-admin, http, resend, the email design system
  send-email.ts   renders a named template and sends it
  sync-readings.ts the RTDB → Firestore bridge, alerting, the farmer verdict

scripts/
  seed.ts                  one-time setup — this replaces migrations
  build-auth-templates.ts  generates the Firebase Auth email HTML

firestore.rules        the authorisation layer
firestore.indexes.json  composite indexes the queries need
database.rules.json     Realtime Database rules (IoT)
```

---

## Design rules

Three rules, in `src/styles/tokens.css`. The system reads as considered only
while they hold.

**Type.** Archivo throughout. IBM Plex Mono *only* for identifiers, money,
weights and sensor readings — never prose. Weights: 400 body, 500 emphasis,
600 headings, nothing else. Icons are Material Symbols Rounded.

**Colour.** One brand hue plus neutral greys. `ok`, `warn` and `critical` mean
state and are never decoration. Components use the semantic aliases
(`surface`, `ink`, `ink-muted`, `line`), not the raw ramp.

**Spacing.** 4, 8, 12, 16, 24, 32 — Tailwind steps `1 2 3 4 6 8`. Nothing in
between.

Status never gets hand-rolled: the badges in `components/ui/badge.tsx` are the
only place a domain state becomes a colour.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run typecheck` | Types only |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` | Prettier |
| `npm run seed` | One-time Firebase setup (replaces migrations) |
| `npm run rules:deploy` | Publish Firestore + RTDB rules and indexes |
| `npm run emails:auth` | Rebuild the Firebase Auth email templates |

---

## Troubleshooting

**The page is white and the console says "Missing environment variable".**
`.env` is missing or Vite has not reloaded it. Fill it in, then restart the dev
server — Vite reads `.env` only at startup.

**`npm run seed` says it cannot find the service account, but it is in `.env`.**
Run it again and read the whole message — it now prints which file it read, how
many variables it parsed and whether the encoding needed decoding. The usual
cause on Windows is a UTF-16 `.env`. The simplest fix either way: drop the
downloaded `*firebase-adminsdk*.json` next to `package.json` and run it again.

**"Missing or insufficient permissions."** The rules are not deployed, or you are
signed in as a farmer hitting an admin screen. Run `npm run rules:deploy`.

**Sign-in silently fails in production.** The Vercel domain is not in Firebase
Console → Authentication → Settings → Authorized domains.

**"The query requires an index."** The error links straight to a Create Index
button — or run `npm run rules:deploy`, which publishes
`firestore.indexes.json`.

**The admin dashboard shows no readings.** `/api/sync-readings` has not run.
Call it by hand with your `SYNC_KEY` and read what comes back — it reports every
device it tried.
#   A g r i c V a u l t  
 