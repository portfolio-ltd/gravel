import { describe, expect, it } from "vitest"
import { assignLanes, layoutCanvas, loopsOfStage, unreachableStages } from "./workflowCanvas"
import type { WorkflowLoop, WorkflowStage } from "@/types"

function stage(id: string, order: number, extra: Partial<WorkflowStage> = {}): WorkflowStage {
  return {
    id, workflow_id: "w", name: id, stage_order: order, role: "custom", block_on_open_questions: false,
    assigned_engineer_id: null, requires_human_approval: false, is_ai_executable: true, stage_instructions: null,
    model: null, max_rework_attempts: 3, rework_target_stage_id: null, next_stage_id: null, harness_id: null,
    created_at: "", updated_at: "", ...extra,
  }
}

function loop(id: string, entry: string, check: string): WorkflowLoop {
  return {
    id, workflow_id: "w", name: id, goal: null, entry_stage_id: entry, check_stage_id: check, max_iterations: 3,
    max_cost_usd: null, on_exhausted: "ask_human", carry_feedback: true, created_at: "", updated_at: "",
  }
}

describe("assignLanes", () => {
  it("puts overlapping spans in different lanes and reuses lanes otherwise", () => {
    const out = assignLanes([{ from: 0, to: 2 }, { from: 1, to: 3 }, { from: 4, to: 5 }])
    const lane = (from: number) => out.find((e) => e.from === from)!.lane
    expect(lane(0)).not.toBe(lane(1))
    expect(lane(4)).toBe(0)
  })
})

describe("layoutCanvas", () => {
  it("draws the normal flow down the middle", () => {
    const { edges, nodes } = layoutCanvas([stage("b", 1), stage("a", 0), stage("c", 2)])
    expect(nodes.map((n) => n.id)).toEqual(["a", "b", "c"])
    expect(edges.filter((e) => e.kind === "flow").map((e) => [e.source, e.target])).toEqual([["a", "b"], ["b", "c"]])
  })

  it("routes skip edges and rework edges on the left", () => {
    const { edges } = layoutCanvas([
      stage("a", 0, { next_stage_id: "c" }), stage("b", 1), stage("c", 2, { rework_target_stage_id: "a" }),
    ])
    expect(edges.find((e) => e.kind === "success")).toMatchObject({ source: "a", target: "c", label: "on success" })
    expect(edges.find((e) => e.kind === "rework")).toMatchObject({ source: "c", target: "a", label: "rework ≤3" })
    expect(edges.some((e) => e.kind === "flow" && e.source === "a")).toBe(false)
  })

  it("a loop replaces its check stage's rework edge and gets a band", () => {
    const stages = [stage("build", 0), stage("test", 1, { rework_target_stage_id: "build" })]
    const { edges, bands, width } = layoutCanvas(stages, [loop("green", "build", "test")])
    expect(edges.some((e) => e.kind === "rework")).toBe(false)
    expect(edges.find((e) => e.kind === "loop")).toMatchObject({ source: "test", target: "build", loopId: "green" })
    expect(bands).toHaveLength(1)
    expect(width).toBeGreaterThan(layoutCanvas(stages).width - 1)
  })

  it("draws a one-stage loop as a self loop", () => {
    const { edges } = layoutCanvas([stage("polish", 0)], [loop("p", "polish", "polish")])
    expect(edges.find((e) => e.kind === "loop")?.path).toContain("V")
  })
})

describe("helpers", () => {
  it("finds stages nothing reaches", () => {
    const stages = [stage("a", 0, { next_stage_id: "c" }), stage("b", 1), stage("c", 2)]
    expect(unreachableStages(stages).map((s) => s.id)).toEqual(["b"])
  })

  it("names a stage's part in each loop", () => {
    const stages = [stage("a", 0), stage("b", 1), stage("c", 2)]
    const parts = (id: string) => loopsOfStage(id, stages, [loop("l", "a", "c")]).map((x) => x.part)
    expect(parts("a")).toEqual(["start"])
    expect(parts("b")).toEqual(["inside"])
    expect(parts("c")).toEqual(["check"])
  })
})
