const KEY = "gravel_active_org"

export function getActiveOrgId(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(KEY)
}

export function setActiveOrgId(orgId: string | null): void {
  if (typeof window === "undefined") return
  if (orgId) window.localStorage.setItem(KEY, orgId)
  else window.localStorage.removeItem(KEY)
}
