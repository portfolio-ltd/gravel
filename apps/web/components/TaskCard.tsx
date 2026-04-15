"use client"

import { useState } from "react"
import { MoreHorizontal, Trash2, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown"
import type { Task, TaskStatus } from "@/types"

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending:     "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-100 text-blue-700",
  qa:          "bg-amber-100 text-amber-700",
  done:        "bg-emerald-100 text-emerald-700",
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending:     "Pending",
  in_progress: "In Progress",
  qa:          "QA",
  done:        "Done",
}

const PRIORITY_DOT: Record<string, string> = {
  high:   "bg-rose-500",
  medium: "bg-amber-400",
  low:    "bg-slate-400",
}

const TYPE_LABELS: Record<string, string> = {
  feature: "Feature",
  bug:     "Bug",
  design:  "Design",
  infra:   "Infra",
}

interface TaskCardProps {
  task: Task
  onStatusChange?: (taskId: string, status: TaskStatus) => void
  onDelete?: (taskId: string) => void
}

const STATUS_CYCLE: TaskStatus[] = ["pending", "in_progress", "qa", "done"]

export default function TaskCard({ task, onStatusChange, onDelete }: TaskCardProps) {
  const [open, setOpen] = useState(false)

  function cycleStatus() {
    const idx = STATUS_CYCLE.indexOf(task.status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    onStatusChange?.(task.id, next)
  }

  return (
    <div className="group flex items-start gap-3 rounded-xl border bg-card px-4 py-3 hover:shadow-sm transition-all">
      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0 mt-2", PRIORITY_DOT[task.priority])} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug truncate">{task.title}</p>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {TYPE_LABELS[task.type] ?? task.type}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={cycleStatus}
          className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors", STATUS_COLORS[task.status])}
        >
          {STATUS_LABELS[task.status]}
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
        </button>

        {(onStatusChange || onDelete) && (
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
              <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-all">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {STATUS_CYCLE.filter((s) => s !== task.status).map((s) => (
                <DropdownMenuItem key={s} onClick={() => { onStatusChange?.(task.id, s); setOpen(false) }}>
                  Mark as {STATUS_LABELS[s]}
                </DropdownMenuItem>
              ))}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => { onDelete(task.id); setOpen(false) }}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
