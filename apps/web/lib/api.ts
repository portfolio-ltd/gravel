"use client"

import { ApiError } from "@/types"
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./auth"
import { getActiveOrgId } from "./orgStore"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

let _refreshPromise: Promise<boolean> | null = null

async function _doRefresh(): Promise<boolean> {
  const rt = getRefreshToken()
  if (!rt) return false
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    })
    if (!res.ok) { clearTokens(); return false }
    const data = await res.json()
    // Refresh tokens rotate server-side — the old one is now revoked
    setTokens(data.access_token, data.refresh_token ?? rt)
    return true
  } catch {
    clearTokens()
    return false
  }
}

/** Single-flight session refresh, shared by the auth bootstrap and 401 retries.
 *  Refresh tokens rotate, so two concurrent refreshes would revoke each other. */
export async function refreshOnce(): Promise<boolean> {
  if (!_refreshPromise) {
    _refreshPromise = _doRefresh().finally(() => { _refreshPromise = null })
  }
  return _refreshPromise
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = getAccessToken()
  const orgId = getActiveOrgId()
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init.headers as object ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(orgId ? { "X-Org-Id": orgId } : {}),
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers })

  // A 401 without a token is a rejected credential (e.g. wrong password), not an expired session
  if (res.status === 401 && retry && token) {
    const ok = await refreshOnce()
    if (ok) return apiFetch(path, init, false)
    clearTokens()
    if (typeof window !== "undefined") window.location.href = "/login"
    throw new ApiError(401, "Session expired")
  }

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? detail
    } catch {}
    throw new ApiError(res.status, detail)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── Multipart (file upload) ───────────────────────────────────────────────────
export async function apiUpload<T = unknown>(path: string, formData: FormData): Promise<T> {
  const token = getAccessToken()
  const orgId = getActiveOrgId()
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(orgId ? { "X-Org-Id": orgId } : {}),
    },
    body: formData,
  })
  if (!res.ok) {
    let detail = res.statusText
    try { const b = await res.json(); detail = b.detail ?? detail } catch {}
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

// ── Authenticated downloads (blob responses) ──────────────────────────────────
/** Fetches a file-like response with the session headers (an <a href> can't carry them)
 *  and hands it to the browser as a download. */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const token = getAccessToken()
  const orgId = getActiveOrgId()
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(orgId ? { "X-Org-Id": orgId } : {}),
    },
  })
  if (!res.ok) throw new ApiError(res.status, res.status === 401 ? "Session expired — reload and try again" : `Download failed (${res.status})`)
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
