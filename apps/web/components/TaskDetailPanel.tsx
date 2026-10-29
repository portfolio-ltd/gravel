"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ExternalLink, GitBranch, GitPullRequest, Globe, Hand, X } from "lucide-react"
import type { Task } from "@/types"
import { useProject } from "@/hooks/useProjects"
import { useWorkflow } from "@/hooks/useWorkflows"
import { useTaskRuns } from "@/hooks/useTaskRuns"
import { useTaskDocuments, useTaskQuestions } from "@/hooks/useSdlc"
import { useSetTaskTags } from "@/hooks/useTags"
import TagPicker from "@/components/TagPicker"
import Markdown from "@/components/Markdown"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import StageStepper from "@/components/sdlc/StageStepper"
import GateActions from "@/components/sdlc/GateActions"
import CriteriaEditor from "@/components/sdlc/CriteriaEditor"
import DependenciesEditor from "@/components/sdlc/DependenciesEditor"
import QuestionsPanel from "@/components/sdlc/QuestionsPanel"
import DocumentsPanel from "@/components/sdlc/DocumentsPanel"
import ActivityPanel from "@/components/sdlc/ActivityPanel"
import DiscussionPanel from "@/components/sdlc/DiscussionPanel"
import LinksPanel from "@/components/LinksPanel"
import { useLinks } from "@/hooks/useLinks"
import { isGated, issueRef, OUTCOME_META, PRIORITY_TONE, STATUS_LABELS } from "@/components/sdlc/meta"
import { cn } from "@/lib/utils"

interface Props {
  task: Task
  onClose: () => void
}

function Count({ n, tone = "muted" }: { n: number; tone?: "muted" | "warning" }) {
  if (!n) return null
  return (
    <span className={cn("ml-1.5 min-w-[18px] rounded-full px-1.5 text-[10px] font-semibold leading-[18px]",
      tone === "warning" ? "bg-warning/15 text-warning" : "bg-muted-foreground/15 text-muted-foreground")}>
      {n}
    </span>
  )
}

