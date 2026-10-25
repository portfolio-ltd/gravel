"use client"

import { useState, type ReactNode } from "react"
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter, useDroppable } from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Hand } from "lucide-react"
import type { Task, BoardColumn, AttentionTask } from "@/types"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import { toast } from "sonner"
import { usePreferences } from "@/contexts/PreferencesContext"
import type { BoardCardFields } from "@/lib/theme"
import { cn } from "@/lib/utils"
import TaskDetailPanel from "./TaskDetailPanel"
import CardMeta from "./sdlc/CardMeta"
import GateActions from "./sdlc/GateActions"
import { type BoardTask, PRIORITY_DOT } from "./sdlc/meta"

const COLUMN_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  qa: "QA",
  done: "Done",
}

const COLUMN_ACCENT: Record<string, string> = {
  pending: "bg-slate-400",
  in_progress: "bg-blue-500",
  qa: "bg-amber-500",
  done: "bg-emerald-500",
}

interface SortableTaskCardProps {
  task: BoardTask
  attention?: AttentionTask
  fields: BoardCardFields
  compact: boolean
  inStageLane: boolean
  onClick: (task: Task) => void
}

function SortableTaskCard({ task, attention, fields, compact, inStageLane, onClick }: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={`Open task ${task.title}`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(task) } }}
      className={cn(
        "group cursor-pointer rounded-lg border bg-card text-left shadow-sm transition-all hover:-translate-y-px hover:border-primary/30 hover:shadow-md",
        compact ? "p-2" : "p-3",
        isDragging && "opacity-50 shadow-lg",
        attention && "border-warning/50 ring-1 ring-warning/20",
      )}
      onClick={() => onClick(task)}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="mt-0.5 cursor-grab text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 active:cursor-grabbing group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className={cn("flex items-start gap-1.5", !compact && "mb-1.5")}>
            {fields.priority && (
              <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_DOT[task.priority])}
                title={`${task.priority} priority`} />
            )}
            <p className={cn("font-medium leading-snug", compact ? "line-clamp-1 text-xs" : "line-clamp-2 text-sm")}>{task.title}</p>
          </div>
          {!compact && <CardMeta task={task} fields={fields} showStage={!inStageLane} />}
          {attention && (
            <div className="mt-2 space-y-1.5">
              <span className="flex items-center gap-1 text-[10px] font-medium text-warning">
                <Hand className="h-3 w-3" /> {attention.outcome === "needs_human_input" || attention.outcome === "blocked"
                  ? attention.outcome.replace(/_/g, " ") : "awaiting approval"}
              </span>
              {!compact && <GateActions runId={attention.run_id} taskId={task.id} compact />}
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
  const { prefs } = usePreferences()

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

  const visible = columns.filter((c) => !prefs.board.hiddenColumns.includes(c.key))
  const attentionByTask = new Map((attentionTasks ?? []).map((a) => [a.task_id, a]))

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex h-full gap-3 overflow-x-auto pb-4">
          {visible.map((col) => (
            <section key={col.key} aria-label={col.label}
              className={cn("flex flex-shrink-0 flex-col rounded-xl border bg-muted/30", prefs.board.compactCards ? "w-64" : "w-72")}>
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className={cn("h-2 w-2 rounded-full", (col.status && COLUMN_ACCENT[col.status]) || "bg-primary")} />
                <span className="truncate text-sm font-semibold">{col.label ?? (col.status && COLUMN_LABELS[col.status]) ?? col.key}</span>
                <span className="ml-auto rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                  {col.tasks.length}
                </span>
              </div>
              <SortableContext items={col.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <DroppableColumn id={`column:${col.key}`} className={cn("flex-1 overflow-y-auto rounded-b-xl px-2 pb-2", prefs.board.compactCards ? "space-y-1.5" : "space-y-2")}>
                  {col.tasks.map((task) => (
                    <SortableTaskCard
                      key={task.id}
                      task={task as BoardTask}
                      attention={attentionByTask.get(task.id)}
                      fields={prefs.board.cardFields}
                      compact={prefs.board.compactCards}
                      inStageLane={!!col.stage_id}
                      onClick={setSelectedTask}
                    />
                  ))}
                  {col.tasks.length === 0 && (
                    <div className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">No tasks</div>
                  )}
                </DroppableColumn>
              </SortableContext>
            </section>
          ))}
          {visible.length < columns.length && (
            <p className="flex-shrink-0 self-start px-2 pt-3 text-[11px] text-muted-foreground">
              {columns.length - visible.length} column{columns.length - visible.length === 1 ? "" : "s"} hidden
            </p>
          )}
        </div>
      </DndContext>

      {selectedTask && (
        <TaskDetailPanel task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </>
  )
}
