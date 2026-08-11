"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import { GitBranch, Plus, ArrowUp, ArrowDown, Trash2, Bot, UserCheck, Loader2 } from "lucide-react"
import {
  useWorkflow, useUpdateWorkflow, useAddStage, useUpdateStage, useDeleteStage, useReorderStages,
} from "@/hooks/useWorkflows"
import { useEngineers } from "@/hooks/useEngineers"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { WorkflowStage } from "@/types"

function StageCard({
  stage, index, total, workflowId, siblings,
}: {
  stage: WorkflowStage
  index: number
  total: number
  workflowId: string
  siblings: WorkflowStage[]
}) {
  const { data: engineers } = useEngineers()
  const updateStage = useUpdateStage()
  const deleteStage = useDeleteStage()
  const reorder = useReorderStages()
  const [instructions, setInstructions] = useState(stage.stage_instructions ?? "")
  const [name, setName] = useState(stage.name)

  async function patch(data: Record<string, unknown>) {
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
    <div className="bg-background rounded-xl border p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex flex-col gap-0.5">
          <button onClick={() => move(-1)} disabled={index === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-30">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => move(1)} disabled={index === total - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-30">
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <span className="text-xs font-bold text-muted-foreground w-5">{index + 1}.</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== stage.name && patch({ name: name.trim() })}
          className="flex-1 text-sm font-semibold px-2 py-1.5 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex items-center gap-1.5">
          {stage.is_ai_executable
            ? <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700"><Bot className="w-3 h-3" /> AI</span>
            : <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"><UserCheck className="w-3 h-3" /> Manual</span>}
          <button onClick={handleDelete} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={stage.is_ai_executable}
            onChange={(e) => patch({ is_ai_executable: e.target.checked })}
          />
          <span>AI executable <span className="text-muted-foreground">— unchecked = manual checkpoint a human approves</span></span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={stage.requires_human_approval}
            onChange={(e) => patch({ requires_human_approval: e.target.checked })}
          />
          <span>Review gate <span className="text-muted-foreground">— pause for approval after this stage completes</span></span>
        </label>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Assigned engineer</label>
          <select
            value={stage.assigned_engineer_id ?? ""}
            onChange={(e) => patch({ assigned_engineer_id: e.target.value || null })}
            className="w-full text-xs px-2 py-1.5 rounded-lg border bg-background"
          >
            <option value="">Any engineer</option>
            {(engineers ?? []).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">On failure, rework via</label>
            <select
              value={stage.rework_target_stage_id ?? ""}
              onChange={(e) => patch({ rework_target_stage_id: e.target.value || null })}
              className="w-full text-xs px-2 py-1.5 rounded-lg border bg-background"
            >
              <option value="">None — block on failure</option>
              {siblings.filter((s) => s.id !== stage.id).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Max attempts</label>
            <input
              type="number" min={1} max={10}
              defaultValue={stage.max_rework_attempts}
              onBlur={(e) => {
                const v = parseInt(e.target.value, 10)
                if (v >= 1 && v !== stage.max_rework_attempts) patch({ max_rework_attempts: v })
              }}
              className="w-full text-xs px-2 py-1.5 rounded-lg border bg-background"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="text-[11px] font-medium text-muted-foreground block mb-1">
          Stage instructions <span className="font-normal">(override the default prompt for this stage)</span>
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          onBlur={() => (instructions || null) !== stage.stage_instructions && patch({ stage_instructions: instructions || null })}
          rows={2}
          placeholder={`Complete the '${stage.name}' stage for this task.`}
          className="w-full text-xs px-2 py-1.5 rounded-lg border bg-background font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  )
}

export default function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: wf, isLoading } = useWorkflow(id)
  const updateWorkflow = useUpdateWorkflow()
  const addStage = useAddStage()
  const [newStageName, setNewStageName] = useState("")

  async function handleAddStage() {
    if (!newStageName.trim()) return
    try {
      await addStage.mutateAsync({ workflowId: id, name: newStageName.trim() })
      setNewStageName("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add stage")
    }
  }

  if (isLoading || !wf) {
    return <div className="p-6 text-sm text-muted-foreground">Loading workflow…</div>
  }

  const stages = [...wf.stages].sort((a, b) => a.stage_order - b.stage_order)

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <GitBranch className="w-5 h-5 text-primary" />
          <input
            defaultValue={wf.name}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== wf.name) updateWorkflow.mutate({ id, name: v })
            }}
            className="text-xl font-bold bg-transparent focus:outline-none focus:ring-1 focus:ring-primary rounded px-1 flex-1"
          />
        </div>
        <button onClick={() => router.push("/workflows")} className="text-xs text-muted-foreground hover:text-foreground mb-6">
          ← Back to workflows
        </button>

        <div className={cn("space-y-3", (updateWorkflow.isPending || addStage.isPending) && "opacity-70")}>
          {stages.map((stage, i) => (
            <StageCard
              key={stage.id}
              stage={stage}
              index={i}
              total={stages.length}
              workflowId={id}
              siblings={stages}
            />
          ))}
        </div>

        <div className="flex gap-2 mt-4">
          <input
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddStage()}
            placeholder="New stage name…"
            className="flex-1 text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button size="sm" onClick={handleAddStage} disabled={!newStageName.trim() || addStage.isPending}>
            {addStage.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add stage
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground mt-4">
          Tasks flow through stages top to bottom. A <b>manual</b> stage parks the task until a human
          approves it. A <b>review gate</b> pauses after the stage's AI run completes. Failures follow
          the rework target until max attempts, then wait for human attention.
        </p>
      </div>
    </div>
  )
}
