"use client"

import { Bot, Hand, HelpCircle, Plus, Repeat, UserCheck } from "lucide-react"
import { GlossaryContent, Tooltip } from "@/components/ui/tooltip"
import { ROLE_STYLE } from "@/components/workflow/Pipeline"
import { CARD_H, NODE_H, NODE_W, TAB_H, layoutCanvas, loopsOfStage, orderedStages, type CanvasEdge } from "@/lib/workflowCanvas"
import { cn } from "@/lib/utils"
import type { Engineer, StageRole, WorkflowLoop, WorkflowStage } from "@/types"

const EDGE_CLASS: Record<CanvasEdge["kind"], string> = {
  flow: "stroke-border",
  success: "stroke-muted-foreground/60",
  rework: "stroke-warning/70",
  loop: "stroke-primary",
}

function EdgeLabel({ edge, loop, onEditLoop }: { edge: CanvasEdge; loop?: WorkflowLoop; onEditLoop: (loop: WorkflowLoop) => void }) {
  if (!edge.label) return null
  const style = { left: edge.labelX, top: edge.labelY }
  const base = "absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] shadow-sm"
  if (edge.kind === "loop" && loop) {
    return (
      <Tooltip side="right" content={
        <span className="block">
          <span className="block font-semibold">{loop.name}</span>
          <span className="block text-muted-foreground">
            Until: {loop.goal || "the check stage passes"} · at most {loop.max_iterations} passes
            {loop.max_cost_usd ? ` or $${loop.max_cost_usd.toFixed(2)}` : ""} · then {loop.on_exhausted === "ask_human" ? "ask a person" : "proceed"}.
          </span>
          <span className="mt-1 block text-[10px] text-muted-foreground">Click to edit</span>
        </span>
      }>
        <button
          type="button"
          onClick={() => onEditLoop(loop)}
          style={style}
          className={cn(base, "inline-flex items-center gap-1 border-primary/40 bg-primary/10 font-sans font-medium text-primary hover:bg-primary/15")}
        >
          <Repeat className="h-3 w-3" /> {edge.label}
        </button>
      </Tooltip>
    )
  }
  return (
    <Tooltip content={<GlossaryContent term={edge.kind === "rework" ? "reworkEdge" : "successEdge"} />}>
      <span
        tabIndex={0}
        style={style}
        className={cn(base, edge.kind === "rework" ? "border-warning/40 bg-background text-warning" : "bg-background text-muted-foreground")}
      >
        {edge.label}
      </span>
    </Tooltip>
  )
}

