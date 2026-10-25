"use client"

import Cookies from "js-cookie"

const REFRESH_KEY = "gravel_refresh"

// Access token: in-memory only (never persisted, cleared on page unload)
let _accessToken: string | null = null

export function setTokens(access: string, refresh: string): void {
  _accessToken = access
  Cookies.set(REFRESH_KEY, refresh, {
    expires: 30,
    sameSite: "strict",
    // Key off the actual transport, not the build mode: a production build
    // served over plain http (Docker on localhost/LAN) must not set Secure,
    // or the browser drops the cookie and login silently bounces.
    secure: typeof window !== "undefined" && window.location.protocol === "https:",
  })
}

export function getAccessToken(): string | null {
  return _accessToken
}

export function getRefreshToken(): string | null {
  return Cookies.get(REFRESH_KEY) ?? null
}

export function clearTokens(): void {
  _accessToken = null
  Cookies.remove(REFRESH_KEY)
}

export function hasRefreshToken(): boolean {
  return !!Cookies.get(REFRESH_KEY)
}
