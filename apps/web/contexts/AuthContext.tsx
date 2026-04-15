"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { User, TokenResponse, ApiError } from "@/types"
import { apiFetch } from "@/lib/api"
import { setTokens, clearTokens, hasRefreshToken, getRefreshToken } from "@/lib/auth"

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  signup: (name: string, email: string, password: string, role: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // On mount: try to restore session from refresh token
  useEffect(() => {
    async function restore() {
      if (!hasRefreshToken()) { setIsLoading(false); return }
      try {
        const rt = getRefreshToken()!
        const data = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/auth/refresh`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: rt }),
          }
        )
        if (!data.ok) throw new Error("Refresh failed")
        const json = await data.json()
        setTokens(json.access_token, rt)
        const me = await apiFetch<User>("/api/auth/me")
        setUser(me)
      } catch {
        clearTokens()
      } finally {
        setIsLoading(false)
      }
    }
    restore()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const data = await apiFetch<TokenResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })
      setTokens(data.access_token, data.refresh_token)
      const me = await apiFetch<User>("/api/auth/me")
      setUser(me)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof ApiError ? e.detail : "Login failed" }
    }
  }, [])

  const signup = useCallback(async (name: string, email: string, password: string, role: string) => {
    try {
      const data = await apiFetch<TokenResponse>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      })
      setTokens(data.access_token, data.refresh_token)
      const me = await apiFetch<User>("/api/auth/me")
      setUser(me)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof ApiError ? e.detail : "Signup failed" }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      const rt = getRefreshToken()
      if (rt) {
        await apiFetch("/api/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refresh_token: rt }),
        })
      }
    } catch {}
    clearTokens()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
