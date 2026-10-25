"use client"

import { Toaster } from "sonner"
import { usePreferences } from "@/contexts/PreferencesContext"

export default function ThemedToaster() {
  const { isDark } = usePreferences()
  return <Toaster richColors position="top-right" theme={isDark ? "dark" : "light"} closeButton />
}
