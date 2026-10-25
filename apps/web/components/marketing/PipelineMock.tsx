import { Check, CircleDot, FileText, GitPullRequest, HelpCircle, Lock, RotateCcw, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

type StageState = "done" | "gate" | "active" | "todo"

const STAGES: { name: string; doc: string; state: StageState; gate?: boolean }[] = [
  { name: "Analyze", doc: "analysis.md", state: "done" },
  { name: "Refine spec", doc: "spec.md", state: "done", gate: true },
  { name: "Plan", doc: "plan.md · scenarios.feature", state: "gate", gate: true },
  { name: "Build", doc: "PR #42", state: "todo" },
  { name: "Review", doc: "review.md", state: "todo" },
  { name: "Verify", doc: "verification.md", state: "todo", gate: true },
]

function StageDot({ state }: { state: StageState }) {
  if (state === "done") {
    return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success text-success-foreground"><Check className="h-3.5 w-3.5" /></span>
  }
  if (state === "gate") {
    return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-warning text-warning-foreground ring-4 ring-warning/20"><Lock className="h-3 w-3" /></span>
  }
  if (state === "active") {
    return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><CircleDot className="h-3.5 w-3.5" /></span>
  }
  return <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-border bg-background" />
}

/** A stylized task moving through the spec-driven pipeline (pure JSX, no images). */
export default function PipelineMock({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("surface overflow-hidden shadow-2xl shadow-primary/10", className)}>
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 truncate font-mono text-[11px] text-muted-foreground">acme/web#128 · Export invoices as CSV</span>
      </div>

      <div className={cn("grid gap-0", compact ? "p-4" : "p-5 sm:p-6")}>
        <ol className="relative space-y-3">
          <span className="absolute bottom-3 left-[11px] top-3 w-px bg-border" aria-hidden />
          {STAGES.map((s) => (
            <li key={s.name} className="relative flex items-center gap-3">
              <StageDot state={s.state} />
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className={cn("text-sm font-medium", s.state === "todo" && "text-muted-foreground")}>{s.name}</p>
                  {!compact && (
                    <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      {s.name === "Build" ? <GitPullRequest className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                      {s.doc}
                    </p>
                  )}
                </div>
                {s.gate && (
                  <span className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    s.state === "gate" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
                  )}>
                    {s.state === "done" ? "approved" : "human gate"}
                  </span>
                )}
                {s.name === "Review" && (
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                    <RotateCcw className="h-3 w-3" /> loops to Build
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>

        {!compact && (
          <div className="mt-5 rounded-lg border border-warning/30 bg-warning/10 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
              <HelpCircle className="h-3.5 w-3.5" /> Plan is waiting on 1 open question
            </p>
            <p className="mt-1 text-xs text-foreground/80">
              Should exported amounts use the invoice currency or the account currency?
              <span className="text-muted-foreground"> — owner: Finance lead</span>
            </p>
            <div className="mt-2.5 flex gap-2">
              <span className="rounded-md bg-background px-2 py-1 text-[11px] font-medium shadow-sm">Answer</span>
              <span className="rounded-md px-2 py-1 text-[11px] text-muted-foreground">Defer</span>
              <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3" /> DR-0004 honored
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
