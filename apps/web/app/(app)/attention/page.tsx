"use client"

import { useMemo, useState } from "react"
import { Bell, CheckCircle2, Clock, FolderKanban, Hand, Loader2, PanelRightOpen } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useAttentionTasks } from "@/hooks/useBoard"
import { useProject } from "@/hooks/useProjects"
import TaskDetailPanel from "@/components/TaskDetailPanel"
import GateActions from "@/components/sdlc/GateActions"
import { Button } from "@/components/ui/button"
import { EmptyState, Page, PageHeader } from "@/components/ui/page"
import { cn } from "@/lib/utils"
import type { AttentionTask } from "@/types"

const OUTCOME: Record<string, { label: string; tone: string }> = {
  needs_human_input: { label: "Needs input", tone: "bg-warning/15 text-warning" },
  blocked: { label: "Blocked", tone: "bg-destructive/10 text-destructive" },
  failed: { label: "Failed", tone: "bg-destructive/10 text-destructive" },
}

function AttentionCard({ item, onOpen }: { item: AttentionTask; onOpen: () => void }) {
  const meta = OUTCOME[item.outcome] ?? { label: "Awaiting approval", tone: "bg-info/10 text-info" }
  return (
    <li className="surface p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
          <Hand className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <button onClick={onOpen} className="text-left text-sm font-semibold leading-snug hover:text-primary hover:underline">
              {item.task_title}
            </button>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.tone)}>{meta.label}</span>
          </div>
          {item.blocking_reason && (
            <p className="mb-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-foreground/80">{item.blocking_reason}</p>
          )}
          <div className="mb-3 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            Waiting {item.blocked_since ? formatDistanceToNow(new Date(item.blocked_since), { addSuffix: false }) : ""}
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <GateActions runId={item.run_id} taskId={item.task_id} compact />
            <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[11px]" onClick={onOpen}>
              <PanelRightOpen className="h-3 w-3" /> Open task
            </Button>
          </div>
        </div>
      </div>
    </li>
  )
}

/** Attention items only carry ids — load the project to hand the panel a full task. */
function TaskOpener({ projectId, taskId, onClose }: { projectId: string; taskId: string; onClose: () => void }) {
  const { data: project, isLoading } = useProject(projectId)
  const task = project?.tasks.find((t) => t.id === taskId)
  if (isLoading || !task) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose} role="presentation">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  return <TaskDetailPanel task={task} onClose={onClose} />
}

export default function AttentionPage() {
  const { data: items, isLoading } = useAttentionTasks()
  const [open, setOpen] = useState<{ projectId: string; taskId: string } | null>(null)

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; items: AttentionTask[] }>()
    for (const item of items ?? []) {
      const g = map.get(item.project_id) ?? { name: item.project_name, items: [] }
      g.items.push(item)
      map.set(item.project_id, g)
    }
    return [...map.entries()]
  }, [items])

  return (
    <Page>
      <PageHeader
        icon={<Bell className="h-4 w-4" />}
        title="Attention"
        description={
          items && items.length > 0
            ? `${items.length} decision${items.length === 1 ? "" : "s"} waiting — approve to move work forward, or send it back with feedback.`
            : "Gates, questions and blocked work that need a person."
        }
      />

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : groups.length > 0 ? (
        <div className="space-y-8">
          {groups.map(([projectId, group]) => (
            <section key={projectId} aria-label={group.name}>
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <FolderKanban className="h-3.5 w-3.5" /> {group.name}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] normal-case tracking-normal">{group.items.length}</span>
              </h2>
              <ul className="space-y-3">
                {group.items.map((item) => (
                  <AttentionCard key={item.run_id} item={item}
                    onOpen={() => setOpen({ projectId: item.project_id, taskId: item.task_id })} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5" />}
          title="All clear"
          description="Nothing is waiting on you. Approval gates, blocking questions and stuck runs will show up here."
        />
      )}

      {open && <TaskOpener projectId={open.projectId} taskId={open.taskId} onClose={() => setOpen(null)} />}
    </Page>
  )
}
