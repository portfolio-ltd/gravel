"use client"

import { Check, Hand } from "lucide-react"
import type { WorkflowStage } from "@/types"
import { cn } from "@/lib/utils"
import { ROLE_LABELS } from "./meta"

interface Props {
  stages: WorkflowStage[]
  currentStageId: string | null
  done: boolean
  /** The current stage is parked at a human gate */
  waiting?: boolean
}

/** Horizontal pipeline: completed stages are checked, the current one glows. */
export default function StageStepper({ stages, currentStageId, done, waiting }: Props) {
  const ordered = [...stages].sort((a, b) => a.stage_order - b.stage_order)
  const currentIdx = done ? ordered.length : Math.max(0, ordered.findIndex((s) => s.id === currentStageId))

  return (
    <ol className="no-scrollbar flex items-start gap-0 overflow-x-auto" aria-label="Workflow progress">
      {ordered.map((stage, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "current" : "upcoming"
        return (
          <li key={stage.id} className="flex min-w-[88px] flex-1 flex-col items-center" aria-current={state === "current" ? "step" : undefined}>
            <div className="flex w-full items-center">
              <span className={cn("h-px flex-1", i === 0 ? "bg-transparent" : i <= currentIdx ? "bg-primary/60" : "bg-border")} />
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors",
                  state === "done" && "border-primary bg-primary text-primary-foreground",
                  state === "current" && !waiting && "border-primary bg-primary/10 text-primary ring-4 ring-primary/15",
                  state === "current" && waiting && "border-warning bg-warning/15 text-warning ring-4 ring-warning/15",
                  state === "upcoming" && "bg-background text-muted-foreground",
                )}
              >
                {state === "done" ? <Check className="h-3 w-3" /> : state === "current" && waiting ? <Hand className="h-3 w-3" /> : i + 1}
              </span>
              <span className={cn("h-px flex-1", i === ordered.length - 1 ? "bg-transparent" : i < currentIdx ? "bg-primary/60" : "bg-border")} />
            </div>
            <span className={cn("mt-1.5 max-w-[96px] truncate px-1 text-center text-[11px] font-medium",
              state === "upcoming" ? "text-muted-foreground" : "text-foreground")} title={stage.name}>
              {stage.name}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {ROLE_LABELS[stage.role] ?? stage.role}
              {stage.requires_human_approval && " · gate"}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
