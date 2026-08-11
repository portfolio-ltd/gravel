"use client"

import { useState, type ReactNode } from "react"
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter, useDroppable } from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { AlertTriangle, CheckCircle, XCircle, GripVertical } from "lucide-react"
import type { Task, BoardColumn, AttentionTask } from "@/types"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import { toast } from "sonner"
import TagChip from "./TagChip"
import { useApproveRun, useRejectRun } from "@/hooks/useTaskRuns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import TaskDetailPanel from "./TaskDetailPanel"

const COLUMN_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  qa: "QA",
  done: "Done",
}

const COLUMN_COLORS: Record<string, string> = {
  pending: "border-t-slate-400",
  in_progress: "border-t-blue-500",
  qa: "border-t-amber-500",
  done: "border-t-emerald-500",
}

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-emerald-400",
}

interface SortableTaskCardProps {
  task: Task
  attentionTasks?: AttentionTask[]
  onClick: (task: Task) => void
}

function SortableTaskCard({ task, attentionTasks, onClick }: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const attention = attentionTasks?.find((a) => a.task_id === task.id)
  const approve = useApproveRun()
  const reject = useRejectRun()

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-background rounded-lg border p-3 cursor-pointer shadow-sm hover:shadow-md transition-all text-left",
        isDragging && "opacity-50 shadow-lg",
        attention && "border-amber-300 bg-amber-50/50"
      )}
      onClick={() => onClick(task)}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", PRIORITY_DOT[task.priority])} />
            <p className="text-sm font-medium leading-snug line-clamp-2">{task.title}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px] capitalize">{task.type}</Badge>
            {(task.tags ?? []).map((t) => <TagChip key={t.id} tag={t} size="xs" />)}
            {attention && (
              <span className="flex items-center gap-1 text-[10px] text-amber-700">
                <AlertTriangle className="w-3 h-3" /> {attention.outcome.replace(/_/g, " ")}
              </span>
            )}
          </div>
          {attention && (
            <div className="flex gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                className="h-6 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => approve.mutate({ runId: attention.run_id })}
                disabled={approve.isPending}
              >
                <CheckCircle className="w-2.5 h-2.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-6 text-[10px] px-2"
                onClick={() => reject.mutate({ runId: attention.run_id })}
                disabled={reject.isPending}
              >
                <XCircle className="w-2.5 h-2.5" /> Reject
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface Props {
  columns: BoardColumn[]
  attentionTasks?: AttentionTask[]
}

function useUpdateTaskAny() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, taskId, data }: { projectId: string; taskId: string; data: Partial<Task> }) =>
      apiFetch<Task>(`/api/projects/${projectId}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] })
    },
  })
}

function useReorderTasks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, items }: { projectId: string; items: { id: string; position: number }[] }) =>
      apiFetch(`/api/projects/${projectId}/tasks/reorder`, { method: "POST", body: JSON.stringify(items) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] })
    },
  })
}

function DroppableColumn({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "ring-2 ring-primary/30")}>
      {children}
    </div>
  )
}

export default function KanbanBoard({ columns, attentionTasks }: Props) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const updateTask = useUpdateTaskAny()
  const reorderTasks = useReorderTasks()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedTask = columns.flatMap((c) => c.tasks).find((t) => t.id === active.id)
    if (!draggedTask) return

    // Resolve the target column: a column drop zone id ("column:<key>") or a card id
    const overId = String(over.id)
    const targetCol = overId.startsWith("column:")
      ? columns.find((c) => c.key === overId.slice("column:".length))
      : columns.find((c) => c.tasks.some((t) => t.id === overId))
    const sourceCol = columns.find((c) => c.tasks.some((t) => t.id === draggedTask.id))
    if (!targetCol || !sourceCol) return

    if (sourceCol.key !== targetCol.key) {
      // Stage lanes advance through runs and approvals, not drags
      if (sourceCol.stage_id || targetCol.stage_id) {
        toast.info("Stages advance through runs — approve or retry from the task panel")
        return
      }
      if (targetCol.status && draggedTask.status !== targetCol.status) {
        updateTask.mutate({
          projectId: draggedTask.project_id,
          taskId: draggedTask.id,
          data: { status: targetCol.status as Task["status"] },
        })
      }
      return
    }

    // Same lane: persist the new order
    const oldIndex = targetCol.tasks.findIndex((t) => t.id === active.id)
    const newIndex = targetCol.tasks.findIndex((t) => t.id === overId)
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return
    const reordered = arrayMove(targetCol.tasks, oldIndex, newIndex)
    reorderTasks.mutate({
      projectId: draggedTask.project_id,
      items: reordered.map((t, i) => ({ id: t.id, position: i })),
    })
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 h-full overflow-x-auto pb-4">
          {columns.map((col) => (
            <div key={col.key} className={cn("flex-shrink-0 w-72 flex flex-col rounded-xl border border-t-4 bg-muted/30", (col.status && COLUMN_COLORS[col.status]) ?? "border-t-violet-400")}>
              <div className="px-3 py-2.5 flex items-center justify-between">
                <span className="text-sm font-semibold">{col.label ?? (col.status && COLUMN_LABELS[col.status]) ?? col.key}</span>
                <span className="text-xs text-muted-foreground bg-background rounded-full px-2 py-0.5 border">
                  {col.tasks.length}
                </span>
              </div>
              <SortableContext items={col.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <DroppableColumn id={`column:${col.key}`} className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 rounded-b-xl">
                  {col.tasks.map((task) => (
                    <SortableTaskCard
                      key={task.id}
                      task={task}
                      attentionTasks={attentionTasks}
                      onClick={setSelectedTask}
                    />
                  ))}
                  {col.tasks.length === 0 && (
                    <div className="py-6 text-center text-xs text-muted-foreground">No tasks</div>
                  )}
                </DroppableColumn>
              </SortableContext>
            </div>
          ))}
        </div>
      </DndContext>

      {selectedTask && (
        <TaskDetailPanel task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </>
  )
}
