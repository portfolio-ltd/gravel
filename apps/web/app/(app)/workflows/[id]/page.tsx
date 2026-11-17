"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronRight, Copy, FolderKanban, HelpCircle, Loader2, Plus, Repeat } from "lucide-react"
import { toast } from "sonner"
import { useAddStage, useUpdateWorkflow, useWorkflow } from "@/hooks/useWorkflows"
import { useEngineers } from "@/hooks/useEngineers"
import { useMeta } from "@/hooks/useSdlc"
import { useProjects } from "@/hooks/useProjects"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, Input, Select } from "@/components/ui/form"
import { HelpHint, Tooltip } from "@/components/ui/tooltip"
import { PipelineLegend } from "@/components/workflow/Pipeline"
import WorkflowCanvas from "@/components/workflow/WorkflowCanvas"
import StageInspector from "@/components/workflow/StageInspector"
import LoopEditor from "@/components/workflow/LoopEditor"
import { unreachableStages } from "@/lib/workflowCanvas"
import { cn } from "@/lib/utils"
import type { StageRoleKey, WorkflowLoop } from "@/types"

function AddStageDialog({ open, onOpenChange, workflowId }: { open: boolean; onOpenChange: (v: boolean) => void; workflowId: string }) {
  const { data: meta } = useMeta()
  const addStage = useAddStage()
  const [name, setName] = useState("")
  const [role, setRole] = useState<StageRoleKey>("build")
  const roles = meta?.stage_roles ?? []
  const description = roles.find((r) => r.key === role)?.description

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await addStage.mutateAsync({ workflowId, name: name.trim(), role })
      toast.success(`Added “${name.trim()}”`)
      setName("")
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add stage")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a stage</DialogTitle>
          <DialogDescription>It goes at the end; move it from the stage panel.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Name">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Security review" />
          </Field>
          <Field label="Role" help="role" hint={description}>
            <Select value={role} onChange={(e) => setRole(e.target.value as StageRoleKey)}>
              {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              {roles.length === 0 && <option value="custom">Custom</option>}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={!name.trim() || addStage.isPending}>
              {addStage.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add stage
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function HowItWorksDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>How a workflow runs</DialogTitle>
        </DialogHeader>
        <ol className="space-y-2.5 text-sm">
          <li><b>Down the middle.</b> A task runs each stage top to bottom, unless a stage names another stage <i>on success</i> (drawn on the left).</li>
          <li><b>Gates.</b> An approval gate pauses after the stage; the task waits in Attention for a person. A manual step waits for a person to do the work.</li>
          <li><b>Rework.</b> When a stage fails, its rework edge (dashed, left) sends the task back, up to its max attempts.</li>
          <li><b>Loops.</b> A loop (right, in the accent color) repeats its stages until the check stage confirms the exit condition. Each pass gets the check’s findings; the loop stops after its pass limit or budget and then asks a person, or proceeds.</li>
          <li><b>Safety net.</b> The stop rule parks a task that enters one stage 10 times without a human approval.</li>
        </ol>
        <PipelineLegend />
      </DialogContent>
    </Dialog>
  )
}

export default function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: wf, isLoading } = useWorkflow(id)
  const { data: meta } = useMeta()
  const { data: engineers } = useEngineers()
  const { data: projects } = useProjects()
  const updateWorkflow = useUpdateWorkflow()
  const [selected, setSelected] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [loopDialog, setLoopDialog] = useState<{ loop: WorkflowLoop | null; preset?: { entry?: string; check?: string } } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loopDialog && !addOpen && !helpOpen) setSelected(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [loopDialog, addOpen, helpOpen])

  if (isLoading || !wf) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading workflow" />
      </div>
    )
  }

  const stages = wf.stages
  const loops = wf.loops ?? []
  const roles = meta?.stage_roles ?? []
  const stage = stages.find((s) => s.id === selected) ?? null
  const unreachable = unreachableStages(stages, loops)
  const usedBy = (projects ?? []).filter((p) => p.workflow_id === wf.id)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-4 py-2.5 sm:px-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/workflows" className="hover:text-foreground">Workflows</Link>
            <ChevronRight className="h-3 w-3" />
            <input
              defaultValue={wf.name}
              key={wf.name}
              aria-label="Workflow name"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== wf.name) updateWorkflow.mutate({ id, name: v })
              }}
              className="min-w-0 flex-1 rounded bg-transparent px-1 text-base font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <Tooltip content="Copy the workflow id (for the API and the gravel CLI)">
              <button
                onClick={() => { navigator.clipboard?.writeText(wf.id).then(() => toast.success("Workflow id copied")).catch(() => {}) }}
                className="inline-flex shrink-0 items-center gap-1 rounded px-1 font-mono text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                wf_{wf.id.slice(0, 18)} <Copy className="h-3 w-3" />
              </button>
            </Tooltip>
            <input
              defaultValue={wf.description ?? ""}
              key={wf.description ?? ""}
              aria-label="Workflow description"
              placeholder="Add a description…"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v !== (wf.description ?? "")) updateWorkflow.mutate({ id, description: v })
              }}
              className="hidden min-w-0 flex-1 truncate rounded bg-transparent px-1 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring md:block"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {unreachable.length > 0 && (
            <Tooltip content={`No path from “${stages.find((s) => s.stage_order === Math.min(...stages.map((x) => x.stage_order)))?.name}” reaches: ${unreachable.map((s) => s.name).join(", ")}. Tasks will never get there.`}>
              <span tabIndex={0} className="inline-flex items-center gap-1 rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                <AlertTriangle className="h-3.5 w-3.5" /> {unreachable.length} unreachable
              </span>
            </Tooltip>
          )}
          <Tooltip content={usedBy.length ? `Used by ${usedBy.map((p) => p.name).join(", ")}. Changes apply to their next stage runs.` : "No project uses this workflow yet — pick it when you create or edit a project."}>
            <span tabIndex={0} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs text-muted-foreground">
              <FolderKanban className="h-3.5 w-3.5" /> {usedBy.length} project{usedBy.length === 1 ? "" : "s"}
            </span>
          </Tooltip>
          <span className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs text-muted-foreground">
            {stages.length} stage{stages.length === 1 ? "" : "s"}
            <span className="text-muted-foreground/50">·</span>
            <Repeat className="h-3 w-3 text-primary" /> {loops.length} loop{loops.length === 1 ? "" : "s"}
            <HelpHint term="loop" />
          </span>
        </div>
      </header>

      {/* Canvas + inspector */}
      <div className="relative flex min-h-0 flex-1">
        <div
          className="relative min-w-0 flex-1 overflow-auto bg-muted/20 [background-image:radial-gradient(hsl(var(--border))_1px,transparent_1px)] [background-size:18px_18px]"
          onClick={(e) => { if (e.target === e.currentTarget) setSelected(null) }}
        >
          {stages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm font-semibold">No stages yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">Add the first stage — for example Plan, then Build, then Test — and wire a loop between Build and Test.</p>
              <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-3.5 w-3.5" /> Add stage</Button>
            </div>
          ) : (
            <div className="min-w-max p-6 pb-28">
              <WorkflowCanvas
                stages={stages}
                loops={loops}
                roles={roles}
                engineers={engineers ?? []}
                selectedId={selected}
                onSelect={setSelected}
                onAddStage={() => setAddOpen(true)}
                onEditLoop={(loop) => setLoopDialog({ loop })}
              />
            </div>
          )}
        </div>

        {/* Floating toolbar */}
        <div className={cn(
          "pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4",
          stage && "lg:right-[400px]",
        )}>
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border bg-background/95 p-1.5 shadow-lg backdrop-blur">
            <Tooltip content="Add a stage at the end of the workflow">
              <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-3.5 w-3.5" /> Add stage</Button>
            </Tooltip>
            <Tooltip content="Repeat work → check until an exit condition holds">
              <Button size="sm" variant="outline" onClick={() => setLoopDialog({ loop: null })} disabled={stages.length === 0}>
                <Repeat className="h-3.5 w-3.5" /> Add loop
              </Button>
            </Tooltip>
            <Tooltip content="How a workflow runs">
              <Button size="sm" variant="ghost" onClick={() => setHelpOpen(true)} aria-label="How a workflow runs">
                <HelpCircle className="h-3.5 w-3.5" /> <span className="hidden sm:inline">How it works</span>
              </Button>
            </Tooltip>
          </div>
        </div>

        {stage && (
          <aside className="absolute inset-y-0 right-0 z-20 w-full max-w-[400px] animate-slide-in-right border-l bg-background shadow-xl lg:static lg:shadow-none">
            <StageInspector
              key={stage.id}
              stage={stage}
              workflowId={wf.id}
              stages={stages}
              loops={loops}
              roles={roles}
              models={meta?.models ?? []}
              onClose={() => setSelected(null)}
              onEditLoop={(loop) => setLoopDialog({ loop })}
              onNewLoop={(preset) => setLoopDialog({ loop: null, preset })}
            />
          </aside>
        )}
      </div>

      <AddStageDialog open={addOpen} onOpenChange={setAddOpen} workflowId={wf.id} />
      <HowItWorksDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <LoopEditor
        open={!!loopDialog}
        onOpenChange={(v) => { if (!v) setLoopDialog(null) }}
        workflowId={wf.id}
        stages={stages}
        loops={loops}
        loop={loopDialog?.loop ?? null}
        preset={loopDialog?.preset}
      />
    </div>
  )
}
