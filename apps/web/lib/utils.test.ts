import { describe, it, expect } from "vitest"
import { cn, getInitials, formatRelativeTime } from "./utils"

describe("cn", () => {
  it("merges conditional classes", () => {
    expect(cn("a", false && "b", "c")).toBe("a c")
  })
  it("lets later tailwind classes win", () => {
    expect(cn("p-2", "p-4")).toBe("p-4")
  })
})

describe("getInitials", () => {
  it("takes the first letters of the first two words", () => {
    expect(getInitials("Frontend Pete")).toBe("FP")
    expect(getInitials("Ada")).toBe("A")
    expect(getInitials("One Two Three")).toBe("OT")
  })
})

describe("formatRelativeTime", () => {
  it("formats recent times", () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe("just now")
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5m ago")
    expect(formatRelativeTime(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe("3h ago")
  })
})
