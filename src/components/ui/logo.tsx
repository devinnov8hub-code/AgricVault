import lockup from "@/assets/brand/agrivault-logo.png"
import mark from "@/assets/brand/agrivault-mark.png"
import { cn } from "@/lib/cn"

export interface LogoProps {
  /** "lockup" is the mark plus the wordmark; "mark" is the shield alone. */
  variant?: "lockup" | "mark"
  /** Height in Tailwind units. The width follows the artwork. */
  className?: string
  /** On the brand-coloured sidebar the artwork is knocked out to white. */
  inverted?: boolean
}

export function Logo({ variant = "lockup", className, inverted = false }: LogoProps) {
  return (
    <img
      src={variant === "mark" ? mark : lockup}
      alt="AgriVault"
      className={cn(
        "select-none object-contain object-left",
        // The artwork is a single deep purple, so a brightness/invert pass is a
        // clean knock-out — no second asset to keep in step.
        inverted && "brightness-0 invert",
        className,
      )}
    />
  )
}
