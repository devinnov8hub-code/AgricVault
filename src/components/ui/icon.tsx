import { cn } from "@/lib/cn"

export interface IconProps {
  /** A Material Symbols Rounded name, e.g. "check_circle". See fonts.google.com/icons. */
  name: string
  /** Solid rather than outlined. Reserve it for the selected or active state. */
  filled?: boolean
  className?: string
}

export function Icon({ name, filled = false, className }: IconProps) {
  return (
    <span aria-hidden="true" className={cn("icon", filled && "icon-filled", className)}>
      {name}
    </span>
  )
}
