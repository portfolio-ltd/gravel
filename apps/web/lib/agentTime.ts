/**
 * Small, pure helpers for the Home dashboard: durations, week-over-week
 * deltas, progress of a run in flight, and a stable colour per engineer.
 * Nothing here estimates what the API didn't measure.
 */

/** 42s · 12m · 1h 5m · 9h 15m · 3d 4h */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`
}

/** Seconds between an ISO timestamp and `now` (never negative). */
export function secondsSince(iso: string, now: number): number {
  return Math.max(0, (now - new Date(iso).getTime()) / 1000)
}

/**
 * "3 more than last week", "same as last week", "first this fortnight"…
 * `format` renders the absolute difference (e.g. a duration or money).
 */
export function deltaLabel(current: number, previous: number, format: (n: number) => string = String): string {
  if (current === 0 && previous === 0) return "Nothing yet in the last 14 days"
  if (previous === 0) return "None the week before"
  const diff = current - previous
  if (Math.abs(diff) < 1e-9) return "Same as the week before"
  return `${format(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than the week before`
}

export interface RunProgress {
  /** Fraction of the current stage done, 0–1, or null when there is no history to compare with */
  stageFraction: number | null
  /** Elapsed time is well past the usual duration for this stage */
  overdue: boolean
}

/**
 * How far along the current stage a run is, judged only against how long
 * this stage usually takes. Capped below 1 so a bar never looks finished
 * before the engineer reports.
 */
export function runProgress(elapsedSeconds: number, typicalSeconds: number | null): RunProgress {
  if (!typicalSeconds || typicalSeconds <= 0) return { stageFraction: null, overdue: false }
  return {
    stageFraction: Math.min(0.95, elapsedSeconds / typicalSeconds),
    overdue: elapsedSeconds > typicalSeconds * 1.5,
  }
}

/** A stable hue (0–359) for an engineer, so the same agent keeps its colour everywhere. */
export function engineerHue(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h % 360
}

/** Phase ids come lower-case ("grooming"); custom stage names are shown as written. */
export function stageLabel(name: string): string {
  return name ? name[0].toUpperCase() + name.slice(1) : name
}

export function greeting(hour: number): string {
  return hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
}

/** "3 things need your OK. 2 engineers are working." — only states what is true. */
export function statusLine(waiting: number, running: number, queued: number): string {
  const parts: string[] = []
  if (waiting > 0) parts.push(`${waiting} ${waiting === 1 ? "thing needs" : "things need"} your OK.`)
  if (running > 0) parts.push(`${running} ${running === 1 ? "run is" : "runs are"} in progress.`)
  if (queued > 0) parts.push(`${queued} queued for an engineer.`)
  return parts.length ? parts.join(" ") : "Nothing is running and nothing is waiting on you."
}
