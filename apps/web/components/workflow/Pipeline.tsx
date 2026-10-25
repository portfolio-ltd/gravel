"use client"

import { ArrowRight, CornerUpLeft, FileSearch, FileText, Hammer, HelpCircle, Loader2, Map, Rocket, ShieldCheck, ScanEye, Sparkles, UserCheck, Wrench } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { StageRoleKey, WorkflowStage, WorkflowTemplate } from "@/types"

export const ROLE_STYLE: Record<StageRoleKey, { icon: ReactNode; className: string }> = {
  analyze: { icon: <FileSearch className="h-3 w-3" />, className: "bg-sky-100 text-sky-700 border-sky-200" },
  refine: { icon: <FileText className="h-3 w-3" />, className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  plan: { icon: <Map className="h-3 w-3" />, className: "bg-violet-100 text-violet-700 border-violet-200" },
  build: { icon: <Hammer className="h-3 w-3" />, className: "bg-amber-100 text-amber-700 border-amber-200" },
  review: { icon: <ScanEye className="h-3 w-3" />, className: "bg-rose-100 text-rose-700 border-rose-200" },
  verify: { icon: <ShieldCheck className="h-3 w-3" />, className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  deploy: { icon: <Rocket className="h-3 w-3" />, className: "bg-teal-100 text-teal-700 border-teal-200" },
  custom: { icon: <Wrench className="h-3 w-3" />, className: "bg-slate-100 text-slate-700 border-slate-200" },
}

export interface PipelineStage {
  key: string
  name: string
  role: StageRoleKey
  requires_human_approval: boolean
  is_ai_executable: boolean
  block_on_open_questions: boolean
  reworkTo: string | null
}

export function stagesFromWorkflow(stages: WorkflowStage[]): PipelineStage[] {
  const byId = new globalThis.Map(stages.map((s) => [s.id, s.name]))
  return [...stages]
    .sort((a, b) => a.stage_order - b.stage_order)
    .map((s) => ({
      key: s.id, name: s.name, role: s.role ?? "custom",
      requires_human_approval: s.requires_human_approval, is_ai_executable: s.is_ai_executable,
      block_on_open_questions: s.block_on_open_questions,
      reworkTo: s.rework_target_stage_id ? byId.get(s.rework_target_stage_id) ?? null : null,
    }))
}

export function stagesFromTemplate(tpl: WorkflowTemplate): PipelineStage[] {
  return tpl.stages.map((s) => ({
    key: s.name, name: s.name, role: s.role, requires_human_approval: s.requires_human_approval,
    is_ai_executable: s.is_ai_executable, block_on_open_questions: s.block_on_open_questions, reworkTo: s.rework_to,
  }))
}

/** Stage chips joined by arrows; gates, question blocks and rework loops annotated. */
export function Pipeline({ stages, size = "default", className }: {
  stages: PipelineStage[]; size?: "sm" | "default"; className?: string
}) {
  if (stages.length === 0) {
    return <p className={cn("text-xs text-muted-foreground", className)}>No stages yet.</p>
  }
  return (
    <ol className={cn("flex flex-wrap items-start gap-y-2", className)}>
      {stages.map((s, i) => {
        const style = ROLE_STYLE[s.role] ?? ROLE_STYLE.custom
        return (
          <li key={s.key} className="flex items-start">
            <div className="flex flex-col items-start gap-1">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border font-medium",
                  size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
                  style.className,
                )}
                title={`${s.name} — ${s.role}`}
              >
                {s.is_ai_executable ? style.icon : <UserCheck className="h-3 w-3" />}
                {s.name}
                {s.requires_human_approval && (
                  <span title="Human approval gate" aria-label="approval gate" className="ml-0.5 inline-flex">
                    <UserCheck className="h-3 w-3 opacity-80" />
                  </span>
                )}
                {s.block_on_open_questions && (
                  <span title="Waits for open questions to be answered" aria-label="blocks on open questions" className="inline-flex">
                    <HelpCircle className="h-3 w-3 opacity-80" />
                  </span>
                )}
              </span>
              {s.reworkTo && (
                <span className="inline-flex items-center gap-0.5 pl-1 text-[10px] text-muted-foreground">
                  <CornerUpLeft className="h-2.5 w-2.5" /> rework → {s.reworkTo}
                </span>
              )}
            </div>
            {i < stages.length - 1 && (
              <ArrowRight className={cn("mx-1 shrink-0 text-muted-foreground/60", size === "sm" ? "mt-1 h-3 w-3" : "mt-1.5 h-3.5 w-3.5")} />
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function PipelineLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1"><UserCheck className="h-3 w-3" /> human gate / manual stage</span>
      <span className="inline-flex items-center gap-1"><HelpCircle className="h-3 w-3" /> waits on open questions</span>
      <span className="inline-flex items-center gap-1"><CornerUpLeft className="h-3 w-3" /> rework loop</span>
    </div>
  )
}

export function TemplateCard({ template, onUse, pending, actionLabel = "Use template" }: {
  template: WorkflowTemplate; onUse: () => void; pending?: boolean; actionLabel?: string
}) {
  return (
    <div className={cn(
      "surface relative flex flex-col gap-3 p-4 transition-shadow hover:shadow-md",
      template.recommended && "border-primary/40 bg-glow",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{template.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{template.description}</p>
        </div>
        {template.recommended && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <Sparkles className="h-3 w-3" /> Recommended
          </span>
        )}
      </div>
      <Pipeline stages={stagesFromTemplate(template)} size="sm" />
      <div className="mt-auto flex justify-end">
        <Button size="sm" variant={template.recommended ? "default" : "outline"} onClick={onUse} disabled={pending}>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {actionLabel}
        </Button>
      </div>
    </div>
  )
}
