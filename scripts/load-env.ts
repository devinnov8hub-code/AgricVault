/**
 * Load .env for the local scripts, and find the service-account credential.
 *
 * This is deliberately forgiving, because the two things that go wrong here
 * both go wrong silently:
 *
 *  1. ENCODING. Windows PowerShell writes files as UTF-16 LE by default, and
 *     Notepad offers "UTF-8 with BOM". Read either as UTF-8 and you get
 *     "F\0I\0R\0E..." or a leading ﻿, and a naive parser matches nothing
 *     while the file looks perfectly fine in an editor.
 *
 *  2. THE SERVICE ACCOUNT. Pasting a 2 KB JSON blob onto one line is awkward
 *     on any platform and miserable on Windows. So pointing at the downloaded
 *     .json file works too, and a file sitting in the project root is found
 *     without being told.
 *
 * Everything here reports what it actually found. A setup script that says
 * "missing" when the value is right there in the file is worse than no script.
 */

import { readdirSync, readFileSync } from "node:fs"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import dotenv from "dotenv"

const here = dirname(fileURLToPath(import.meta.url))
export const projectRoot = resolve(here, "..")

/** Read a text file whatever Windows encoded it as. */
function readText(path: string): string {
  const buffer = readFileSync(path)

  // UTF-16 LE / BE, with or without a byte-order mark.
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString("utf16le").slice(1)
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return buffer.swap16().toString("utf16le").slice(1)
  }
  // PowerShell 5.1 often writes UTF-16 with no BOM at all: every other byte is
  // a NUL. Detecting that is the difference between "works" and "mysteriously
  // does nothing".
  if (buffer.length > 1 && buffer[1] === 0x00 && buffer[0] !== 0x00) {
    return buffer.toString("utf16le")
  }

  // UTF-8, BOM stripped.
  return buffer.toString("utf8").replace(/^﻿/, "")
}

export interface EnvReport {
  path: string
  found: boolean
  keys: string[]
  encodingNote?: string
}

/** Parse .env into process.env without overwriting anything already set. */
export function loadEnv(): EnvReport {
  const path = join(projectRoot, ".env")

  if (!existsSync(path)) {
    return { path, found: false, keys: [] }
  }

  const raw = readFileSync(path)
  const text = readText(path)
  const parsed = dotenv.parse(text)

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value
    }
  }

  const wasUtf16 = raw.length > 1 && raw[1] === 0x00 && raw[0] !== 0x00
  const hadBom = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf

  return {
    path,
    found: true,
    keys: Object.keys(parsed),
    encodingNote: wasUtf16
      ? "the file is UTF-16 (PowerShell's default) — decoded it, but UTF-8 is safer"
      : hadBom
        ? "the file has a UTF-8 BOM — handled, but UTF-8 without BOM is safer"
        : undefined,
  }
}

/* -------------------------------------------------------------------------- */

export interface ServiceAccount {
  projectId: string
  clientEmail: string
  privateKey: string
}

export interface CredentialResult {
  account: ServiceAccount
  /** Where it came from, for the console line that confirms it worked. */
  source: string
}

function parseServiceAccount(json: string, source: string): CredentialResult {
  let parsed: Record<string, string>
  try {
    parsed = JSON.parse(json) as Record<string, string>
  } catch {
    throw new Error(
      `The service account from ${source} is not valid JSON.\n` +
        `If you pasted it into .env, the value must be the WHOLE file on one line.\n` +
        `Easier: save the .json file in the project folder and this script will find it.`,
    )
  }

  if (!parsed.private_key || !parsed.client_email || !parsed.project_id) {
    throw new Error(
      `The service account from ${source} is missing fields.\n` +
        `Expected project_id, client_email and private_key — got: ${Object.keys(parsed).join(", ")}`,
    )
  }

  return {
    source,
    account: {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      // Stored escaped in most environments; put the newlines back.
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    },
  }
}

/**
 * Find the service account, trying the easy routes first:
 *
 *   1. FIREBASE_SERVICE_ACCOUNT        — the JSON inline (how Vercel wants it)
 *   2. FIREBASE_SERVICE_ACCOUNT_PATH   — a path to the .json file
 *   3. GOOGLE_APPLICATION_CREDENTIALS  — the Google standard variable
 *   4. any *firebase-adminsdk*.json sitting in the project root
 */
export function findServiceAccount(): CredentialResult {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT?.trim()
  if (inline) return parseServiceAccount(inline, "FIREBASE_SERVICE_ACCOUNT")

  for (const variable of ["FIREBASE_SERVICE_ACCOUNT_PATH", "GOOGLE_APPLICATION_CREDENTIALS"]) {
    const path = process.env[variable]?.trim()
    if (!path) continue

    const full = resolve(projectRoot, path)
    if (!existsSync(full)) {
      throw new Error(`${variable} points at ${full}, but there is no file there.`)
    }
    return parseServiceAccount(readText(full), `${variable} (${path})`)
  }

  // Last resort: the file people actually download tends to land right here.
  const candidates = readdirSync(projectRoot).filter(
    (name) => name.endsWith(".json") && /firebase-adminsdk|serviceaccount/i.test(name),
  )

  if (candidates.length === 1) {
    const name = candidates[0]!
    return parseServiceAccount(readText(join(projectRoot, name)), `${name} (found in project root)`)
  }

  if (candidates.length > 1) {
    throw new Error(
      `Found several service-account files: ${candidates.join(", ")}.\n` +
        `Say which one in .env:  FIREBASE_SERVICE_ACCOUNT_PATH=./${candidates[0]}`,
    )
  }

  throw new Error("NO_CREDENTIAL")
}

/** The message shown when no credential is found — it says what it looked at. */
export function credentialHelp(report: EnvReport): string {
  const lines: string[] = []

  lines.push("Could not find your Firebase service account.\n")

  if (!report.found) {
    lines.push(`  There is no .env file at ${report.path}`)
    lines.push("  Create one:   cp .env.example .env     (PowerShell: copy .env.example .env)\n")
  } else {
    lines.push(`  Read ${report.path}`)
    lines.push(`  Found ${report.keys.length} variable(s): ${report.keys.join(", ") || "none"}`)
    if (report.encodingNote) lines.push(`  Note: ${report.encodingNote}`)
    lines.push("")

    const present = report.keys.includes("FIREBASE_SERVICE_ACCOUNT")
    if (present) {
      lines.push("  FIREBASE_SERVICE_ACCOUNT is in the file but empty.\n")
    }
  }

  lines.push("EASIEST FIX — point at the file instead of pasting JSON:")
  lines.push("")
  lines.push("  1. Firebase Console → Project settings → Service accounts")
  lines.push("  2. Generate new private key → it downloads a .json file")
  lines.push("  3. Put that file in this folder (next to package.json)")
  lines.push("  4. npm run seed    ← it will find it automatically")
  lines.push("")
  lines.push("  The .gitignore already excludes *firebase-adminsdk*.json, so it")
  lines.push("  will not be committed. Never commit it — it bypasses every")
  lines.push("  security rule on your project.")
  lines.push("")
  lines.push("Or name it explicitly in .env:")
  lines.push("")
  lines.push("  FIREBASE_SERVICE_ACCOUNT_PATH=./agrivault-1a19d-firebase-adminsdk.json")

  return lines.join("\n")
}
