"use client"

import { useState } from "react"
import { MoreHorizontal, Trash2, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown"
import type { Task, TaskStatus } from "@/types"
import { usePreferences } from "@/contexts/PreferencesContext"
import CardMeta from "@/components/sdlc/CardMeta"
import { PRIORITY_DOT } from "@/components/sdlc/meta"

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending:     "bg-slate-100 text-slate-600",
  in_progress: "bg-info/10 text-info",
  qa:          "bg-warning/15 text-warning",
  done:        "bg-success/10 text-success",
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending:     "Pending",
  in_progress: "In Progress",
  qa:          "QA",
  done:        "Done",
}

interface TaskCardProps {
  task: Task
  onStatusChange?: (taskId: string, status: TaskStatus) => void
  onDelete?: (taskId: string) => void
  /** Open the task (e.g. its detail panel) */
  onClick?: (task: Task) => void
}

const STATUS_CYCLE: TaskStatus[] = ["pending", "in_progress", "qa", "done"]

export default function TaskCard({ task, onStatusChange, onDelete, onClick }: TaskCardProps) {
  const [open, setOpen] = useState(false)
  const { prefs } = usePreferences()
  const fields = prefs.board.cardFields
  const compact = prefs.board.compactCards

  function cycleStatus() {
    const idx = STATUS_CYCLE.indexOf(task.status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    onStatusChange?.(task.id, next)
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-xl border bg-card transition-all hover:border-primary/30 hover:shadow-sm",
        compact ? "px-3 py-2" : "px-4 py-3",
        onClick && "cursor-pointer",
      )}
      onClick={onClick ? () => onClick(task) : undefined}
      onKeyDown={onClick ? (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick(task) } } : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {fields.priority && (
        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0 mt-2", PRIORITY_DOT[task.priority])} title={`${task.priority} priority`} />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug truncate">{task.title}</p>
        {!compact && task.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
        )}
        {!compact && (
          <div className="mt-2">
            <CardMeta task={task} fields={fields} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); cycleStatus() }}
          className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors", STATUS_COLORS[task.status])}
        >
          {STATUS_LABELS[task.status]}
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
        </button>

        {(onStatusChange || onDelete) && (
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
              <button aria-label="Task actions" onClick={(e) => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-muted transition-all">
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