function StageNode({ stage, x, y, selected, role, engineer, stages, loops, onSelect }: {
  stage: WorkflowStage
  x: number
  y: number
  selected: boolean
  role?: StageRole
  engineer?: Engineer
  stages: WorkflowStage[]
  loops: WorkflowLoop[]
  onSelect: () => void
}) {
  const style = ROLE_STYLE[stage.role] ?? ROLE_STYLE.custom
  const custom = !!stage.stage_instructions?.trim()
  const parts = loopsOfStage(stage.id, stages, loops)
  return (
    <div className="absolute" style={{ left: x, top: y, width: NODE_W, height: NODE_H }}>
      <Tooltip side="left" content={<GlossaryContent term="aiStage" />}>
        <span
          tabIndex={-1}
          style={{ height: TAB_H }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-t-lg border border-b-0 px-2.5 text-[11px]",
            selected ? "border-primary bg-primary/5 text-primary" : "bg-card text-muted-foreground",
          )}
        >
          {stage.is_ai_executable ? <><Bot className="h-3 w-3" /> AI stage</> : <><Hand className="h-3 w-3" /> Manual step</>}
          <span className="text-muted-foreground/60">·</span>
          <span className="capitalize">{role?.label ?? stage.role}</span>
        </span>
      </Tooltip>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Stage ${stage.name}`}
        style={{ height: CARD_H }}
        className={cn(
          "flex w-full flex-col rounded-xl rounded-tl-none border bg-card text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none",
          selected ? "border-primary ring-2 ring-primary/30" : "focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <div className="flex items-center gap-2 px-3 pt-2.5">
          <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border", style.className)}>{style.icon}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{stage.name}</span>
          {stage.requires_human_approval && (
            <Tooltip content={<GlossaryContent term="gate" />}>
              <span tabIndex={-1} aria-label="approval gate" className="flex h-5 items-center gap-0.5 rounded-full bg-warning/10 px-1.5 text-[10px] font-medium text-warning">
                <UserCheck className="h-3 w-3" /> gate
              </span>
            </Tooltip>
          )}
          {stage.block_on_open_questions && (
            <Tooltip content={<GlossaryContent term="waitQuestions" />}>
              <span tabIndex={-1} aria-label="waits for open questions" className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <HelpCircle className="h-3 w-3" />
              </span>
            </Tooltip>
          )}
          {parts.filter((p) => p.part !== "inside").map(({ loop, part }) => (
            <Tooltip key={loop.id} content={<GlossaryContent term={part === "start" ? "loopEntry" : "loopCheck"} />}>
              <span tabIndex={-1} className="flex h-5 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
                <Repeat className="h-3 w-3" /> {part === "both" ? "loop" : part}
              </span>
            </Tooltip>
          ))}
        </div>
        <div className="mx-3 mt-2 flex-1 overflow-hidden rounded-lg bg-muted/50 px-2.5 py-2">
          <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
            {custom ? "Instructions" : "Role defaults"}
          </p>
          <p className="mt-0.5 line-clamp-3 text-xs leading-snug text-foreground/85">
            {custom ? stage.stage_instructions : role?.description ?? "Uses the role's default instructions."}
          </p>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">engineer: <span className="text-foreground">{engineer?.name ?? "any"}</span></span>
          <span className="truncate">model: <span className="font-mono text-foreground">{stage.model ?? "inherit"}</span></span>
        </div>
      </button>
    </div>
  )
}

/** The workflow drawn as a canvas: stages top to bottom, branches left, loops right. */
export default function WorkflowCanvas({ stages, loops, roles, engineers, selectedId, onSelect, onAddStage, onEditLoop }: {
  stages: WorkflowStage[]
  loops: WorkflowLoop[]
  roles: StageRole[]
  engineers: Engineer[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAddStage: () => void
  onEditLoop: (loop: WorkflowLoop) => void
}) {
  const ordered = orderedStages(stages)
  const layout = layoutCanvas(ordered, loops)
  const byId = new Map(ordered.map((s) => [s.id, s]))

  return (
    <div
      className="relative mx-auto"
      style={{ width: layout.width, height: layout.height }}
      onClick={(e) => { if (e.target === e.currentTarget) onSelect(null) }}
    >
      <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height} aria-hidden>
        <defs>
          {(["flow", "success", "rework", "loop"] as const).map((k) => (
            <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className={cn(
                k === "flow" && "fill-border", k === "success" && "fill-muted-foreground/60",
                k === "rework" && "fill-warning/70", k === "loop" && "fill-primary",
              )} />
            </marker>
          ))}
        </defs>
        {layout.bands.map((b) => (
          <rect key={b.loopId} x={b.x} y={b.y} width={b.width} height={b.height} rx={18}
            className="fill-primary/[0.04] stroke-primary/30" strokeDasharray="4 4" />
        ))}
        {layout.edges.map((e) => (
          <path key={e.id} d={e.path} fill="none" strokeWidth={e.kind === "loop" ? 1.75 : 1.5}
            strokeDasharray={e.kind === "rework" ? "5 4" : undefined}
            className={EDGE_CLASS[e.kind]} markerEnd={`url(#arrow-${e.kind})`} />
        ))}
      </svg>

      {layout.edges.map((e) => (
        <EdgeLabel key={e.id} edge={e} loop={loops.find((l) => l.id === e.loopId)} onEditLoop={onEditLoop} />
      ))}

      {layout.nodes.map((n) => {
        const stage = byId.get(n.id)!
        return (
          <StageNode
            key={n.id}
            stage={stage}
            x={n.x}
            y={n.y}
            selected={selectedId === n.id}
            role={roles.find((r) => r.key === stage.role)}
            engineer={engineers.find((e) => e.id === stage.assigned_engineer_id)}
            stages={ordered}
            loops={loops}
            onSelect={() => onSelect(n.id)}
          />
        )
      })}

      <Tooltip content="Add a stage at the end">
        <button
          type="button"
          onClick={onAddStage}
          aria-label="Add a stage"
          style={{ left: layout.centerX, top: layout.addY }}
          className="absolute flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-md border bg-card text-muted-foreground shadow-sm hover:border-primary hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </div>
  )
}
