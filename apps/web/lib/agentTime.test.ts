import { describe, expect, it } from "vitest"
import { deltaLabel, engineerHue, formatDuration, runProgress, secondsSince, statusLine } from "./agentTime"

describe("formatDuration", () => {
  it("picks the two largest units", () => {
    expect(formatDuration(42)).toBe("42s")
    expect(formatDuration(12 * 60 + 5)).toBe("12m")
    expect(formatDuration(3600)).toBe("1h")
    expect(formatDuration(9 * 3600 + 15 * 60)).toBe("9h 15m")
    expect(formatDuration(3 * 86400 + 4 * 3600)).toBe("3d 4h")
  })
  it("never goes negative", () => {
    expect(formatDuration(-5)).toBe("0s")
  })
})

describe("secondsSince", () => {
  it("measures from an ISO timestamp", () => {
    const now = Date.parse("2026-11-09T10:00:00Z")
    expect(secondsSince("2026-11-09T09:58:00Z", now)).toBe(120)
    expect(secondsSince("2026-11-09T10:01:00Z", now)).toBe(0)
  })
})

describe("deltaLabel", () => {
  it("describes the change against the previous week", () => {
    expect(deltaLabel(5, 3)).toBe("2 more than the week before")
    expect(deltaLabel(1, 4)).toBe("3 less than the week before")
    expect(deltaLabel(2, 2)).toBe("Same as the week before")
    expect(deltaLabel(2, 0)).toBe("None the week before")
    expect(deltaLabel(0, 0)).toBe("Nothing yet in the last 14 days")
  })
  it("formats the difference", () => {
    expect(deltaLabel(3600, 1800, formatDuration)).toBe("30m more than the week before")
  })
})

describe("runProgress", () => {
  it("has no fraction without history", () => {
    expect(runProgress(300, null)).toEqual({ stageFraction: null, overdue: false })
  })
  it("compares elapsed time with the usual duration and never shows done", () => {
    expect(runProgress(150, 300).stageFraction).toBeCloseTo(0.5)
    expect(runProgress(1000, 300)).toEqual({ stageFraction: 0.95, overdue: true })
  })
})

describe("engineerHue", () => {
  it("is stable and in range", () => {
    expect(engineerHue("abc")).toBe(engineerHue("abc"))
    expect(engineerHue("some-engineer-id")).toBeGreaterThanOrEqual(0)
    expect(engineerHue("some-engineer-id")).toBeLessThan(360)
  })
})

describe("statusLine", () => {
  it("mentions only what is true", () => {
    expect(statusLine(3, 2, 0)).toBe("3 things need your OK. 2 runs are in progress.")
    expect(statusLine(1, 0, 1)).toBe("1 thing needs your OK. 1 queued for an engineer.")
    expect(statusLine(0, 0, 0)).toBe("Nothing is running and nothing is waiting on you.")
  })
})
