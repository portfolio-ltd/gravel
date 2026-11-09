import { describe, expect, it } from "vitest"
import { orderRecent, pushRecentId } from "./recentProjects"

describe("pushRecentId", () => {
  it("moves a project to the front without duplicates and caps the list", () => {
    expect(pushRecentId(["a", "b", "c"], "b")).toEqual(["b", "a", "c"])
    expect(pushRecentId(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"])
  })
})

describe("orderRecent", () => {
  const projects = [
    { id: "a", updated_at: "2026-11-01T00:00:00Z" },
    { id: "b", updated_at: "2026-11-05T00:00:00Z" },
    { id: "c", updated_at: "2026-11-03T00:00:00Z" },
  ]
  it("puts visited projects first, then latest activity", () => {
    expect(orderRecent(projects, ["a"], 3).map((p) => p.id)).toEqual(["a", "b", "c"])
  })
  it("ignores visits to projects that no longer exist", () => {
    expect(orderRecent(projects, ["gone", "c"], 2).map((p) => p.id)).toEqual(["c", "b"])
  })
})
