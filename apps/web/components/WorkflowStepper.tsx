"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProjectStatus } from "@/types"

const STEPS: { status: ProjectStatus; label: string }[] = [
  { status: "setup",    label: "Setup" },
  { status: "running",  label: "Building" },
  { status: "qa",       label: "QA" },
  { status: "review",   label: "Review" },
  { status: "done",     label: "Done" },
  { status: "deployed", label: "Deployed" },
]

const ORDER: Record<ProjectStatus, number> = {
  setup: 0, running: 1, qa: 2, review: 3, done: 4, deployed: 5,
}

interface WorkflowStepperProps {
  status: ProjectStatus
  className?: string
}

export default function WorkflowStepper({ status, className }: WorkflowStepperProps) {
  const current = ORDER[status]

  return (
    <div className={cn("flex items-center gap-0", className)}>
      {STEPS.map((step, i) => {
        const idx = ORDER[step.status]
        const done = idx < current
        const active = idx === current

        return (
          <div key={step.status} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                done   ? "bg-success border-success text-success-foreground"
                       : active ? "bg-primary border-primary text-primary-foreground"
                       : "bg-background border-border text-muted-foreground"
              )}>
                {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={cn("text-[10px] font-medium whitespace-nowrap",
                active ? "text-foreground" : done ? "text-success" : "text-muted-foreground"
              )}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn(
                "h-0.5 w-8 mx-1 mb-4 transition-all",
                idx < current ? "bg-success/60" : "bg-border"
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}
