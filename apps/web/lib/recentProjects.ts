/**
 * Recently opened projects, per browser. A convenience only: it lives in
 * localStorage, may be empty (private mode, cleared storage), and the sidebar
 * falls back to the projects with the latest activity.
 */
export const RECENT_KEY = "gravel.recentProjects"
export const RECENT_EVENT = "gravel:recent-projects"
const KEEP = 10

/** Most recent first, without duplicates, capped. */
export function pushRecentId(ids: string[], id: string, keep = KEEP): string[] {
  return [id, ...ids.filter((x) => x !== id)].slice(0, keep)
}

/** Visited projects first (in visit order), then the rest by latest activity. */
export function orderRecent<T extends { id: string; updated_at: string }>(projects: T[], visited: string[], limit: number): T[] {
  const byId = new Map(projects.map((p) => [p.id, p]))
  const seen = visited.map((id) => byId.get(id)).filter((p): p is T => !!p)
  const rest = projects
    .filter((p) => !visited.includes(p.id))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  return [...seen, ...rest].slice(0, limit)
}

export function readRecentIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

export function rememberProject(id: string): void {
  try {
    const next = pushRecentId(readRecentIds(), id)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event(RECENT_EVENT))
  } catch {
    /* storage unavailable: the sidebar falls back to latest activity */
  }
}
