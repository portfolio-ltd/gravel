"use client"

import { useEffect, useState } from "react"
import { Loader2, Repeat, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useAddLoop, useDeleteLoop, useUpdateLoop } from "@/hooks/useWorkflows"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, Input, Segmented, Select, Switch, Textarea } from "@/components/ui/form"
import { HelpHint } from "@/components/ui/tooltip"
import { orderedStages } from "@/lib/workflowCanvas"
import type { LoopOnExhausted, WorkflowLoop, WorkflowStage } from "@/types"

interface Draft {
  name: string
  goal: string
  entry: string
  check: string
  maxIterations: string
  budget: string
  onExhausted: LoopOnExhausted
  carryFeedback: boolean
}

function draftFrom(loop: WorkflowLoop | null, stages: WorkflowStage[], preset?: { entry?: string; check?: string }): Draft {
  if (loop) {
    return {
      name: loop.name, goal: loop.goal ?? "", entry: loop.entry_stage_id, check: loop.check_stage_id,
      maxIterations: String(loop.max_iterations), budget: loop.max_cost_usd != null ? String(loop.max_cost_usd) : "",
      onExhausted: loop.on_exhausted, carryFeedback: loop.carry_feedback,
    }
  }
  const ordered = orderedStages(stages)
  // A sensible default: the first build stage starts, the first check-like stage after it checks
  const build = ordered.find((s) => s.role === "build") ?? ordered[0]
  const after = ordered.slice(ordered.indexOf(build) + 1)
  const check = after.find((s) => ["verify", "review"].includes(s.role)) ?? after[0] ?? build
  return {
    name: "", goal: "", entry: preset?.entry ?? build?.id ?? "", check: preset?.check ?? check?.id ?? "",
    maxIterations: "3", budget: "", onExhausted: "ask_human", carryFeedback: true,
  }
}

/** Create or edit one workflow loop. */
export default function LoopEditor({ open, onOpenChange, workflowId, stages, loops, loop, preset }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  stages: WorkflowStage[]
  /** The workflow's other loops — a stage can check only one */
  loops: WorkflowLoop[]
  loop: WorkflowLoop | null
  preset?: { entry?: string; check?: string }
}) {
  const add = useAddLoop()
  const update = useUpdateLoop()
  const del = useDeleteLoop()
  const [d, setD] = useState<Draft>(() => draftFrom(loop, stages, preset))
  useEffect(() => { if (open) setD(draftFrom(loop, stages, preset)) }, [open, loop, stages, preset])

  const ordered = orderedStages(stages)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const takenBy = loops.find((l) => l.check_stage_id === d.check && l.id !== loop?.id)
  const passes = parseInt(d.maxIterations, 10)
  const budget = d.budget.trim() ? Number(d.budget) : null
  const entryIdx = ordered.findIndex((s) => s.id === d.entry)
  const checkIdx = ordered.findIndex((s) => s.id === d.check)
  const problems = [
    !d.name.trim() && "Give the loop a name.",
    takenBy && `That check stage already checks “${takenBy.name}”.`,
    !(passes >= 1 && passes <= 25) && "Max passes must be between 1 and 25.",
    budget !== null && !(budget > 0) && "The budget must be a positive amount, or empty.",
  ].filter(Boolean) as string[]
  const pending = add.isPending || update.isPending

  async function save() {
    if (problems.length) return
    const body = {
      name: d.name.trim(), goal: d.goal.trim() || null, entry_stage_id: d.entry, check_stage_id: d.check,
      max_iterations: passes, max_cost_usd: budget, on_exhausted: d.onExhausted, carry_feedback: d.carryFeedback,
    }
    try {
      if (loop) await update.mutateAsync({ workflowId, loopId: loop.id, ...body })
      else await add.mutateAsync({ workflowId, ...body })
      toast.success(loop ? "Loop saved" : `Loop “${body.name}” added`)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the loop")
    }
  }

  async function remove() {
    if (!loop || !confirm(`Delete the loop “${loop.name}”? The check stage falls back to its rework edge.`)) return
    try {
      await del.mutateAsync({ workflowId, loopId: loop.id })
      toast.success("Loop deleted")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the loop")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Repeat className="h-4 w-4" /></span>
            {loop ? "Edit loop" : "New loop"}
            <HelpHint term="loopEngineering" />
          </DialogTitle>
          <DialogDescription>
            Work → check → repeat until the exit condition holds. You set how many passes and how much spend it may take.
          </DialogDescription>
        </DialogHeader>

        {/* A one-line preview of the loop, in words */}
        {entryIdx >= 0 && checkIdx >= 0 && (
          <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
            Start at <b>{ordered[entryIdx].name}</b>
            {entryIdx !== checkIdx && <>, run through <b>{ordered[checkIdx].name}</b></>}.
            {" "}If the check fails, start again at <b>{ordered[entryIdx].name}</b>
            {d.carryFeedback && " with its findings"} — up to <b>{Number.isFinite(passes) ? passes : "?"}</b> passes
            {budget ? <> or <b>${budget.toFixed(2)}</b></> : null}. Then{" "}
            {d.onExhausted === "ask_human" ? "ask a person." : "move on with the findings noted."}
            {entryIdx > checkIdx && <span className="mt-1 block text-warning">The start comes after the check in stage order — make sure the check stage’s success path can reach the start.</span>}
          </div>
        )}

        <div className="space-y-3">
          <Field label="Name">
            <Input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Green loop" autoFocus />
          </Field>
          <Field label="Exit condition" help="exitCondition" hint="The check stage is told to pass only when this holds.">
            <Textarea rows={2} value={d.goal} onChange={(e) => set("goal", e.target.value)}
              placeholder="e.g. Every test passes, including new tests for each acceptance criterion." />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start stage" help="loopEntry">
              <Select value={d.entry} onChange={(e) => set("entry", e.target.value)} aria-label="Loop start stage">
                {ordered.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Check stage" help="loopCheck">
              <Select value={d.check} onChange={(e) => set("check", e.target.value)} aria-label="Loop check stage">
                {ordered.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Max passes" help="maxPasses">
              <Input type="number" min={1} max={25} value={d.maxIterations} onChange={(e) => set("maxIterations", e.target.value)} />
            </Field>
            <Field label="Budget (USD, optional)" help="loopBudget">
              <Input type="number" min={0} step="0.5" value={d.budget} onChange={(e) => set("budget", e.target.value)} placeholder="No cap" />
            </Field>
          </div>
          <Field label="When it runs out" help="onExhausted">
            <Segmented
              value={d.onExhausted}
              onChange={(v) => set("onExhausted", v)}
              options={[{ value: "ask_human", label: "Ask a person" }, { value: "proceed", label: "Proceed anyway" }]}
            />
          </Field>
          <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
            <div>
              <p className="flex items-center gap-1 text-xs font-medium">Carry feedback <HelpHint term="carryFeedback" /></p>
              <p className="text-[11px] text-muted-foreground">Post the check’s findings to the task before the next pass.</p>
            </div>
            <Switch checked={d.carryFeedback} onChange={(v) => set("carryFeedback", v)} label="Carry feedback" className="mt-0.5" />
          </div>
        </div>

        {problems.length > 0 && d.name.trim() !== "" && (
          <ul className="space-y-0.5 text-xs text-destructive">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        )}

        <div className="flex items-center gap-2 pt-1">
          {loop && (
            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={remove} disabled={del.isPending}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={pending || problems.length > 0}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {loop ? "Save loop" : "Add loop"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
