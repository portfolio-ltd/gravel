import { describe, expect, it } from "vitest"
import { DEFAULT_PREFERENCES, HOME_WIDGETS, normalizeHomeWidgets } from "./theme"

const ALL = HOME_WIDGETS.map((w) => w.id as string)

describe("normalizeHomeWidgets", () => {
  it("uses the defaults when nothing is saved", () => {
    expect(normalizeHomeWidgets(undefined)).toEqual(DEFAULT_PREFERENCES.home)
  })

  it("adds a new widget to an old layout, next to the one before it", () => {
    const out = normalizeHomeWidgets({ widgets: ["attention", "metrics", "projects"] })
    expect(out.widgets).toEqual(["attention", "running", "metrics", "projects"])
    expect(out.known).toEqual(ALL)
  })

  it("does not bring back a widget the user hid after seeing it", () => {
    const out = normalizeHomeWidgets({ widgets: ["metrics"], known: ALL })
    expect(out.widgets).toEqual(["metrics"])
  })
})
