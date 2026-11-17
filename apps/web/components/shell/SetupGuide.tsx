"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Check, X } from "lucide-react"
import { useGitIntegrations } from "@/hooks/useIntegrations"
import { useProjects } from "@/hooks/useProjects"
import { useWorkflows } from "@/hooks/useWorkflows"
import { Tooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const DISMISS_KEY = "gravel.setupGuideDismissed"

/** First-run checklist in the sidebar; each step is checked against real data. */
export default function SetupGuide() {
  const { data: git } = useGitIntegrations()
  const { data: projects } = useProjects()
  const { data: workflows } = useWorkflows()
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1") } catch { setDismissed(false) }
  }, [])

  if (dismissed || !git || !projects || !workflows) return null
  const steps = [
    { done: git.some((g) => g.provider === "github" && g.is_active && g.has_token), label: "Connect GitHub", href: "/integrations",
      tip: "Engineers clone, push branches and open pull requests with this token." },
    { done: projects.length > 0, label: "Create a project", href: "/projects",
      tip: "A repository plus its tasks — the work your engineers pick up." },
    { done: workflows.some((w) => (w.loops ?? []).length > 0), label: "Add a loop to a workflow", href: "/loops",
      tip: "Let engineers repeat work → check until the exit condition holds, within limits you set." },
  ]
  const doneCount = steps.filter((s) => s.done).length
  if (doneCount === steps.length) return null

  function dismiss() {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, "1") } catch { /* private mode: hide for this visit */ }
  }

  return (
    <div className="rounded-xl border bg-gradient-to-br from-primary/10 via-background to-background p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold">Get started</p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] tabular-nums text-muted-foreground">{doneCount} of {steps.length}</span>
          <Tooltip content="Hide this guide">
            <button onClick={dismiss} aria-label="Hide the setup guide" className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="mb-2 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="space-y-0.5">
        {steps.map((s) => (
          <li key={s.label}>
            <Tooltip content={s.tip} side="right">
              <Link href={s.href} className="flex items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-accent">
                <span className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  s.done ? "border-primary bg-primary text-primary-foreground" : "bg-background",
                )}>
                  {s.done && <Check className="h-2.5 w-2.5" />}
                </span>
                <span className={cn(s.done && "text-muted-foreground line-through")}>{s.label}</span>
              </Link>
            </Tooltip>
          </li>
        ))}
      </ol>
    </div>
  )
}
