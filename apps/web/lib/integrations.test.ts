import { describe, expect, it } from "vitest"
import { buildItems, filterItems, healthOf } from "./integrations"
import type { DeployEnvironment, GitIntegration } from "@/types"

const gh: GitIntegration = {
  id: "g1", owner_id: "u", provider: "github", name: "Acme GitHub", base_url: null, default_branch: "main",
  is_active: true, has_token: true, created_at: "", updated_at: "",
}
const aws: DeployEnvironment = {
  id: "d1", owner_id: "u", project_id: null, name: "production", provider: "aws", region: "us-east-1",
  is_active: true, has_config: false, created_at: "", updated_at: "",
}

describe("integrations catalog", () => {
  it("lists connections first, then providers not connected yet", () => {
    const items = buildItems([gh], [aws])
    expect(items.slice(0, 2).map((i) => i.type)).toEqual(["git", "deploy"])
    expect(items.some((i) => i.type === "available" && i.provider.id === "github")).toBe(false)
    expect(items.some((i) => i.type === "available" && i.provider.id === "gitlab")).toBe(true)
  })

  it("reports health from the stored credential and the active flag", () => {
    const [g, d] = buildItems([gh, { ...gh, id: "g2", is_active: false }], [aws])
    expect(healthOf(g)).toBe("connected")
    expect(healthOf(d)).toBe("disabled")
    expect(healthOf(buildItems([], [aws])[0])).toBe("incomplete")
  })

  it("filters by status, category and search", () => {
    const items = buildItems([gh], [aws])
    expect(filterItems(items, { status: "connected", category: "all", query: "" })).toHaveLength(2)
    expect(filterItems(items, { status: "all", category: "Cloud", query: "" }).every((i) => i.provider.category === "Cloud")).toBe(true)
    expect(filterItems(items, { status: "all", category: "all", query: "acme" }).map((i) => i.key)).toEqual(["git:g1"])
  })
})
