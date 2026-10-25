import type { DocumentKind, StageRoleKey, Task, TaskRun, TaskRunOutcome } from "@/types"

/** Board payload tasks carry a few extras beyond Task. */
export type BoardTask = Task & { open_question_count?: number; stage_name?: string | null }

export const OUTCOME_META: Record<TaskRunOutcome, { label: string; tone: string }> = {
  grooming_complete: { label: "Groomed", tone: "bg-info/10 text-info" },
  build_complete: { label: "Completed", tone: "bg-success/10 text-success" },
  testing_complete: { label: "Tested", tone: "bg-success/10 text-success" },
  deployment_complete: { label: "Deployed", tone: "bg-success/10 text-success" },
  needs_human_input: { label: "Needs input", tone: "bg-warning/15 text-warning" },
  blocked: { label: "Blocked", tone: "bg-destructive/10 text-destructive" },
  failed: { label: "Failed", tone: "bg-destructive/10 text-destructive" },
}

export const ROLE_LABELS: Record<StageRoleKey, string> = {
  analyze: "Analyze",
  refine: "Refine",
  plan: "Plan",
  build: "Build",
  review: "Review",
  verify: "Verify",
  deploy: "Deploy",
  custom: "Custom",
}

export const DOC_ORDER: DocumentKind[] = ["analysis", "spec", "plan", "scenarios", "review", "verification", "notes"]

export const DOC_LABELS: Record<DocumentKind, string> = {
  analysis: "Analysis",
  spec: "Spec",
  plan: "Technical plan",
  scenarios: "Acceptance scenarios",
  review: "Review",
  verification: "Verification",
  notes: "Notes",
}

export const PRIORITY_TONE: Record<string, string> = {
  high: "bg-rose-100 text-rose-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
}

export const PRIORITY_DOT: Record<string, string> = {
  high: "bg-rose-500",
  medium: "bg-amber-400",
  low: "bg-slate-400",
}

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  qa: "QA",
  done: "Done",
}

export function isGated(run: TaskRun | undefined | null): run is TaskRun {
  return !!run && run.approval_required && !run.approved_at
}

/** "#123" for a GitHub issue external id ("owner/repo#123"). */
export function issueRef(task: Pick<Task, "external_id" | "external_url">): string | null {
  if (!task.external_url) return null
  const n = task.external_id?.split("#").pop()
  return n ? `#${n}` : "Issue"
}

export function duration(from: string, to: string | null): string | null {
  if (!to) return null
  const s = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${(s / 3600).toFixed(1)}h`
}
