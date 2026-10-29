"use client"

import { Check, Hourglass, X } from "lucide-react"
import { toast } from "sonner"
import { Select } from "@/components/ui/form"
import { useUpdateTask } from "@/hooks/useTasks"
import { cn } from "@/lib/utils"
import type { Task } from "@/types"

/** The task's place in the task graph: what must be done before it starts. */
export default function DependenciesEditor({ task, projectTasks }: { task: Task; projectTasks: Task[] }) {
  const updateTask = useUpdateTask(task.project_id)
  const deps = task.depends_on ?? []
  const byId = new Map(projectTasks.map((t) => [t.id, t]))
  const dependents = projectTasks.filter((t) => (t.depends_on ?? []).includes(task.id))
  const candidates = projectTasks.filter((t) => t.id !== task.id && !deps.includes(t.id))

  async function save(next: string[]) {
    try {
      await updateTask.mutateAsync({ taskId: task.id, depends_on: next })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update dependencies")
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Depends on</h3>
      {deps.length === 0 && <p className="mb-2 text-xs text-muted-foreground">Nothing — this task can start right away.</p>}
      <ul className="mb-2 flex flex-wrap gap-1.5">
        {deps.map((id) => {
          const dep = byId.get(id)
          if (!dep) return null
          const done = dep.status === "done"
          return (
            <li key={id} className={cn("inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
              done ? "border-success/30 bg-success/5 text-success" : "bg-muted/40")}>
              {done ? <Check className="h-3 w-3 shrink-0" /> : <Hourglass className="h-3 w-3 shrink-0 text-muted-foreground" />}
              <span className="truncate">{dep.title}</span>
              <button onClick={() => save(deps.filter((d) => d !== id))} disabled={updateTask.isPending}
                aria-label={`Remove dependency on ${dep.title}`} className="rounded-full p-0.5 hover:bg-muted">
                <X className="h-3 w-3" />
              </button>
            </li>
          )
        })}
      </ul>
      {candidates.length > 0 && (
        <Select value="" onChange={(e) => e.target.value && save([...deps, e.target.value])}
          disabled={updateTask.isPending} aria-label="Add a dependency" className="h-8 text-xs">
          <option value="">Add a task this one depends on…</option>
          {candidates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </Select>
      )}
      {dependents.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Needed by: {dependents.map((t) => t.title).join(", ")}
        </p>
      )}
    </section>
  )
}
