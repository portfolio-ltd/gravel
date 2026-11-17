"use client"

import { useState } from "react"
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Repeat, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { useDeleteStage, useReorderStages, useUpdateStage } from "@/hooks/useWorkflows"
import { useEngineers } from "@/hooks/useEngineers"
import { useHarnesses } from "@/hooks/useHarnesses"
import { Button } from "@/components/ui/button"
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { HelpHint, Tooltip } from "@/components/ui/tooltip"
import { ROLE_STYLE } from "@/components/workflow/Pipeline"
import type { GlossaryKey } from "@/lib/glossary"
import { loopsOfStage, orderedStages } from "@/lib/workflowCanvas"
import { cn, formatRelativeTime } from "@/lib/utils"
import type { ModelOption, StageRole, StageRoleKey, WorkflowLoop, WorkflowStage, WorkflowStageCreate } from "@/types"

const PROVIDER_LABELS: Record<ModelOption["provider"], string> = { anthropic: "Anthropic", openai: "OpenAI", groq: "Groq" }

const PART_LABEL = {
  start: "Starts here",
  check: "Checked here",
  both: "Starts and is checked here",
  inside: "Runs through here",
} as const

function ToggleRow({ label, hint, help, checked, onChange }: {
  label: string; hint: string; help: GlossaryKey; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-xs font-medium">{label} <HelpHint term={help} /></p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} className="mt-0.5" />
    </div>
  )
}

