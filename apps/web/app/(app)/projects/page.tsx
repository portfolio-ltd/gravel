"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  ChevronRight, Cpu, Download, ExternalLink, FileText, FolderOpen, GitBranch, Github, Loader2, MoreHorizontal,
  Play, Plus, RefreshCw, Trash2, Upload, Wifi, WifiOff, Zap,
} from "lucide-react"
import { toast } from "sonner"
import { Button, buttonVariants } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown"
import { Field, Input, Segmented, Select, Switch } from "@/components/ui/form"
import { EmptyState, SectionCard } from "@/components/ui/page"
import WorkflowStepper from "@/components/WorkflowStepper"
import TaskCard from "@/components/TaskCard"
import ChangelogItem from "@/components/ChangelogItem"
import CreateProjectDialog from "@/components/CreateProjectDialog"
import { Pipeline, stagesFromWorkflow } from "@/components/workflow/Pipeline"
import { useProjects, useProject, useDeleteProject, useAdvanceProject, useUpdateProject } from "@/hooks/useProjects"
import { useWorkflows } from "@/hooks/useWorkflows"
import { useTasks, useUpdateTask, useDeleteTask, useCreateTask } from "@/hooks/useTasks"
import { useProjectSocket } from "@/hooks/useProjectSocket"
import { useRunAgent, useUploadFile, useParseAgent } from "@/hooks/useAgent"
import { useImportIssues, useMeta } from "@/hooks/useSdlc"
import { useAuth } from "@/contexts/AuthContext"
import { cn, formatRelativeTime } from "@/lib/utils"
import type { Project, ProjectDetail as ProjectDetailData, TaskStatus } from "@/types"

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

const CAN_RUN: Record<string, boolean> = { setup: true, running: true, qa: true, review: true }
const CAN_ADVANCE: Record<string, boolean> = { setup: true, running: true, qa: true, review: true, done: true }

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback
}

// ── Settings cards ────────────────────────────────────────────────────────────

function WorkflowSettings({ project }: { project: Project }) {
  const updateProject = useUpdateProject(project.id)
  const { data: workflows } = useWorkflows()
  const attached = workflows?.find((w) => w.id === project.workflow_id)

  async function handleChange(value: string) {
    try {
      await updateProject.mutateAsync({ workflow_id: value || null })
      toast.success(value ? "Workflow attached" : "Workflow detached — default pipeline")
    } catch (e) {
      toast.error(errorMessage(e, "Failed to change workflow"))
    }
  }

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-2"><GitBranch className="h-4 w-4 text-muted-foreground" /> Workflow</span>}
      description="Changing it is blocked while tasks are mid-workflow."
      actions={<Link href="/workflows" className="text-xs font-medium text-primary hover:underline">Manage</Link>}
    >
      <Select value={project.workflow_id ?? ""} onChange={(e) => handleChange(e.target.value)} disabled={updateProject.isPending} aria-label="Workflow">
        <option value="">Default pipeline (groom → build → test → deploy)</option>
        {(workflows ?? []).map((wf) => <option key={wf.id} value={wf.id}>{wf.name}</option>)}
      </Select>
      {attached && <Pipeline stages={stagesFromWorkflow(attached.stages)} size="sm" className="mt-3" />}
    </SectionCard>
  )
}

function RepoSettings({ project }: { project: Project }) {
  const updateProject = useUpdateProject(project.id)
  const [repoUrl, setRepoUrl] = useState(project.repo_url ?? "")
  const [branch, setBranch] = useState(project.default_branch ?? "main")
  const dirty = repoUrl !== (project.repo_url ?? "") || branch !== project.default_branch

  async function handleSave() {
    try {
      await updateProject.mutateAsync({ repo_url: repoUrl.trim() || null, default_branch: branch.trim() || "main" })
      toast.success("Repository settings saved")
    } catch (e) {
      toast.error(errorMessage(e, "Failed to save repository settings"))
    }
  }

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-2"><GitBranch className="h-4 w-4 text-muted-foreground" /> Code repository</span>}
      description="Engineer runtimes clone this, work on a task branch, and open pull requests."
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <Field label="Repository URL">
          <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repo" className="font-mono text-xs" />
        </Field>
        <Field label="Default branch">
          <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" className="font-mono text-xs" />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={!dirty || updateProject.isPending}>
          {updateProject.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
        </Button>
      </div>
    </SectionCard>
  )
}

