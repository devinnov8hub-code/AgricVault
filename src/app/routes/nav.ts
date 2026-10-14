import type { NavItem } from "@/components/layout/app-shell"

export const adminNav: NavItem[] = [
  { label: "Dashboard", icon: "dashboard", to: "/admin/dashboard", end: true },
  { label: "Users", icon: "group", to: "/admin/users" },
  { label: "Inventory", icon: "inventory_2", to: "/admin/inventory" },
  { label: "Monitoring", icon: "thermostat", to: "/admin/monitoring" },
  { label: "Payments", icon: "payments", to: "/admin/payments" },
  { label: "Settings", icon: "settings", to: "/admin/settings" },
]

export const farmerNav: NavItem[] = [
  { label: "Dashboard", icon: "dashboard", to: "/farmer/dashboard", end: true },
  { label: "Payments", icon: "payments", to: "/farmer/payments" },
  { label: "Settings", icon: "settings", to: "/farmer/settings" },
]
