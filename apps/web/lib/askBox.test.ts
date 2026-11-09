import { describe, expect, it } from "vitest"
import { splitRequest, TITLE_MAX } from "./askBox"

describe("splitRequest", () => {
  it("uses a short single line as the title", () => {
    expect(splitRequest("  Add rate limiting to the webhook endpoint ")).toEqual({
      title: "Add rate limiting to the webhook endpoint", description: "",
    })
  })
  it("keeps further lines as the description", () => {
    expect(splitRequest("Fix login bounce\nIt happens on Safari only.\n\nSee #20")).toEqual({
      title: "Fix login bounce", description: "It happens on Safari only.\n\nSee #20",
    })
  })
  it("shortens a long first line at a word and keeps the full text", () => {
    const long = "Research the fourteen most popular savings apps and compare their onboarding, fees, interest rates and how they explain risk"
    const out = splitRequest(long)
    expect(out.title.length).toBeLessThanOrEqual(TITLE_MAX + 1)
    expect(out.title.endsWith("…")).toBe(true)
    expect(long.startsWith(out.title.slice(0, -1))).toBe(true)
    expect(out.description).toBe(long)
  })
  it("returns nothing for blank input", () => {
    expect(splitRequest("   \n ")).toEqual({ title: "", description: "" })
  })
})