/** Right-hand panel for the selected stage: configure it, route it, loop it. */
export default function StageInspector({ stage, workflowId, stages, loops, roles, models, onClose, onEditLoop, onNewLoop }: {
  stage: WorkflowStage
  workflowId: string
  stages: WorkflowStage[]
  loops: WorkflowLoop[]
  roles: StageRole[]
  models: ModelOption[]
  onClose: () => void
  onEditLoop: (loop: WorkflowLoop) => void
  onNewLoop: (preset: { entry?: string; check?: string }) => void
}) {
  const { data: engineers } = useEngineers()
  const { data: harnesses } = useHarnesses()
  const updateStage = useUpdateStage()
  const deleteStage = useDeleteStage()
  const reorder = useReorderStages()
  const [name, setName] = useState(stage.name)
  const [instructions, setInstructions] = useState(stage.stage_instructions ?? "")
  const [showDefaults, setShowDefaults] = useState(false)

  const ordered = orderedStages(stages)
  const index = ordered.findIndex((s) => s.id === stage.id)
  const siblings = ordered.filter((s) => s.id !== stage.id)
  const role = roles.find((r) => r.key === stage.role)
  const style = ROLE_STYLE[stage.role] ?? ROLE_STYLE.custom
  const assignedEngineer = engineers?.find((e) => e.id === stage.assigned_engineer_id)
  const providers = (Object.keys(PROVIDER_LABELS) as ModelOption["provider"][]).filter((p) => models.some((m) => m.provider === p))
  const parts = loopsOfStage(stage.id, stages, loops)
  const checkedLoop = loops.find((l) => l.check_stage_id === stage.id)
  const defaultHarness = (harnesses ?? []).find((h) => h.is_default)

  async function patch(data: Partial<WorkflowStageCreate>) {
    try {
      await updateStage.mutateAsync({ workflowId, stageId: stage.id, ...data })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update stage")
    }
  }

  function move(dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= ordered.length) return
    const items = ordered.map((s, i) => ({ id: s.id, stage_order: i }))
    ;[items[index].stage_order, items[target].stage_order] = [items[target].stage_order, items[index].stage_order]
    reorder.mutate({ workflowId, stages: items })
  }

  async function handleDelete() {
    if (!confirm(`Delete stage "${stage.name}"? Loops that start or end here are deleted too.`)) return
    try {
      await deleteStage.mutateAsync({ workflowId, stageId: stage.id })
      toast.success("Stage deleted")
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete stage")
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", style.className)}>{style.icon}</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== stage.name && patch({ name: name.trim() })}
          aria-label="Stage name"
          className="h-8 flex-1 border-transparent bg-transparent px-1.5 text-base font-semibold shadow-none hover:border-input"
        />
        <Tooltip content="Close (Esc)">
          <button onClick={onClose} aria-label="Close stage panel" className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>

      <Tabs defaultValue="configure" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 mt-3 grid h-9 grid-cols-3">
          <TabsTrigger value="configure" className="text-xs">Configure</TabsTrigger>
          <TabsTrigger value="routing" className="text-xs">Routing</TabsTrigger>
          <TabsTrigger value="loops" className="gap-1 text-xs">
            Loops
            {parts.length > 0 && <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">{parts.length}</span>}
          </TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <TabsContent value="configure" className="mt-3 space-y-4">
            <Field label="Role" help="role">
              <Select value={stage.role} onChange={(e) => patch({ role: e.target.value as StageRoleKey })}>
                {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                {roles.length === 0 && <option value={stage.role}>{stage.role}</option>}
              </Select>
            </Field>
            {role && (
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {role.description}
                {role.produces.length > 0 && (
                  <span className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-wider">Produces</span>
                    {role.produces.map((p) => (
                      <span key={p} className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground">{p}</span>
                    ))}
                  </span>
                )}
              </div>
            )}

            <div className="space-y-2">
              <ToggleRow label="Run by AI" help="aiStage" hint="Off = a manual checkpoint a person completes."
                checked={stage.is_ai_executable} onChange={(v) => patch({ is_ai_executable: v })} />
              <ToggleRow label="Approval gate" help="gate" hint="Pause for sign-off after the stage completes."
                checked={stage.requires_human_approval} onChange={(v) => patch({ requires_human_approval: v })} />
              <ToggleRow label="Wait for open questions" help="waitQuestions" hint="Hold the result until blocking questions are answered."
                checked={stage.block_on_open_questions} onChange={(v) => patch({ block_on_open_questions: v })} />
            </div>

            <Field label="Engineer" help="engineer">
              <Select value={stage.assigned_engineer_id ?? ""} onChange={(e) => patch({ assigned_engineer_id: e.target.value || null })}>
                <option value="">Any engineer</option>
                {(engineers ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>

            <Field label="Model" help="model" hint={stage.model ? "Overrides the engineer and project model for this stage." : undefined}>
              <Select value={stage.model ?? ""} onChange={(e) => patch({ model: e.target.value || null })} disabled={!stage.is_ai_executable} aria-label="Stage model">
                <option value="">{assignedEngineer ? `Inherit — ${assignedEngineer.model_name}` : "Inherit — engineer or project model"}</option>
                {stage.model && !models.some((m) => m.id === stage.model) && <option value={stage.model}>{stage.model}</option>}
                {providers.map((p) => (
                  <optgroup key={p} label={PROVIDER_LABELS[p]}>
                    {models.filter((m) => m.provider === p).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </optgroup>
                ))}
              </Select>
            </Field>

            <Field label="Harness" help="harness"
              hint={stage.harness_id ? "Pinned for this stage's runs." : defaultHarness ? `Inherits the organization default — ${defaultHarness.name}.` : "Inherits Gravel's built-in harness for the role."}>
              <Select value={stage.harness_id ?? ""} onChange={(e) => patch({ harness_id: e.target.value || null })} disabled={!stage.is_ai_executable} aria-label="Stage harness">
                <option value="">Inherit — organization default or built-in</option>
                {(harnesses ?? []).map((h) => (
                  <option key={h.id} value={h.id}>{h.name}{h.roles.length && !h.roles.includes(stage.role) ? ` (meant for ${h.roles.join(", ")})` : ""}</option>
                ))}
              </Select>
            </Field>

            <Field label="Instructions" help="instructions"
              hint={instructions.trim() ? "Custom instructions replace the role's defaults." : "Empty — this stage uses the role's default instructions."}>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                onBlur={() => (instructions || null) !== stage.stage_instructions && patch({ stage_instructions: instructions || null })}
                rows={5}
                placeholder={role?.default_instructions ? "Using role defaults — type to override…" : `Complete the '${stage.name}' stage for this task.`}
                className="font-mono text-xs"
              />
            </Field>
            {!instructions.trim() && role?.default_instructions && (
              <div>
                <button onClick={() => setShowDefaults((v) => !v)} aria-expanded={showDefaults}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                  {showDefaults ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} Preview role defaults
                </button>
                {showDefaults && (
                  <div className="mt-2 space-y-2">
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {role.default_instructions}
                    </pre>
                    <Button size="sm" variant="outline" onClick={() => setInstructions(role.default_instructions)}>Copy into editor to customize</Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="routing" className="mt-3 space-y-4">
            <Field label="On success, go to" help="successEdge">
              <Select value={stage.next_stage_id ?? ""} onChange={(e) => patch({ next_stage_id: e.target.value || null })} aria-label="Next stage on success">
                <option value="">{index === ordered.length - 1 ? "Done — the task is complete" : `Next in order — ${ordered[index + 1]?.name}`}</option>
                {siblings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>

            {checkedLoop && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                <p className="flex items-center gap-1 font-medium text-primary"><Repeat className="h-3.5 w-3.5" /> This stage checks “{checkedLoop.name}”</p>
                <p className="mt-0.5 text-muted-foreground">
                  On failure the loop decides: another pass from its start stage, or its exhaustion rule. The rework edge below only
                  applies if the loop is deleted.
                </p>
              </div>
            )}

            <div className={cn("grid grid-cols-[1fr_96px] gap-2", checkedLoop && "opacity-60")}>
              <Field label="On failure, rework via" help="reworkEdge">
                <Select value={stage.rework_target_stage_id ?? ""} onChange={(e) => patch({ rework_target_stage_id: e.target.value || null })}>
                  <option value="">None — wait for a person</option>
                  {siblings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="Attempts" help="maxAttempts">
                <Input type="number" min={1} max={10} defaultValue={stage.max_rework_attempts} key={stage.max_rework_attempts}
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (v >= 1 && v !== stage.max_rework_attempts) patch({ max_rework_attempts: v })
                  }} />
              </Field>
            </div>

            <p className="flex items-start gap-1.5 rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              <HelpHint term="stopRule" className="mt-px" />
              A success edge back to an earlier stage makes an open-ended cycle; the stop rule parks it after 10 visits.
              For a bounded cycle with an exit condition, use a loop.
            </p>
          </TabsContent>

          <TabsContent value="loops" className="mt-3 space-y-3">
            {parts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                This stage isn’t part of a loop. A loop repeats work → check until an exit condition holds — for example Build → Test
                until every test passes.
              </p>
            )}
            {parts.map(({ loop, part }) => (
              <button key={loop.id} onClick={() => onEditLoop(loop)}
                className="w-full rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5">
                <div className="flex items-center gap-2">
                  <Repeat className="h-3.5 w-3.5 text-primary" />
                  <span className="flex-1 truncate text-sm font-medium">{loop.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{PART_LABEL[part]}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">Until: {loop.goal || "the check stage passes"}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  ≤{loop.max_iterations} passes{loop.max_cost_usd ? ` · $${loop.max_cost_usd.toFixed(2)} budget` : ""} · then {loop.on_exhausted === "ask_human" ? "ask a person" : "proceed"}
                </p>
              </button>
            ))}
            <div className="flex flex-wrap gap-2">
              {!checkedLoop && (
                <Button size="sm" variant="outline" onClick={() => onNewLoop({ check: stage.id })}>
                  <Plus className="h-3.5 w-3.5" /> Loop checked here
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => onNewLoop({ entry: stage.id })}>
                <Plus className="h-3.5 w-3.5" /> Loop starting here
              </Button>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <div className="flex items-center gap-1 border-t px-4 py-2.5">
        <p className="flex-1 truncate text-[11px] text-muted-foreground">Saves as you go · edited {formatRelativeTime(stage.updated_at)}</p>
        <Tooltip content="Move up">
          <button onClick={() => move(-1)} disabled={index <= 0} aria-label="Move stage up" className="rounded p-1.5 hover:bg-muted disabled:opacity-30">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
        <Tooltip content="Move down">
          <button onClick={() => move(1)} disabled={index === ordered.length - 1} aria-label="Move stage down" className="rounded p-1.5 hover:bg-muted disabled:opacity-30">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
        <Tooltip content="Delete stage">
          <button onClick={handleDelete} aria-label={`Delete stage ${stage.name}`} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
