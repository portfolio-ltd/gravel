"use client"

import { useId, useMemo } from "react"
import { edgeKey, layoutGraph } from "@/lib/graphLayout"
import { cn } from "@/lib/utils"

export type NodeTone = "default" | "primary" | "success" | "warning" | "info" | "muted" | "danger"

export interface GraphNode {
  id: string
  label: string
  sublabel?: string
  tone?: NodeTone
}

export interface GraphEdge {
  source: string
  target: string
  /** Dashed: a secondary edge such as a rework loop */
  dashed?: boolean
  /** Heavier edges draw thicker (e.g. import counts) */
  weight?: number
}

const TONE: Record<NodeTone, string> = {
  default: "fill-card stroke-border",
  primary: "fill-primary/10 stroke-primary/50",
  success: "fill-success/10 stroke-success/50",
  warning: "fill-warning/10 stroke-warning/60",
  info: "fill-info/10 stroke-info/50",
  muted: "fill-muted stroke-border",
  danger: "fill-destructive/10 stroke-destructive/50",
}

const PAD = 12
const GAP_X = 56
const GAP_Y = 14
const LOOP = 30

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** A left-to-right layered drawing of a small directed graph. Cycles are drawn as loops underneath. */
export default function GraphView({
  nodes, edges, selectedId, onSelect, ariaLabel, nodeWidth = 168, nodeHeight = 44, minScale = 0.75, className,
}: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  ariaLabel: string
  nodeWidth?: number
  nodeHeight?: number
  /** Shrink to the container down to this scale; scroll beyond it */
  minScale?: number
  className?: string
}) {
  const markerId = `arrow-${useId().replace(/[^a-zA-Z0-9]/g, "")}`
  const layout = useMemo(() => layoutGraph(nodes.map((n) => n.id), edges), [nodes, edges])

  const W = nodeWidth, H = nodeHeight
  const tallest = Math.max(1, ...layout.layers.map((l) => l.length))
  const columnHeight = tallest * H + (tallest - 1) * GAP_Y
  const hasLoops = edges.some((e) => layout.backEdges.has(edgeKey(e)))
  const width = PAD * 2 + layout.layers.length * W + Math.max(0, layout.layers.length - 1) * GAP_X
  const height = PAD * 2 + columnHeight + (hasLoops ? LOOP : 0)

  const box = (id: string) => {
    const p = layout.position.get(id)!
    const n = layout.layers[p.layer].length
    const offset = (columnHeight - (n * H + (n - 1) * GAP_Y)) / 2
    return { x: PAD + p.layer * (W + GAP_X), y: PAD + offset + p.index * (H + GAP_Y) }
  }

  const neighbours = useMemo(() => {
    if (!selectedId) return null
    const set = new Set([selectedId])
    for (const e of edges) {
      if (e.source === selectedId) set.add(e.target)
      if (e.target === selectedId) set.add(e.source)
    }
    return set
  }, [selectedId, edges])

  const chars = Math.floor((W - 18) / 6.4)

  return (
    <div className={cn("overflow-auto rounded-lg border bg-muted/20", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="group" aria-label={ariaLabel} className="block"
        style={{ minWidth: width * minScale, maxWidth: width }} preserveAspectRatio="xMinYMin meet"
        onClick={(e) => { if (e.target === e.currentTarget) onSelect?.(null) }}>
        <defs>
          <marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse"
            orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground" />
          </marker>
        </defs>

        {edges.map((e) => {
          if (!layout.position.has(e.source) || !layout.position.has(e.target) || e.source === e.target) return null
          const a = box(e.source), b = box(e.target)
          const loop = layout.backEdges.has(edgeKey(e))
          let d: string
          if (loop) {
            const bottom = PAD + columnHeight + LOOP - 8
            const sx = a.x + W / 2, tx = b.x + W / 2
            d = `M${sx},${a.y + H} C${sx},${bottom} ${tx},${bottom} ${tx},${b.y + H + 2}`
          } else {
            const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x - 2, y2 = b.y + H / 2
            const dx = Math.max(24, (x2 - x1) / 2)
            d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
          }
          const active = selectedId && (e.source === selectedId || e.target === selectedId)
          const strokeWidth = 1.25 + Math.min(2, Math.log2(Math.max(1, e.weight ?? 1)) / 2)
          return (
            <path key={`${edgeKey(e)}${e.dashed ? "-d" : ""}`} d={d} fill="none" markerEnd={`url(#${markerId})`}
              strokeWidth={strokeWidth} strokeDasharray={e.dashed || loop ? "5 4" : undefined}
              className={cn("transition-opacity",
                active ? "stroke-primary" : e.dashed ? "stroke-warning/70" : "stroke-muted-foreground/50",
                neighbours && !active && "opacity-25")}>
              {e.weight && e.weight > 1 ? <title>{`${e.weight} imports`}</title> : null}
            </path>
          )
        })}

        {nodes.map((n) => {
          if (!layout.position.has(n.id)) return null
          const { x, y } = box(n.id)
          const selected = n.id === selectedId
          const dimmed = neighbours && !neighbours.has(n.id)
          return (
            <g key={n.id} transform={`translate(${x},${y})`}
              role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined}
              aria-label={onSelect ? `${n.label}${n.sublabel ? ` — ${n.sublabel}` : ""}` : undefined}
              aria-pressed={onSelect ? selected : undefined}
              onClick={onSelect ? () => onSelect(selected ? null : n.id) : undefined}
              onKeyDown={onSelect ? (e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(selected ? null : n.id) }
              } : undefined}
              className={cn("outline-none transition-opacity [&:focus-visible>rect]:stroke-primary [&:focus-visible>rect]:stroke-2",
                onSelect && "cursor-pointer", dimmed && "opacity-35")}>
              <title>{n.sublabel ? `${n.label}\n${n.sublabel}` : n.label}</title>
              <rect width={W} height={H} rx={8} strokeWidth={selected ? 2 : 1}
                className={cn(TONE[n.tone ?? "default"], selected && "stroke-primary")} />
              <text x={9} y={n.sublabel ? 18 : H / 2 + 4} className="fill-foreground text-[12px] font-medium">
                {clip(n.label, chars)}
              </text>
              {n.sublabel && (
                <text x={9} y={34} className="fill-muted-foreground text-[10px]">{clip(n.sublabel, chars + 4)}</text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