function ModelSettings({ project }: { project: Project }) {
  const updateProject = useUpdateProject(project.id)
  const { data: meta } = useMeta()
  const known = meta?.models.some((m) => m.id === project.default_model)

  async function handleChange(model: string) {
    try {
      await updateProject.mutateAsync({ default_model: model })
      toast.success("Default model updated")
    } catch (e) {
      toast.error(errorMessage(e, "Failed to update model"))
    }
  }

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-2"><Cpu className="h-4 w-4 text-muted-foreground" /> Model</span>}
      description="Used by the in-process engineer and the PRD parser. Keys come from each user's Settings."
    >
      <Select value={project.default_model} onChange={(e) => handleChange(e.target.value)} disabled={updateProject.isPending} aria-label="Default model">
        {!known && <option value={project.default_model}>{project.default_model}</option>}
        {(meta?.models ?? []).map((m) => <option key={m.id} value={m.id}>{m.label} — {m.note}</option>)}
      </Select>
    </SectionCard>
  )
}

function GithubIssuesCard({ project }: { project: Project }) {
  const updateProject = useUpdateProject(project.id)
  const importIssues = useImportIssues(project.id)
  const [repo, setRepo] = useState(project.issues_repo ?? "")
  const [state, setState] = useState<"open" | "closed" | "all">("open")
  const [labels, setLabels] = useState("")
  useEffect(() => setRepo(project.issues_repo ?? ""), [project.issues_repo])
  const dirty = repo.trim() !== (project.issues_repo ?? "")

  async function saveRepo() {
    try {
      await updateProject.mutateAsync({ issues_repo: repo.trim() || null })
      toast.success(repo.trim() ? "Issues repository saved" : "Issues repository removed")
    } catch (e) {
      toast.error(errorMessage(e, "Not a valid GitHub repository"))
    }
  }

  async function toggleComments(v: boolean) {
    try {
      await updateProject.mutateAsync({ post_issue_comments: v })
    } catch (e) {
      toast.error(errorMessage(e, "Failed to update"))
    }
  }

  async function runImport() {
    try {
      const r = await importIssues.mutateAsync({ state, labels: labels.trim() || undefined })
      toast.success(`Imported ${r.total} issue${r.total === 1 ? "" : "s"}: ${r.created} new, ${r.updated} updated, ${r.skipped} skipped (already in progress)`)
      if (!r.authenticated) {
        toast.info("Imported anonymously — add a GitHub integration for private repos and comment sync.", {
          action: { label: "Integrations", onClick: () => { window.location.href = "/integrations" } },
        })
      }
    } catch (e) {
      toast.error(errorMessage(e, "Import failed"))
    }
  }

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-2"><Github className="h-4 w-4 text-muted-foreground" /> GitHub issues</span>}
      description="Import issues as tasks — acceptance criteria under an “Acceptance criteria” heading come along."
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="Repository" className="flex-1">
          <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" className="font-mono text-xs"
            onKeyDown={(e) => e.key === "Enter" && dirty && saveRepo()} />
        </Field>
        {dirty && (
          <Button size="sm" variant="outline" className="h-9" onClick={saveRepo} disabled={updateProject.isPending}>Save</Button>
        )}
      </div>
      {project.issues_repo && (
        <>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium">Post stage results to the issue</p>
              <p className="text-[11px] text-muted-foreground">Each stage’s summary is added as a comment (needs a GitHub integration).</p>
            </div>
            <Switch checked={project.post_issue_comments} onChange={toggleComments} disabled={updateProject.isPending} label="Post stage results to the issue" />
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Segmented
              size="sm"
              value={state}
              onChange={setState}
              options={[{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }, { value: "all", label: "All" }]}
            />
            <Input value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="Labels (comma-separated, optional)" className="h-8 flex-1 text-xs" aria-label="Filter by labels" />
            <Button size="sm" onClick={runImport} disabled={importIssues.isPending}>
              {importIssues.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Import issues
            </Button>
          </div>
          <a href={`https://github.com/${project.issues_repo}/issues`} target="_blank" rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            View on GitHub <ExternalLink className="h-3 w-3" />
          </a>
        </>
      )}
    </SectionCard>
  )
}

