"use client"

import { useMemo, useState } from "react"
import GraphView, { type GraphNode, type NodeTone } from "@/components/graph/GraphView"
import type { Task, TaskStatus } from "@/types"

const STATUS_TONE: Record<TaskStatus, NodeTone> = {
  pending: "default",
  in_progress: "info",
  qa: "warning",
  done: "success",
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pending", in_progress: "In progress", qa: "QA", done: "Done",
}

/** Tasks as a dependency graph: arrows run from a task to the tasks waiting on it. */
export default function TaskGraph({ tasks }: { tasks: Task[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  const { nodes, edges } = useMemo(() => {
    const ordered = [...tasks].sort((a, b) => a.position - b.position)
    const nodes: GraphNode[] = ordered.map((t) => {
      const waiting = (t.depends_on ?? []).filter((d) => byId.get(d) && byId.get(d)!.status !== "done").length
      return {
        id: t.id,
        label: t.title,
        sublabel: waiting && t.status !== "done" ? `Waiting on ${waiting}` : STATUS_LABEL[t.status],
        tone: STATUS_TONE[t.status],
      }
    })
    const edges = ordered.flatMap((t) => (t.depends_on ?? []).filter((d) => byId.has(d)).map((d) => ({ source: d, target: t.id })))
    return { nodes, edges }
  }, [tasks, byId])

  const hasEdges = edges.length > 0
  const current = selected ? byId.get(selected) : null

  return (
    <div>
      <GraphView nodes={nodes} edges={edges} selectedId={selected} onSelect={setSelected}
        ariaLabel="Task dependency graph" nodeWidth={200} className="max-h-[560px]" />
      <p className="mt-2 text-[11px] text-muted-foreground">
        {hasEdges
          ? "Arrows run from a task to the tasks that depend on it. Tasks start once everything they depend on is done; independent tasks run in parallel."
          : "No dependencies yet — every task can start at once. Add them from a task's panel on the board, or parse a PRD."}
      </p>
      {current && (
        <div className="mt-3 rounded-lg border bg-background p-3 text-xs">
          <p className="font-medium">{current.title}</p>
          <p className="mt-1 text-muted-foreground">
            Depends on: {(current.depends_on ?? []).map((d) => byId.get(d)?.title).filter(Boolean).join(", ") || "nothing"}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Needed by: {tasks.filter((t) => (t.depends_on ?? []).includes(current.id)).map((t) => t.title).join(", ") || "nothing"}
          </p>
        </div>
      )}
    </div>
  )
}