const TAB_TRIGGER = "rounded-none border-b-2 border-transparent bg-transparent px-3 pb-2.5 pt-2 text-xs shadow-none " +
  "data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function TaskDetailPanel({ task: initialTask, onClose }: Props) {
  // The project detail carries the freshest copy of the task (sockets invalidate it)
  const { data: project } = useProject(initialTask.project_id)
  const task = useMemo(
    () => project?.tasks.find((t) => t.id === initialTask.id) ?? initialTask,
    [project, initialTask],
  )
  const { data: workflow } = useWorkflow(project?.workflow_id)
  const { data: runs } = useTaskRuns(task.id)
  const { data: questions } = useTaskQuestions(task.id)
  const { data: documents } = useTaskDocuments(task.id)
  const { data: links } = useLinks("task", task.id)
  const setTaskTags = useSetTaskTags()
  const [tab, setTab] = useState("overview")
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    // Modal behaviour: focus moves in, Tab cycles inside the panel, and focus
    // returns to whatever opened it (usually the board card) on close.
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      const panel = panelRef.current
      const active = document.activeElement
      // A nested dialog or menu (portalled outside the panel) handles its own keys
      if (panel && active?.closest('[role="dialog"], [role="menu"]') && !panel.contains(active)) return
      if (e.key === "Escape") { onCloseRef.current(); return }
      if (e.key !== "Tab" || !panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetParent !== null)
      if (!focusable.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault(); first.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      opener?.focus?.()
    }
  }, [])

  const latestRun = runs?.[0]
  const gated = isGated(latestRun) ? latestRun : null
  const stages = workflow?.stages ?? []
  const gateStage = gated?.workflow_stage_id ? stages.find((s) => s.id === gated.workflow_stage_id) : null
  const openQuestions = (questions ?? []).filter((q) => q.status === "open").length
  const blockingOpen = (questions ?? []).filter((q) => q.status === "open" && q.blocking).length
  const issue = issueRef(task)

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-black/30 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-panel-title"
        className="relative flex h-full w-full animate-slide-in-right flex-col border-l bg-background shadow-2xl sm:w-[min(760px,92vw)]"
      >
        {/* Header */}
        <header className="border-b px-5 pb-3 pt-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {project && <p className="mb-1 truncate text-[11px] font-medium text-muted-foreground">{project.name}</p>}
              <h2 id="task-panel-title" className="text-base font-semibold leading-snug">{task.title}</h2>
            </div>
            <button ref={closeRef} onClick={onClose} aria-label="Close task"
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full border px-2 py-0.5 font-medium">{STATUS_LABELS[task.status] ?? task.status}</span>
            <span className={cn("rounded-full px-2 py-0.5 font-medium capitalize", PRIORITY_TONE[task.priority])}>{task.priority}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium capitalize text-muted-foreground">{task.type}</span>
            {task.rework_count > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">rework ×{task.rework_count}</span>
            )}
            {task.branch_name && (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px]">
                <GitBranch className="h-3 w-3" /> {task.branch_name}
              </span>
            )}
            {task.pr_url && (
              <a href={task.pr_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 font-medium text-info hover:underline">
                <GitPullRequest className="h-3 w-3" /> Pull request
              </a>
            )}
            {task.deploy_url && (
              <a href={task.deploy_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 font-medium text-success hover:underline">
                <Globe className="h-3 w-3" /> Live
              </a>
            )}
            {issue && task.external_url && (
              <a href={task.external_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium hover:bg-muted">
                <ExternalLink className="h-3 w-3" /> {issue}
              </a>
            )}
          </div>
          <div className="mt-2">
            <TagPicker selected={task.tags ?? []} onChange={(tagIds) => setTaskTags.mutate({ taskId: task.id, tagIds })} />
          </div>

          {stages.length > 0 && (
            <div className="mt-4">
              <StageStepper stages={stages} currentStageId={task.workflow_stage_id} done={task.status === "done"} waiting={!!gated} />
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Gate */}
          {gated && (
            <section className="mx-5 mt-4 rounded-xl border border-warning/40 bg-warning/5 p-4" aria-label="Awaiting your decision">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Hand className="h-4 w-4 text-warning" />
                <h3 className="text-sm font-semibold">
                  {gateStage ? `${gateStage.name} is waiting for you` : `${gated.phase[0].toUpperCase()}${gated.phase.slice(1)} phase is waiting for you`}
                </h3>
                {gated.outcome && (
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", OUTCOME_META[gated.outcome].tone)}>
                    {OUTCOME_META[gated.outcome].label}
                  </span>
                )}
              </div>
              {gated.blocking_reason && <p className="mb-2 text-xs text-foreground/80">{gated.blocking_reason}</p>}
              {blockingOpen > 0 && gateStage?.block_on_open_questions && (
                <button onClick={() => setTab("overview")}
                  className="mb-2 rounded-md bg-warning/15 px-2 py-1 text-[11px] font-medium text-warning hover:underline">
                  Answer or defer {blockingOpen} blocking question{blockingOpen === 1 ? "" : "s"} first →
                </button>
              )}
              {gated.summary && (
                <div className="mb-3 max-h-48 overflow-y-auto rounded-lg border bg-background/70 px-3 py-2">
                  <Markdown className="text-xs">{gated.summary}</Markdown>
                </div>
              )}
              <GateActions runId={gated.id} taskId={task.id} />
            </section>
          )}

          <Tabs value={tab} onValueChange={setTab} className="px-5 pt-3">
            <TabsList className="no-scrollbar h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent p-0">
              <TabsTrigger value="overview" className={TAB_TRIGGER}>
                Overview <Count n={openQuestions} tone="warning" />
              </TabsTrigger>
              <TabsTrigger value="documents" className={TAB_TRIGGER}>
                Documents <Count n={documents?.length ?? 0} />
              </TabsTrigger>
              <TabsTrigger value="activity" className={TAB_TRIGGER}>
                Activity <Count n={runs?.length ?? 0} />
              </TabsTrigger>
              <TabsTrigger value="discussion" className={TAB_TRIGGER}>Discussion</TabsTrigger>
              <TabsTrigger value="links" className={TAB_TRIGGER}>
                Links <Count n={links?.length ?? 0} />
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 pb-8 pt-3">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</h3>
                {task.description
                  ? <Markdown>{task.description}</Markdown>
                  : <p className="text-xs text-muted-foreground">No description.</p>}
              </section>
              <CriteriaEditor task={task} />
              {project && <DependenciesEditor task={task} projectTasks={project.tasks} />}
              <QuestionsPanel taskId={task.id} />
            </TabsContent>
            <TabsContent value="documents" className="pb-8 pt-3">
              <DocumentsPanel taskId={task.id} />
            </TabsContent>
            <TabsContent value="activity" className="pb-8 pt-3">
              <ActivityPanel taskId={task.id} stages={stages} />
            </TabsContent>
            <TabsContent value="discussion" className="pb-8 pt-3">
              <DiscussionPanel taskId={task.id} />
            </TabsContent>
            <TabsContent value="links" className="pb-8 pt-3">
              <LinksPanel entityType="task" entityId={task.id} title="External links"
                hint="Designs, tickets, dashboards and specs for this task. Engineer runs get them, with the project's links, as LINKS.md." />
            </TabsContent>
          </Tabs>
        </div>
      </aside>
    </div>
  )
}
