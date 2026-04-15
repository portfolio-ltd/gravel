"use client"

import { useState } from "react"
import { Plus, Zap, Play, Wifi, WifiOff, FolderOpen, MoreHorizontal, Trash2, RefreshCw, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown"
import WorkflowStepper from "@/components/WorkflowStepper"
import TaskCard from "@/components/TaskCard"
import ChangelogItem from "@/components/ChangelogItem"
import CreateProjectDialog from "@/components/CreateProjectDialog"
import { useProjects, useProject, useDeleteProject, useAdvanceProject } from "@/hooks/useProjects"
import { useTasks, useUpdateTask, useDeleteTask } from "@/hooks/useTasks"
import { useProjectSocket } from "@/hooks/useProjectSocket"
import { useRunAgent } from "@/hooks/useAgent"
import { useAuth } from "@/contexts/AuthContext"
import { cn, formatRelativeTime } from "@/lib/utils"
import { toast } from "sonner"
import type { Project, TaskStatus } from "@/types"

const STATUS_BADGE: Record<string, string> = {
  setup:    "bg-slate-100 text-slate-600",
  running:  "bg-blue-100 text-blue-700",
  qa:       "bg-amber-100 text-amber-700",
  review:   "bg-purple-100 text-purple-700",
  done:     "bg-emerald-100 text-emerald-700",
  deployed: "bg-green-100 text-green-800",
}

const STATUS_LABELS: Record<string, string> = {
  setup: "Setup", running: "Building", qa: "QA", review: "Review", done: "Done", deployed: "Deployed",
}

const CAN_RUN: Record<string, boolean> = { running: true, qa: true, review: true }
const CAN_ADVANCE: Record<string, boolean> = { setup: true, running: true, qa: true, review: true, done: true }

function ProjectRow({ project, selected, onSelect }: { project: Project; selected: boolean; onSelect: () => void }) {
  const deleteProject = useDeleteProject()
  const { user } = useAuth()

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return
    try {
      await deleteProject.mutateAsync(project.id)
      toast.success("Project deleted")
    } catch { toast.error("Failed to delete project") }
  }

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border px-4 py-3.5 transition-all hover:shadow-sm group",
        selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-muted-foreground/40 bg-card"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold truncate">{project.name}</p>
            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0", STATUS_BADGE[project.status])}>
              {STATUS_LABELS[project.status]}
            </span>
          </div>
          <Progress value={project.progress} className="h-1 mb-1.5" />
          <p className="text-[10px] text-muted-foreground">{project.progress}% · {formatRelativeTime(project.updated_at)}</p>
        </div>
        {(user?.role === "admin" || user?.role === "product") && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span
                onClick={(e) => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-all cursor-pointer inline-flex"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDelete}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </button>
  )
}

function ProjectDetail({ projectId }: { projectId: string }) {
  const { data: project, isLoading } = useProject(projectId)
  const { data: tasks = [] } = useTasks(projectId)
  const updateTask = useUpdateTask(projectId)
  const deleteTask = useDeleteTask(projectId)
  const advanceProject = useAdvanceProject(projectId)
  const runAgent = useRunAgent()
  const { connected } = useProjectSocket(projectId)
  const { user } = useAuth()

  if (isLoading || !project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const done = tasks.filter((t) => t.status === "done").length
  const total = tasks.length

  async function handleAdvance() {
    try {
      await advanceProject.mutateAsync()
      toast.success("Project status advanced")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Cannot advance"
      toast.error(message)
    }
  }

  async function handleRun() {
    try {
      await runAgent.mutateAsync(projectId)
      toast.success("Agent started")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start agent"
      toast.error(message)
    }
  }

  function handleStatusChange(taskId: string, status: TaskStatus) {
    updateTask.mutate({ taskId, status })
  }

  function handleDeleteTask(taskId: string) {
    deleteTask.mutate(taskId)
  }

  const canRun = CAN_RUN[project.status] && (user?.role === "admin" || user?.role === "developer" || user?.role === "devops")
  const canAdvance = CAN_ADVANCE[project.status] && (user?.role === "admin" || user?.role === "developer" || user?.role === "product")

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold">{project.name}</h2>
            <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", STATUS_BADGE[project.status])}>
              {STATUS_LABELS[project.status]}
            </span>
            <span className={cn("flex items-center gap-1 text-[10px] font-medium", connected ? "text-emerald-600" : "text-muted-foreground")}>
              {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {connected ? "Live" : "Offline"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {done}/{total} tasks complete · {project.progress}% progress
          </p>
        </div>
        <div className="flex gap-2">
          {canRun && (
            <Button size="sm" variant="outline" onClick={handleRun} disabled={runAgent.isPending}>
              {runAgent.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Run agent
            </Button>
          )}
          {canAdvance && (
            <Button size="sm" onClick={handleAdvance} disabled={advanceProject.isPending}>
              {advanceProject.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Advance
            </Button>
          )}
        </div>
      </div>

      {/* Workflow stepper */}
      <div className="bg-muted/50 rounded-2xl p-4 mb-6">
        <WorkflowStepper status={project.status} />
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>Overall progress</span>
          <span>{project.progress}%</span>
        </div>
        <Progress value={project.progress} className="h-2" />
      </div>

      {/* Tabs: tasks + changelog */}
      <Tabs defaultValue="tasks">
        <TabsList className="mb-4">
          <TabsTrigger value="tasks">Tasks ({total})</TabsTrigger>
          <TabsTrigger value="changelog">Changelog</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FolderOpen className="w-8 h-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No tasks yet</p>
              <p className="text-xs text-muted-foreground mt-1">Upload a PRD or create tasks manually</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks
                .sort((a, b) => a.position - b.position)
                .map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={handleStatusChange}
                    onDelete={user?.role === "admin" || user?.role === "developer" ? handleDeleteTask : undefined}
                  />
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="changelog">
          {project.changelog?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">No changelog entries yet</p>
            </div>
          ) : (
            <div className="pl-2">
              {project.changelog?.map((entry, i) => (
                <ChangelogItem
                  key={entry.id}
                  entry={entry}
                  isLast={i === (project.changelog?.length ?? 0) - 1}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function ProjectsPage() {
  const { data: projects = [], isLoading } = useProjects()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  function handleCreated(project: Project) {
    setSelectedId(project.id)
  }

  const selected = projects.find((p) => p.id === selectedId) ?? projects[0] ?? null
  const activeId = selected?.id ?? null

  return (
    <div className="h-full flex">
      {/* Sidebar: project list */}
      <div className="w-72 shrink-0 border-r flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3.5 border-b">
          <h1 className="text-sm font-semibold">Projects</h1>
          <Button size="sm" className="h-7 px-2.5 text-xs gap-1" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3 h-3" /> New
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-2">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
            ))
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
                <Zap className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No projects yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Create your first project to get started</p>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> Create project
              </Button>
            </div>
          ) : (
            projects.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                selected={p.id === activeId}
                onSelect={() => setSelectedId(p.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail panel */}
      {activeId ? (
        <ProjectDetail projectId={activeId} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
            <FolderOpen className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Select a project to view details</p>
        </div>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={handleCreated} />
    </div>
  )
}
