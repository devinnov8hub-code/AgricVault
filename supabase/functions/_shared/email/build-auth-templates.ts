/**
 * Generates the Supabase Auth (GoTrue) email templates from the same design
 * blocks the transactional emails use, so there is one source of truth for how
 * AgriVault mail looks.
 *
 *   npm run emails:auth
 *
 * It reads and writes through node: built-ins, so it runs under both Node and
 * Deno. Output lands in supabase/templates/ and is committed, so a checkout
 * works without running anything. Re-run after changing blocks.ts or theme.ts.
 *
 * GoTrue substitutes {{ .ConfirmationURL }}, {{ .Token }}, {{ .Email }} and
 * friends at send time, so those are passed through `raw` rather than escaped.
 */

import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  button,
  callout,
  codeBlock,
  divider,
  fineprint,
  heading,
  paragraph,
  raw,
  shell,
} from "./blocks.ts"

const CONFIRMATION_URL = raw("{{ .ConfirmationURL }}")
const TOKEN = raw("{{ .Token }}")
const EMAIL = raw("{{ .Email }}")
const NEW_EMAIL = raw("{{ .NewEmail }}")
const SITE_URL = raw("{{ .SiteURL }}")

const ignoreLine =
  "If you did not ask for this, ignore this email — nothing will change on your account."

const templates: Record<string, string> = {
  // --------------------------------------------------------------------------
  "confirm-signup": shell({
    title: "Confirm your email",
    preview: "One tap to confirm your email and finish signing up.",
    body: [
      heading("Confirm your email"),
      paragraph(
        "Thanks for signing up to AgriVault. Confirm this address and your account is ready to use.",
      ),
      button("Confirm my email", CONFIRMATION_URL),
      paragraph("Or enter this code in the app:", true),
      codeBlock(TOKEN),
      divider(),
      paragraph(ignoreLine, true),
      fineprint(raw("If the button does not open, paste this link: {{ .ConfirmationURL }}")),
    ].join(""),
  }),

  // --------------------------------------------------------------------------
  invite: shell({
    title: "You have been invited to AgriVault",
    preview: "Accept the invitation and set your password.",
    body: [
      heading("You have been invited"),
      paragraph(
        raw(
          "The facility has invited {{ .Email }} to AgriVault, where you can follow your produce in cold storage, request withdrawals and settle storage fees.",
        ),
      ),
      button("Accept the invitation", CONFIRMATION_URL),
      callout("You will be asked to set a password before you can sign in."),
      fineprint(raw("If the button does not open, paste this link: {{ .ConfirmationURL }}")),
    ].join(""),
  }),

  // --------------------------------------------------------------------------
  "magic-link": shell({
    title: "Your sign-in link",
    preview: "A single-use link to sign in to AgriVault.",
    body: [
      heading("Sign in to AgriVault"),
      paragraph("Use the link below to sign in. It works once, and only for a short while."),
      button("Sign me in", CONFIRMATION_URL),
      paragraph("Or enter this code in the app:", true),
      codeBlock(TOKEN),
      divider(),
      paragraph(ignoreLine, true),
      fineprint(raw("If the button does not open, paste this link: {{ .ConfirmationURL }}")),
    ].join(""),
  }),

  // --------------------------------------------------------------------------
  recovery: shell({
    title: "Reset your password",
    preview: "Set a new password for your AgriVault account.",
    body: [
      heading("Reset your password"),
      paragraph(
        raw(
          "We received a request to reset the password for {{ .Email }}. Choose a new one using the link below.",
        ),
      ),
      button("Choose a new password", CONFIRMATION_URL),
      paragraph("Or enter this code in the app:", true),
      codeBlock(TOKEN),
      callout("This link expires in one hour and can be used once.", "warn"),
      paragraph(
        "If you did not ask to reset your password, ignore this email. Your current password still works.",
        true,
      ),
      fineprint(raw("If the button does not open, paste this link: {{ .ConfirmationURL }}")),
    ].join(""),
  }),

  // --------------------------------------------------------------------------
  "email-change": shell({
    title: "Confirm your new email address",
    preview: "Confirm the change to your AgriVault sign-in address.",
    body: [
      heading("Confirm your new address"),
      paragraph(
        raw(
          "You asked to change the email on your AgriVault account from {{ .Email }} to {{ .NewEmail }}. Confirm the new address to finish.",
        ),
      ),
      button("Confirm the change", CONFIRMATION_URL),
      paragraph("Or enter this code in the app:", true),
      codeBlock(TOKEN),
      callout("Until this is confirmed, keep signing in with your existing address.", "warn"),
      paragraph(ignoreLine, true),
    ].join(""),
  }),

  // --------------------------------------------------------------------------
  reauthentication: shell({
    title: "Your verification code",
    preview: "Confirm it is you before this change goes through.",
    body: [
      heading("Confirm it is you"),
      paragraph("Enter this code to confirm the change you just asked for."),
      codeBlock(TOKEN),
      callout("The code expires in 10 minutes."),
      paragraph(
        "If you did not start this, close the page and change your password straight away.",
        true,
      ),
    ].join(""),
  }),
}

// Referenced so the linter sees every GoTrue variable in use.
void [EMAIL, NEW_EMAIL, SITE_URL]

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, "..", "..", "..", "templates")

await mkdir(outDir, { recursive: true })

for (const [name, html] of Object.entries(templates)) {
  await writeFile(join(outDir, `${name}.html`), `${html}\n`, "utf8")
  console.log(`wrote supabase/templates/${name}.html`)
}
