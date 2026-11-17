/**
 * Layout for the workflow canvas (components/workflow/WorkflowCanvas.tsx).
 *
 * Stages sit in one column in stage order. The normal flow runs straight down
 * the middle; success edges that skip or branch back, and rework edges, run in
 * lanes on the left; loops run in lanes on the right, from the check stage back
 * up to the loop's start. Pure and deterministic so it can be unit-tested.
 */
import type { WorkflowLoop, WorkflowStage } from "@/types"

export const NODE_W = 340
export const TAB_H = 26
export const CARD_H = 168
export const NODE_H = TAB_H + CARD_H
export const ROW_GAP = 64
export const LANE_W = 26
export const PAD = 32
const SIDE_LABEL_ROOM = 48 // half a lane label, so it never leaves the canvas
const LOOP_LABEL_ROOM = 92

export type EdgeKind = "flow" | "success" | "rework" | "loop"

export interface CanvasNode {
  id: string
  x: number
  y: number
}

export interface CanvasEdge {
  id: string
  kind: EdgeKind
  source: string
  target: string
  path: string
  label: string | null
  labelX: number
  labelY: number
  loopId?: string
}

export interface LoopBand {
  loopId: string
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasLayout {
  width: number
  height: number
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  bands: LoopBand[]
  /** Where the "add a stage" button goes, under the last stage */
  addY: number
  centerX: number
}

interface SideEdge {
  id: string
  kind: EdgeKind
  source: string
  target: string
  from: number
  to: number
  label: string | null
  loopId?: string
  lane: number
}

export function orderedStages(stages: WorkflowStage[]): WorkflowStage[] {
  return [...stages].sort((a, b) => a.stage_order - b.stage_order || a.id.localeCompare(b.id))
}

/** Greedy interval packing: shortest spans take the inner lanes. */
export function assignLanes<T extends { from: number; to: number }>(edges: T[]): (T & { lane: number })[] {
  const lanes: [number, number][][] = []
  const sorted = [...edges].sort((a, b) => Math.abs(a.to - a.from) - Math.abs(b.to - b.from))
  return sorted.map((e) => {
    const lo = Math.min(e.from, e.to)
    const hi = Math.max(e.from, e.to)
    let lane = lanes.findIndex((taken) => taken.every(([a, b]) => hi < a || lo > b))
    if (lane === -1) {
      lane = lanes.length
      lanes.push([])
    }
    lanes[lane].push([lo, hi])
    return { ...e, lane }
  })
}

/** An orthogonal path out of a node's side, along a lane, and into another node's side. */
function lanePath(x1: number, y1: number, laneX: number, y2: number, x2: number): string {
  const r = Math.min(8, Math.abs(y2 - y1) / 2, Math.abs(laneX - x1))
  const dx = laneX < x1 ? -1 : 1
  const dy = y2 < y1 ? -1 : 1
  return [
    `M ${x1} ${y1}`,
    `H ${laneX - dx * r}`,
    `Q ${laneX} ${y1} ${laneX} ${y1 + dy * r}`,
    `V ${y2 - dy * r}`,
    `Q ${laneX} ${y2} ${laneX - dx * r} ${y2}`,
    `H ${x2}`,
  ].join(" ")
}

export function layoutCanvas(stages: WorkflowStage[], loops: WorkflowLoop[] = []): CanvasLayout {
  const ordered = orderedStages(stages)
  const index = new Map(ordered.map((s, i) => [s.id, i]))
  const checks = new Set(loops.map((l) => l.check_stage_id))

  const flow: { source: string; target: string }[] = []
  const left: Omit<SideEdge, "lane">[] = []
  ordered.forEach((s, i) => {
    const next = s.next_stage_id && index.has(s.next_stage_id) ? s.next_stage_id : ordered[i + 1]?.id
    if (next && index.get(next) === i + 1) flow.push({ source: s.id, target: next })
    else if (next) left.push({ id: `success:${s.id}`, kind: "success", source: s.id, target: next, from: i, to: index.get(next)!, label: "on success" })
    if (s.rework_target_stage_id && index.has(s.rework_target_stage_id) && !checks.has(s.id)) {
      left.push({
        id: `rework:${s.id}`, kind: "rework", source: s.id, target: s.rework_target_stage_id,
        from: i, to: index.get(s.rework_target_stage_id)!, label: `rework ≤${s.max_rework_attempts}`,
      })
    }
  })
  const right: Omit<SideEdge, "lane">[] = loops
    .filter((l) => index.has(l.entry_stage_id) && index.has(l.check_stage_id))
    .map((l) => ({
      id: `loop:${l.id}`, kind: "loop" as const, source: l.check_stage_id, target: l.entry_stage_id,
      from: index.get(l.check_stage_id)!, to: index.get(l.entry_stage_id)!, label: `${truncate(l.name, 16)} ≤${l.max_iterations}`,
      loopId: l.id,
    }))

  const leftLanes = assignLanes(left)
  const rightLanes = assignLanes(right)
  const nLeft = leftLanes.length ? Math.max(...leftLanes.map((e) => e.lane)) + 1 : 0
  const nRight = rightLanes.length ? Math.max(...rightLanes.map((e) => e.lane)) + 1 : 0

  const nodeX = nLeft ? PAD + SIDE_LABEL_ROOM + (nLeft - 1) * LANE_W + 24 : PAD
  const nodeRight = nodeX + NODE_W
  const width = nRight ? nodeRight + 24 + (nRight - 1) * LANE_W + LOOP_LABEL_ROOM : nodeRight + PAD
  const centerX = nodeX + NODE_W / 2
  const top = (i: number) => PAD + i * (NODE_H + ROW_GAP)
  const mid = (i: number) => top(i) + TAB_H + CARD_H / 2

  const nodes = ordered.map((s, i) => ({ id: s.id, x: nodeX, y: top(i) }))
  const edges: CanvasEdge[] = []

  for (const f of flow) {
    const i = index.get(f.source)!
    const y1 = top(i) + NODE_H
    const y2 = top(i + 1) + TAB_H
    edges.push({ id: `flow:${f.source}`, kind: "flow", source: f.source, target: f.target,
      path: `M ${centerX} ${y1} V ${y2}`, label: null, labelX: centerX, labelY: (y1 + y2) / 2 })
  }
  for (const e of leftLanes) {
    const laneX = nodeX - 24 - e.lane * LANE_W
    const y1 = mid(e.from) + 14
    const y2 = mid(e.to) - 14
    edges.push({ id: e.id, kind: e.kind, source: e.source, target: e.target,
      path: lanePath(nodeX, y1, laneX, y2, nodeX), label: e.label, labelX: laneX, labelY: (y1 + y2) / 2 })
  }
  for (const e of rightLanes) {
    const laneX = nodeRight + 24 + e.lane * LANE_W
    const y1 = mid(e.from) + 18
    const y2 = mid(e.to) - 18
    edges.push({ id: e.id, kind: "loop", source: e.source, target: e.target, loopId: e.loopId,
      path: e.from === e.to ? selfLoop(nodeRight, mid(e.from), laneX) : lanePath(nodeRight, y1, laneX, y2, nodeRight),
      label: e.label, labelX: laneX, labelY: e.from === e.to ? mid(e.from) : (y1 + y2) / 2 })
  }

  const bands: LoopBand[] = loops
    .filter((l) => index.has(l.entry_stage_id) && index.has(l.check_stage_id))
    .filter((l) => index.get(l.entry_stage_id)! <= index.get(l.check_stage_id)!)
    .map((l) => {
      const a = index.get(l.entry_stage_id)!
      const b = index.get(l.check_stage_id)!
      return { loopId: l.id, x: nodeX - 10, y: top(a) - 10, width: NODE_W + 20, height: top(b) + NODE_H - top(a) + 20 }
    })

  const addY = ordered.length ? top(ordered.length - 1) + NODE_H + 20 : PAD
  return { width, height: addY + 40 + PAD, nodes, edges, bands, addY, centerX }
}

function selfLoop(x: number, y: number, laneX: number): string {
  return `M ${x} ${y + 18} H ${laneX - 8} Q ${laneX} ${y + 18} ${laneX} ${y + 10} V ${y - 10} Q ${laneX} ${y - 18} ${laneX - 8} ${y - 18} H ${x}`
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** Stages no success or rework edge reaches from the first stage. */
export function unreachableStages(stages: WorkflowStage[], loops: WorkflowLoop[] = []): WorkflowStage[] {
  const ordered = orderedStages(stages)
  if (!ordered.length) return []
  const { edges } = layoutCanvas(ordered, loops)
  const seen = new Set([ordered[0].id])
  const queue = [ordered[0].id]
  while (queue.length) {
    const id = queue.shift()!
    for (const e of edges) if (e.source === id && !seen.has(e.target)) { seen.add(e.target); queue.push(e.target) }
  }
  return ordered.filter((s) => !seen.has(s.id))
}

/** The loops a stage takes part in, and how. */
export type LoopPart = "start" | "check" | "both" | "inside"

export function loopsOfStage(stageId: string, stages: WorkflowStage[], loops: WorkflowLoop[]): { loop: WorkflowLoop; part: LoopPart }[] {
  const index = new Map(orderedStages(stages).map((s, i) => [s.id, i]))
  const at = index.get(stageId)
  return loops.flatMap((loop): { loop: WorkflowLoop; part: LoopPart }[] => {
    const a = index.get(loop.entry_stage_id)
    const b = index.get(loop.check_stage_id)
    if (loop.entry_stage_id === stageId && loop.check_stage_id === stageId) return [{ loop, part: "both" }]
    if (loop.entry_stage_id === stageId) return [{ loop, part: "start" }]
    if (loop.check_stage_id === stageId) return [{ loop, part: "check" }]
    if (at !== undefined && a !== undefined && b !== undefined && a < at && at < b) return [{ loop, part: "inside" }]
    return []
  })
}
