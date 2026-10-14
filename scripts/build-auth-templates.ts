/**
 * Generates the Firebase Authentication email templates from the same design
 * blocks the transactional emails use, so all AgriVault mail looks like one
 * system.
 *
 *   npm run emails:auth
 *
 * Output lands in email-templates/ and is committed, so a fresh checkout works
 * without running anything.
 *
 * HOW TO USE THE OUTPUT
 * ---------------------
 * Firebase has no API for these — they are pasted in by hand, once:
 *
 *   Firebase Console → Authentication → Templates
 *     → Email address verification  → edit → paste verify-email.html
 *     → Password reset              → edit → paste reset-password.html
 *     → Email address change        → edit → paste change-email.html
 *
 * Click the pencil, switch the editor to HTML, paste, and save. Set the sender
 * name to AgriVault while you are there.
 *
 * Firebase substitutes these at send time, so they are passed through `raw`
 * rather than escaped:
 *
 *   %LINK%          the action URL
 *   %EMAIL%         the recipient
 *   %NEW_EMAIL%     the proposed new address (email-change only)
 *   %DISPLAY_NAME%  the person's name
 *   %APP_NAME%      the project's public name
 */

import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  button,
  callout,
  divider,
  fineprint,
  heading,
  paragraph,
  raw,
  shell,
} from "../api/_shared/email/blocks.ts"

const LINK = raw("%LINK%")
const EMAIL = raw("%EMAIL%")

const ignoreLine =
  "If you did not ask for this, ignore this email — nothing will change on your account."

const templates: Record<string, string> = {
  // -- Authentication → Email address verification ---------------------------
  "verify-email": shell({
    title: "Confirm your email",
    preview: "One tap to confirm your email and finish signing up.",
    body: [
      heading("Confirm your email"),
      paragraph(
        "Thanks for signing up to AgriVault. Confirm this address and your account is ready to use — you will be able to follow your produce in cold storage, request withdrawals and settle storage fees.",
      ),
      button("Confirm my email", LINK),
      divider(),
      paragraph(ignoreLine, true),
      fineprint(raw("If the button does not open, paste this link: %LINK%")),
    ].join(""),
  }),

  // -- Authentication → Password reset ---------------------------------------
  "reset-password": shell({
    title: "Reset your password",
    preview: "Set a new password for your AgriVault account.",
    body: [
      heading("Reset your password"),
      paragraph(
        raw(
          "We received a request to reset the password for %EMAIL%. Choose a new one using the link below.",
        ),
      ),
      button("Choose a new password", LINK),
      callout("This link expires in one hour and can be used once.", "warn"),
      paragraph(
        "If you did not ask to reset your password, ignore this email. Your current password still works.",
        true,
      ),
      fineprint(raw("If the button does not open, paste this link: %LINK%")),
    ].join(""),
  }),

  // -- Authentication → Email address change ---------------------------------
  "change-email": shell({
    title: "Confirm your new email address",
    preview: "Confirm the change to your AgriVault sign-in address.",
    body: [
      heading("Confirm your new address"),
      paragraph(
        raw(
          "You asked to change the email on your AgriVault account from %EMAIL% to %NEW_EMAIL%. Confirm the new address to finish.",
        ),
      ),
      button("Confirm the change", LINK),
      callout("Until this is confirmed, keep signing in with your existing address.", "warn"),
      paragraph(ignoreLine, true),
      fineprint(raw("If the button does not open, paste this link: %LINK%")),
    ].join(""),
  }),
}

// Referenced so the linter sees every Firebase variable in use.
void EMAIL

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, "..", "email-templates")

await mkdir(outDir, { recursive: true })

for (const [name, html] of Object.entries(templates)) {
  await writeFile(join(outDir, `${name}.html`), `${html}\n`, "utf8")
  console.log(`wrote email-templates/${name}.html`)
}

console.log("\nPaste these into Firebase Console → Authentication → Templates (HTML editor).")
