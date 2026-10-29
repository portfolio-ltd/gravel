import { describe, expect, it } from "vitest"
import { layoutGraph } from "./graphLayout"

describe("layoutGraph", () => {
  it("layers a DAG by longest path", () => {
    const { position } = layoutGraph(["a", "b", "c", "d"], [
      { source: "a", target: "b" }, { source: "b", target: "d" }, { source: "a", target: "c" }, { source: "c", target: "d" },
      { source: "a", target: "d" },
    ])
    expect(["a", "b", "c", "d"].map((id) => position.get(id)!.layer)).toEqual([0, 1, 1, 2])
  })

  it("places a source next to what it points at", () => {
    const { position } = layoutGraph(["a", "b", "c", "late"], [
      { source: "a", target: "b" }, { source: "b", target: "c" }, { source: "late", target: "c" },
    ])
    expect(position.get("late")!.layer).toBe(1)
  })

  it("breaks cycles into back edges and keeps every node", () => {
    const { position, backEdges } = layoutGraph(["build", "review"], [
      { source: "build", target: "review" }, { source: "review", target: "build" },
    ])
    expect(backEdges).toEqual(new Set(["review→build"]))
    expect(position.get("build")!.layer).toBe(0)
    expect(position.get("review")!.layer).toBe(1)
  })

  it("ignores self loops and unknown nodes", () => {
    const { layers } = layoutGraph(["x"], [{ source: "x", target: "x" }, { source: "x", target: "ghost" }])
    expect(layers).toEqual([["x"]])
  })
})
