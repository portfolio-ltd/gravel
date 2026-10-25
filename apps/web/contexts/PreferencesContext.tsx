"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { apiFetch } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import {
  applyPreferences,
  DEFAULT_PREFERENCES,
  normalizePreferences,
  readLocalPreferences,
  writeLocalPreferences,
  type OrgAppearance,
  type Preferences,
} from "@/lib/theme"

interface PreferencesContextValue {
  prefs: Preferences
  /** Shallow-merge a patch; nested objects (board, home) are replaced as given. */
  update: (patch: Partial<Preferences>) => void
  reset: () => void
  orgAppearance: OrgAppearance | null
  setOrgAppearance: (appearance: OrgAppearance | null) => void
  isDark: boolean
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)
const ORG_ACCENT_KEY = "gravel.orgAccent"

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [orgAppearance, setOrgAppearanceState] = useState<OrgAppearance | null>(null)
  const [isDark, setIsDark] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncedUser = useRef<string | null>(null)

  // Local preferences first (the boot script already painted them)
  useEffect(() => { setPrefs(readLocalPreferences()) }, [])

  // On sign-in, server preferences win — they follow the user across devices
  useEffect(() => {
    if (!user || syncedUser.current === user.id) return
    syncedUser.current = user.id
    if (user.preferences && Object.keys(user.preferences).length > 0) {
      const merged = normalizePreferences(user.preferences)
      setPrefs(merged)
      writeLocalPreferences(merged)
    }
  }, [user])

  useEffect(() => {
    applyPreferences(prefs, orgAppearance)
    setIsDark(document.documentElement.classList.contains("dark"))
    if (prefs.theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      applyPreferences(prefs, orgAppearance)
      setIsDark(mq.matches)
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [prefs, orgAppearance])

  const persist = useCallback((next: Preferences) => {
    writeLocalPreferences(next)
    if (!user) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      apiFetch("/api/users/me/preferences", { method: "PUT", body: JSON.stringify({ preferences: next }) })
        .catch(() => { /* stays local until the next successful save */ })
    }, 600)
  }, [user])

  const update = useCallback((patch: Partial<Preferences>) => {
    setPrefs((current) => {
      const next = normalizePreferences({ ...current, ...patch })
      persist(next)
      return next
    })
  }, [persist])

  const reset = useCallback(() => {
    setPrefs(DEFAULT_PREFERENCES)
    persist(DEFAULT_PREFERENCES)
  }, [persist])

  const setOrgAppearance = useCallback((appearance: OrgAppearance | null) => {
    setOrgAppearanceState(appearance)
    try {
      if (appearance?.accent) localStorage.setItem(ORG_ACCENT_KEY, appearance.accent)
      else localStorage.removeItem(ORG_ACCENT_KEY)
    } catch { /* ignore */ }
  }, [])

  const value = useMemo(
    () => ({ prefs, update, reset, orgAppearance, setOrgAppearance, isDark }),
    [prefs, update, reset, orgAppearance, setOrgAppearance, isDark],
  )
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider")
  return ctx
}
