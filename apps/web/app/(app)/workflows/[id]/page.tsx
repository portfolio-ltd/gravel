"use client"

import { use, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowUp, ArrowDown, Bot, ChevronDown, ChevronRight, GitBranch, Loader2, Plus, Trash2, UserCheck } from "lucide-react"
import {
  useWorkflow, useUpdateWorkflow, useAddStage, useUpdateStage, useDeleteStage, useReorderStages,
} from "@/hooks/useWorkflows"
import { useEngineers } from "@/hooks/useEngineers"
import { useMeta } from "@/hooks/useSdlc"
import { Button } from "@/components/ui/button"
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form"
import { Page, SectionCard } from "@/components/ui/page"
import { Pipeline, PipelineLegend, ROLE_STYLE, stagesFromWorkflow } from "@/components/workflow/Pipeline"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { StageRole, StageRoleKey, WorkflowStage, WorkflowStageCreate } from "@/types"

function ToggleRow({ label, hint, checked, onChange, disabled }: {
  label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5", disabled && "opacity-60")}>
      <div className="min-w-0">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={label} className="mt-0.5" />
    </div>
  )
}

function StageCard({
  stage, index, total, workflowId, siblings, roles,
}: {
  stage: WorkflowStage
  index: number
  total: number
  workflowId: string
  siblings: WorkflowStage[]
  roles: StageRole[]
}) {
  const { data: engineers } = useEngineers()
  const updateStage = useUpdateStage()
  const deleteStage = useDeleteStage()
  const reorder = useReorderStages()
  const [instructions, setInstructions] = useState(stage.stage_instructions ?? "")
  const [name, setName] = useState(stage.name)
  const [showDefaults, setShowDefaults] = useState(false)
  const role = roles.find((r) => r.key === stage.role)
  const style = ROLE_STYLE[stage.role] ?? ROLE_STYLE.custom

  async function patch(data: Partial<WorkflowStageCreate>) {
    try {
      await updateStage.mutateAsync({ workflowId, stageId: stage.id, ...data })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update stage")
    }
  }

  function move(dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= total) return
    const items = siblings.map((s, i) => ({ id: s.id, stage_order: i }))
    ;[items[index].stage_order, items[target].stage_order] = [items[target].stage_order, items[index].stage_order]
    reorder.mutate({ workflowId, stages: items })
  }

  async function handleDelete() {
    if (!confirm(`Delete stage "${stage.name}"?`)) return
    try {
      await deleteStage.mutateAsync({ workflowId, stageId: stage.id })
      toast.success("Stage deleted")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete stage")
    }
  }

  return (
    <div className="surface p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <button onClick={() => move(-1)} disabled={index === 0} aria-label="Move stage up" className="rounded p-0.5 hover:bg-muted disabled:opacity-30">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => move(1)} disabled={index === total - 1} aria-label="Move stage down" className="rounded p-0.5 hover:bg-muted disabled:opacity-30">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border", style.className)}>
          {style.icon}
        </span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== stage.name && patch({ name: name.trim() })}
          aria-label="Stage name"
          className="flex-1 font-semibold"
        />
        {stage.is_ai_executable
          ? <span className="hidden items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700 sm:flex"><Bot className="h-3 w-3" /> AI</span>
          : <span className="hidden items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 sm:flex"><UserCheck className="h-3 w-3" /> Manual</span>}
        <button onClick={handleDelete} aria-label={`Delete stage ${stage.name}`} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[200px_1fr]">
        <Field label="Role">
          <Select value={stage.role} onChange={(e) => patch({ role: e.target.value as StageRoleKey })}>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            {roles.length === 0 && <option value={stage.role}>{stage.role}</option>}
          </Select>
        </Field>
        <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:mt-5">
          {role ? (
            <>
              {role.description}
              {role.produces.length > 0 && (
                <span className="mt-1 block">
                  Produces: {role.produces.map((p) => (
                    <span key={p} className="mr-1 rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground">{p}</span>
                  ))}
                </span>
              )}
            </>
          ) : "Loading role…"}
        </div>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <ToggleRow
          label="Run by AI"
          hint="Off = a manual checkpoint a human completes and approves."
          checked={stage.is_ai_executable}
          onChange={(v) => patch({ is_ai_executable: v })}
        />
        <ToggleRow
          label="Approval gate"
          hint="Pause for human sign-off after the stage completes."
          checked={stage.requires_human_approval}
          onChange={(v) => patch({ requires_human_approval: v })}
        />
        <ToggleRow
          label="Wait for open questions"
          hint="Park the result until blocking questions are answered or deferred."
          checked={stage.block_on_open_questions}
          onChange={(v) => patch({ block_on_open_questions: v })}
        />
        <Field label="Assigned engineer">
          <Select
            value={stage.assigned_engineer_id ?? ""}
            onChange={(e) => patch({ assigned_engineer_id: e.target.value || null })}
          >
            <option value="">Any engineer</option>
            {(engineers ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
      </div>

      <div className="mb-4 grid grid-cols-[1fr_110px] gap-2">
        <Field label="On failure, rework via">
          <Select
            value={stage.rework_target_stage_id ?? ""}
            onChange={(e) => patch({ rework_target_stage_id: e.target.value || null })}
          >
            <option value="">None — wait for a human</option>
            {siblings.filter((s) => s.id !== stage.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Max attempts">
          <Input
            type="number" min={1} max={10}
            defaultValue={stage.max_rework_attempts}
            onBlur={(e) => {
              const v = parseInt(e.target.value, 10)
              if (v >= 1 && v !== stage.max_rework_attempts) patch({ max_rework_attempts: v })
            }}
          />
        </Field>
      </div>

      <Field
        label="Stage instructions"
        hint={instructions.trim() ? "Custom instructions replace the role's defaults." : "Empty — this stage uses the role's default instructions."}
      >
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          onBlur={() => (instructions || null) !== stage.stage_instructions && patch({ stage_instructions: instructions || null })}
          rows={3}
          placeholder={role?.default_instructions ? "Using role defaults — type to override…" : `Complete the '${stage.name}' stage for this task.`}
          className="font-mono text-xs"
        />
      </Field>
      {!instructions.trim() && role?.default_instructions && (
        <div className="mt-2">
          <button
            onClick={() => setShowDefaults((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={showDefaults}
          >
            {showDefaults ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Preview role defaults
          </button>
          {showDefaults && (
            <div className="mt-2 space-y-2">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {role.default_instructions}
              </pre>
              <Button size="sm" variant="outline" onClick={() => setInstructions(role.default_instructions)}>
                Copy into editor to customize
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: wf, isLoading } = useWorkflow(id)
  const { data: meta } = useMeta()
  const updateWorkflow = useUpdateWorkflow()
  const addStage = useAddStage()
  const [newStageName, setNewStageName] = useState("")
  const [newStageRole, setNewStageRole] = useState<StageRoleKey>("custom")

  async function handleAddStage() {
    if (!newStageName.trim()) return
    try {
      await addStage.mutateAsync({ workflowId: id, name: newStageName.trim(), role: newStageRole })
      setNewStageName("")
      setNewStageRole("custom")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add stage")
    }
  }

  if (isLoading || !wf) {
    return (
      <Page>
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="surface h-40 animate-pulse bg-muted/40" />)}</div>
      </Page>
    )
  }

  const stages = [...wf.stages].sort((a, b) => a.stage_order - b.stage_order)
  const roles = meta?.stage_roles ?? []

  return (
    <Page>
      <Link href="/workflows" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Workflows
      </Link>
      <div className="mb-1 flex items-center gap-2">
        <GitBranch className="h-5 w-5 shrink-0 text-primary" />
        <input
          defaultValue={wf.name}
          aria-label="Workflow name"
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v && v !== wf.name) updateWorkflow.mutate({ id, name: v })
          }}
          className="flex-1 rounded bg-transparent px-1 text-xl font-semibold tracking-tight focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <input
        defaultValue={wf.description ?? ""}
        aria-label="Workflow description"
        placeholder="Add a description…"
        onBlur={(e) => {
          const v = e.target.value.trim()
          if (v !== (wf.description ?? "")) updateWorkflow.mutate({ id, description: v })
        }}
        className="mb-6 w-full rounded bg-transparent px-1 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />

      <SectionCard title="Pipeline" description="How a task flows through this workflow." className="mb-6">
        <Pipeline stages={stagesFromWorkflow(stages)} />
        <div className="mt-3"><PipelineLegend /></div>
      </SectionCard>

      <div className={cn("space-y-3", (updateWorkflow.isPending || addStage.isPending) && "opacity-70")}>
        {stages.map((stage, i) => (
          <StageCard
            key={stage.id}
            stage={stage}
            index={i}
            total={stages.length}
            workflowId={id}
            siblings={stages}
            roles={roles}
          />
        ))}
      </div>

      <div className="surface mt-4 flex flex-col gap-2 p-3 sm:flex-row">
        <Input
          value={newStageName}
          onChange={(e) => setNewStageName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddStage()}
          placeholder="New stage name…"
          aria-label="New stage name"
          className="flex-1"
        />
        <Select
          value={newStageRole}
          onChange={(e) => setNewStageRole(e.target.value as StageRoleKey)}
          aria-label="New stage role"
          className="sm:w-40"
        >
          {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          {roles.length === 0 && <option value="custom">Custom</option>}
        </Select>
        <Button size="sm" className="h-9" onClick={handleAddStage} disabled={!newStageName.trim() || addStage.isPending}>
          {addStage.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add stage
        </Button>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        Tasks flow through stages top to bottom. A <b>manual</b> stage parks the task until a human approves it.
        An <b>approval gate</b> pauses after the stage&apos;s AI run completes. A review or verification that requests
        changes counts as a failure and follows the rework target until max attempts, then waits for a human.
      </p>
    </Page>
  )
}
