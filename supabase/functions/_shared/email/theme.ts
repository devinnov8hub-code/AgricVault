/**
 * Email design tokens.
 *
 * These mirror src/styles/tokens.css. Email clients strip <style> blocks
 * unpredictably, so every value here is inlined at render time rather than
 * referenced as a CSS variable.
 *
 * Restraint rules, same as the app: one brand colour, neutral greys, status
 * colours for state only, and a 4 / 8 / 12 / 16 / 24 / 32 spacing scale.
 */

export const theme = {
  brand: {
    50: "#F7F2FB",
    100: "#EFE4F6",
    200: "#DCC6EA",
    400: "#9D5CCB",
    600: "#6A3A8C",
    800: "#402255",
  },
  neutral: {
    0: "#FFFFFF",
    50: "#FAFAFB",
    100: "#F4F4F6",
    200: "#E8E8EC",
    300: "#D4D4DA",
    400: "#A1A1AC",
    500: "#71717D",
    700: "#3F3F46",
    900: "#18181C",
  },
  status: {
    ok: "#1C7C54",
    okSoft: "#E9F4EF",
    warn: "#B45309",
    warnSoft: "#FDF2E5",
    critical: "#B42318",
    criticalSoft: "#FBEBE9",
  },
  font: {
    /* Gmail ignores web fonts, so the fallback stack has to stand on its own. */
    sans: "'Archivo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
  space: { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 6: "24px", 8: "32px" },
  radius: { sm: "6px", md: "8px", lg: "12px" },
  width: "560px",
} as const

export const brandName = "AgriVault"
export const brandTagline = "Cold storage, accounted for."
