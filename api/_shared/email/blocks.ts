import { brandName, brandTagline, theme } from "./theme.ts"

const { brand, neutral, font, space, radius, status, width } = theme

/** Escape anything that came from the database before it meets the markup. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** `raw` opts a string out of escaping — used only for template variables. */
export const raw = (value: string) => ({ __raw: value }) as const
type Maybe = string | number | { __raw: string } | null | undefined
const out = (value: Maybe) =>
  value && typeof value === "object" && "__raw" in value ? value.__raw : esc(value)

export function heading(text: Maybe): string {
  return `<h1 style="margin:0 0 ${space[3]};font-family:${font.sans};font-size:20px;line-height:28px;font-weight:600;letter-spacing:-0.01em;color:${neutral[900]};">${out(text)}</h1>`
}

export function paragraph(text: Maybe, muted = false): string {
  return `<p style="margin:0 0 ${space[4]};font-family:${font.sans};font-size:15px;line-height:24px;font-weight:400;color:${muted ? neutral[500] : neutral[700]};">${out(text)}</p>`
}

export function button(label: string, href: Maybe): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${space[6]};">
    <tr>
      <td style="border-radius:${radius.md};background-color:${brand[600]};">
        <a href="${out(href)}"
           style="display:inline-block;padding:12px 24px;font-family:${font.sans};font-size:15px;font-weight:600;line-height:20px;color:${neutral[0]};text-decoration:none;border-radius:${radius.md};">
          ${esc(label)}
        </a>
      </td>
    </tr>
  </table>`
}

/** A label / value list. Values render in mono when they are an identifier. */
export function dataTable(rows: Array<{ label: string; value: Maybe; mono?: boolean }>): string {
  const body = rows
    .map(
      (row, index) => `
    <tr>
      <td style="padding:${space[3]} 0;${index ? `border-top:1px solid ${neutral[200]};` : ""}font-family:${font.sans};font-size:13px;line-height:20px;color:${neutral[500]};">${esc(row.label)}</td>
      <td align="right" style="padding:${space[3]} 0;${index ? `border-top:1px solid ${neutral[200]};` : ""}font-family:${row.mono ? font.mono : font.sans};font-size:${row.mono ? "13px" : "14px"};line-height:20px;font-weight:500;color:${neutral[900]};">${out(row.value)}</td>
    </tr>`,
    )
    .join("")

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:0 0 ${space[6]};border:1px solid ${neutral[200]};border-radius:${radius.lg};padding:${space[2]} ${space[4]};background-color:${neutral[50]};">
    ${body}
  </table>`
}

/** A one-line figure the reader should not miss — a total, a balance. */
export function figure(label: string, value: Maybe): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:0 0 ${space[6]};border-radius:${radius.lg};background-color:${brand[50]};">
    <tr>
      <td style="padding:${space[4]};">
        <div style="font-family:${font.sans};font-size:13px;line-height:20px;color:${brand[600]};">${esc(label)}</div>
        <div style="font-family:${font.mono};font-size:24px;line-height:32px;font-weight:600;color:${brand[800]};padding-top:${space[1]};">${out(value)}</div>
      </td>
    </tr>
  </table>`
}

/** A verification code, spaced for reading aloud over the phone. */
export function codeBlock(code: Maybe): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:0 0 ${space[4]};border:1px solid ${brand[200]};border-radius:${radius.lg};background-color:${brand[50]};">
    <tr>
      <td align="center" style="padding:${space[6]} ${space[4]};">
        <div style="font-family:${font.mono};font-size:30px;line-height:36px;font-weight:600;letter-spacing:8px;color:${brand[800]};">${out(code)}</div>
      </td>
    </tr>
  </table>`
}

export type CalloutTone = "neutral" | "ok" | "warn" | "critical"

export function callout(text: Maybe, tone: CalloutTone = "neutral"): string {
  const palette = {
    neutral: { bg: neutral[100], fg: neutral[700], bar: neutral[300] },
    ok: { bg: status.okSoft, fg: status.ok, bar: status.ok },
    warn: { bg: status.warnSoft, fg: status.warn, bar: status.warn },
    critical: { bg: status.criticalSoft, fg: status.critical, bar: status.critical },
  }[tone]

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${space[6]};">
    <tr>
      <td style="padding:${space[3]} ${space[4]};background-color:${palette.bg};border-left:3px solid ${palette.bar};border-radius:0 ${radius.md} ${radius.md} 0;font-family:${font.sans};font-size:14px;line-height:22px;color:${palette.fg};">
        ${out(text)}
      </td>
    </tr>
  </table>`
}

export function divider(): string {
  return `<div style="height:1px;background-color:${neutral[200]};margin:0 0 ${space[6]};"></div>`
}

/** Small print under the main message — link fallback, support line. */
export function fineprint(text: Maybe): string {
  return `<p style="margin:0 0 ${space[2]};font-family:${font.sans};font-size:12px;line-height:19px;color:${neutral[400]};word-break:break-all;">${out(text)}</p>`
}

/**
 * The shell every email shares: brand bar, white card, footer.
 * `preview` is the line inboxes show next to the subject.
 */
export function shell(options: { title: string; preview: string; body: string }): string {
  const { title, preview, body } = options

  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${esc(title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>
      @media only screen and (max-width: 600px) {
        .wrap { width: 100% !important; }
        .pad { padding-left: 24px !important; padding-right: 24px !important; }
      }
      a { color: ${brand[600]}; }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${neutral[100]};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preview)}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:${neutral[100]};padding:${space[8]} ${space[4]};">
      <tr>
        <td align="center">
          <table role="presentation" class="wrap" width="${width}" cellpadding="0" cellspacing="0" border="0"
                 style="width:${width};max-width:100%;">

            <!-- Brand -->
            <tr>
              <td class="pad" style="padding:0 ${space[8]} ${space[6]};">
                <span style="font-family:${font.sans};font-size:17px;font-weight:600;letter-spacing:-0.01em;color:${brand[600]};">${brandName}</span>
              </td>
            </tr>

            <!-- Card -->
            <tr>
              <td style="background-color:${neutral[0]};border:1px solid ${neutral[200]};border-radius:${radius.lg};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr><td style="height:4px;background-color:${brand[600]};border-radius:${radius.lg} ${radius.lg} 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
                  <tr>
                    <td class="pad" style="padding:${space[8]};">
                      ${body}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td class="pad" style="padding:${space[6]} ${space[8]};">
                <p style="margin:0 0 ${space[1]};font-family:${font.sans};font-size:12px;line-height:19px;color:${neutral[500]};">
                  ${brandName} — ${brandTagline}
                </p>
                <p style="margin:0;font-family:${font.sans};font-size:12px;line-height:19px;color:${neutral[400]};">
                  This message was sent to you because you hold an account with the facility.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/** Plain-text twin. Some recipients, and every spam filter, read this one. */
export function textVersion(lines: Array<string | null | undefined>): string {
  return [...lines.filter(Boolean), "", `— ${brandName}`].join("\n")
}
