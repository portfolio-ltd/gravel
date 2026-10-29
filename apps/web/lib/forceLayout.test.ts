import { describe, expect, it } from "vitest"
import { Simulation } from "./forceLayout"

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe("Simulation", () => {
  it("is deterministic for the same input", () => {
    const make = () => {
      const s = new Simulation([{ id: "a" }, { id: "b" }, { id: "c" }], [{ source: "a", target: "b" }], { width: 400, height: 300 })
      s.run()
      return s.nodes.map((n) => [Math.round(n.x), Math.round(n.y)])
    }
    expect(make()).toEqual(make())
  })

  it("pulls linked nodes closer than unlinked ones and keeps everyone apart", () => {
    const s = new Simulation([{ id: "a" }, { id: "b" }, { id: "c" }], [{ source: "a", target: "b" }], { width: 400, height: 300 })
    s.run()
    const [a, b, c] = s.nodes
    expect(dist(a, b)).toBeLessThan(dist(a, c))
    expect(dist(a, b)).toBeLessThan(dist(b, c))
    expect(Math.min(dist(a, b), dist(a, c), dist(b, c))).toBeGreaterThan(12)
    expect(s.settled).toBe(true)
  })

  it("ignores edges to unknown nodes and self loops", () => {
    const s = new Simulation([{ id: "a" }], [{ source: "a", target: "ghost" }, { source: "a", target: "a" }], { width: 100, height: 100 })
    expect(() => s.run()).not.toThrow()
    expect(s.nodes[0].x).toBeGreaterThan(0)
  })

  it("holds a pinned node still and reheats", () => {
    const s = new Simulation([{ id: "a" }, { id: "b" }], [{ source: "a", target: "b" }], { width: 200, height: 200 })
    s.run()
    s.pin("a", 10, 10)
    s.reheat()
    expect(s.settled).toBe(false)
    s.run()
    expect(s.get("a")).toMatchObject({ x: 10, y: 10 })
    s.release("a")
    expect(s.get("a")!.fixed).toBe(false)
  })
})