function PrdCard({ project }: { project: ProjectDetailData }) {
  const uploadFile = useUploadFile()
  const parseAgent = useParseAgent()
  const prdInputRef = useRef<HTMLInputElement>(null)

  async function handlePrdFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    try {
      await uploadFile.mutateAsync({ projectId: project.id, file, fileType: "prd" })
      toast.success("PRD uploaded")
    } catch (err) {
      toast.error(errorMessage(err, "Failed to upload PRD"))
    }
  }

  async function handleParsePrd() {
    if (!confirm("Parsing replaces this project's pending tasks with tasks extracted from the PRD. Continue?")) return
    try {
      const result = await parseAgent.mutateAsync({ project_id: project.id, model: project.default_model }) as { tasks: unknown[] }
      toast.success(`${result.tasks.length} tasks generated`)
    } catch (err) {
      toast.error(errorMessage(err, "Failed to parse PRD"))
    }
  }

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /> Product requirements</span>}
      description="Upload a PRD and let AI split it into tasks with acceptance criteria."
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {project.prd_file_path ? project.prd_file_path.split("/").pop() : "No PRD attached"}
        </p>
        <div className="flex shrink-0 gap-2">
          {project.prd_file_path && (
            <Button size="sm" variant="outline" onClick={handleParsePrd} disabled={parseAgent.isPending}>
              {parseAgent.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />} Parse into tasks
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => prdInputRef.current?.click()} disabled={uploadFile.isPending}>
            {uploadFile.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {project.prd_file_path ? "Replace" : "Upload PRD"}
          </Button>
        </div>
      </div>
      <input ref={prdInputRef} type="file" className="hidden" accept=".pdf,.md,.txt" onChange={handlePrdFileChange} />
    </SectionCard>
  )
}

function AddTaskForm({ projectId }: { projectId: string }) {
  const createTask = useCreateTask(projectId)
  const [title, setTitle] = useState("")

  async function handleAdd() {
    if (!title.trim()) return
    try {
      await createTask.mutateAsync({ title: title.trim() })
      setTitle("")
    } catch (e) {
      toast.error(errorMessage(e, "Failed to add task"))
    }
  }

  return (
    <div className="mb-3 flex gap-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        placeholder="Add a task — e.g. “Export invoices as CSV”" aria-label="New task title" />
      <Button size="sm" className="h-9" onClick={handleAdd} disabled={!title.trim() || createTask.isPending}>
        {createTask.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
      </Button>
    </div>
  )
}

// ── Project list + detail ────────────────────────────────────────────────────

function ProjectRow({ project, selected, onSelect }: { project: Project; selected: boolean; onSelect: () => void }) {
  const deleteProject = useDeleteProject()
  const { user } = useAuth()

  async function handleDelete() {
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return
    try {
      await deleteProject.mutateAsync(project.id)
      toast.success("Project deleted")
    } catch (e) { toast.error(errorMessage(e, "Failed to delete project")) }
  }

  return (
    <div
      className={cn(
        "group relative rounded-xl border transition-all hover:shadow-sm",
        selected ? "border-primary/50 bg-primary/5 shadow-sm" : "bg-card hover:border-muted-foreground/30",
      )}
    >
      <button onClick={onSelect} aria-current={selected} className="w-full px-4 py-3 text-left">
        <div className="mb-1.5 flex items-center gap-2 pr-6">
          <p className="truncate text-sm font-semibold">{project.name}</p>
          <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold", STATUS_BADGE[project.status])}>
            {STATUS_LABELS[project.status]}
          </span>
        </div>
        <Progress value={project.progress} className="mb-1.5 h-1" />
        <p className="text-[10px] text-muted-foreground">
          {project.progress}% · {formatRelativeTime(project.updated_at)}
          {project.issues_repo && <> · <Github className="inline h-2.5 w-2.5" /> {project.issues_repo}</>}
        </p>
      </button>
      {(user?.role === "admin" || user?.role === "product") && (
        <div className="absolute right-2 top-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded p-1 text-muted-foreground opacity-100 transition-all hover:bg-muted sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                aria-label={`Actions for ${project.name}`}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDelete}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
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
      <div className="space-y-4 p-6">
        <div className="h-8 w-1/3 animate-pulse rounded-lg bg-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  const done = tasks.filter((t) => t.status === "done").length
  const total = tasks.length

  async function handleAdvance() {
    try {
      await advanceProject.mutateAsync()
      toast.success("Project status advanced")
    } catch (err) {
      toast.error(errorMessage(err, "Cannot advance"))
    }
  }

  async function handleRun() {
    try {
      await runAgent.mutateAsync(projectId)
      toast.success("Engineers started — watch the board for progress")
    } catch (err) {
      toast.error(errorMessage(err, "Failed to start agent"))
    }
  }

  function handleStatusChange(taskId: string, status: TaskStatus) {
    updateTask.mutate({ taskId, status }, { onError: (e) => toast.error(errorMessage(e, "Can't change status")) })
  }

  const canRun = CAN_RUN[project.status] && (user?.role === "admin" || user?.role === "developer" || user?.role === "devops")
  const canAdvance = CAN_ADVANCE[project.status] && (user?.role === "admin" || user?.role === "developer" || user?.role === "product")
  const sortedTasks = [...tasks].sort((a, b) => a.position - b.position)

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold tracking-tight">{project.name}</h2>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_BADGE[project.status])}>
              {STATUS_LABELS[project.status]}
            </span>
            <span className={cn("flex items-center gap-1 text-[10px] font-medium", connected ? "text-success" : "text-muted-foreground")}>
              {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {connected ? "Live" : "Offline"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{done}/{total} tasks complete · {project.progress}% progress</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={`/board?project=${project.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
            Open board
          </Link>
          {canRun && (
            <Button size="sm" variant="outline" onClick={handleRun} disabled={runAgent.isPending || total === 0}>
              {runAgent.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run engineers
            </Button>
          )}
          {canAdvance && (
            <Button size="sm" onClick={handleAdvance} disabled={advanceProject.isPending}>
              {advanceProject.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />} Advance
            </Button>
          )}
        </div>
      </div>

      <div className="surface mb-6 overflow-x-auto p-4">
        <WorkflowStepper status={project.status} />
        <Progress value={project.progress} className="mt-4 h-1.5" />
      </div>

      <Tabs defaultValue="tasks">
        <TabsList className="mb-4">
          <TabsTrigger value="tasks">Tasks ({total})</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="changelog">Changelog</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <AddTaskForm projectId={projectId} />
          {sortedTasks.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="h-5 w-5" />}
              title="No tasks yet"
              description="Add one above, parse a PRD, or import GitHub issues from the Sources tab."
            />
          ) : (
            <div className="space-y-2">
              {sortedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onStatusChange={handleStatusChange}
                  onDelete={user?.role === "admin" || user?.role === "developer" ? (id) => deleteTask.mutate(id) : undefined}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sources" className="space-y-4">
          <PrdCard project={project} />
          <GithubIssuesCard project={project} />
        </TabsContent>

        <TabsContent value="changelog">
          {(project.changelog?.length ?? 0) === 0 ? (
            <EmptyState title="No changelog entries yet" description="Completed stages and deployments are recorded here." />
          ) : (
            <div className="pl-2">
              {project.changelog.map((entry, i) => (
                <ChangelogItem key={entry.id} entry={entry} isLast={i === project.changelog.length - 1} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <WorkflowSettings project={project} />
          <ModelSettings project={project} />
          <RepoSettings key={`${project.repo_url}-${project.default_branch}`} project={project} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ProjectsView() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: projects = [], isLoading } = useProjects()
  const [createOpen, setCreateOpen] = useState(false)
  const paramId = searchParams.get("project")

  // ?new=1 opens the create dialog (command palette deep link), then clears the flag
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setCreateOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete("new")
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false })
    }
  }, [searchParams, router, pathname])

  function select(id: string) {
    router.replace(`${pathname}?project=${id}`, { scroll: false })
  }

  const selected = projects.find((p) => p.id === paramId) ?? projects[0] ?? null
  const activeId = selected?.id ?? null

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b md:h-full md:w-72 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-sm font-semibold">Projects</h1>
          <Button size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3 w-3" /> New
          </Button>
        </div>
        {/* Small screens: a compact switcher instead of the full list */}
        {projects.length > 0 && (
          <div className="px-4 pb-3 md:hidden">
            <Select value={activeId ?? ""} onChange={(e) => select(e.target.value)} aria-label="Select project">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
        )}
        <div className={cn("flex-1 space-y-2 overflow-y-auto p-3 pt-0 no-scrollbar", projects.length > 0 && "hidden md:block")}>
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)
          ) : projects.length === 0 ? (
            <div className="px-2 py-10 text-center">
              <p className="text-sm font-medium">No projects yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Create one to get started.</p>
            </div>
          ) : (
            projects.map((p) => (
              <ProjectRow key={p.id} project={p} selected={p.id === activeId} onSelect={() => select(p.id)} />
            ))
          )}
        </div>
      </aside>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {activeId ? (
          <ProjectDetail projectId={activeId} />
        ) : !isLoading ? (
          <div className="p-6">
            <EmptyState
              icon={<Zap className="h-5 w-5" />}
              title="Start your first project"
              description="Bring a PRD or a GitHub repository's issues — Gravel analyzes, plans, builds and verifies each task, with you approving every gate."
              action={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> New project</Button>}
            />
          </div>
        ) : null}
      </main>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(p) => select(p.id)} />
    </div>
  )
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsView />
    </Suspense>
  )
}
