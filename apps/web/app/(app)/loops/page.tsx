"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, CheckCircle2, Coins, GitBranch, MessageSquareReply, Plus, Repeat, ShieldCheck, UserCheck } from "lucide-react"
import { toast } from "sonner"
import { useCreateWorkflowFromTemplate, useWorkflows } from "@/hooks/useWorkflows"
import { useMeta } from "@/hooks/useSdlc"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/form"
import { EmptyState, Page, PageHeader } from "@/components/ui/page"
import { GlossaryContent, Tooltip } from "@/components/ui/tooltip"
import LoopEditor from "@/components/workflow/LoopEditor"
import { TemplateCard } from "@/components/workflow/Pipeline"
import type { GlossaryKey } from "@/lib/glossary"
import type { Workflow, WorkflowLoop } from "@/types"

/** The five decisions that make a loop, as a strip of cards. */
const PRINCIPLES: { icon: React.ReactNode; title: string; body: string; term: GlossaryKey }[] = [
  { icon: <CheckCircle2 className="h-4 w-4" />, title: "Define done", body: "Write the exit condition in plain words.", term: "exitCondition" },
  { icon: <ShieldCheck className="h-4 w-4" />, title: "Pick the checker", body: "A test, verify or review stage judges each pass.", term: "loopCheck" },
  { icon: <MessageSquareReply className="h-4 w-4" />, title: "Feed findings back", body: "The next pass starts from what failed.", term: "carryFeedback" },
  { icon: <Coins className="h-4 w-4" />, title: "Bound it", body: "Cap passes and, if you like, spend.", term: "loopBudget" },
  { icon: <UserCheck className="h-4 w-4" />, title: "Decide the way out", body: "Ask a person, or proceed with notes.", term: "onExhausted" },
]

function LoopDiagram() {
  // Start → … → Check; pass → exit, fail → next pass. Hand-drawn SVG, theme-aware via classes.
  return (
    <svg viewBox="0 0 460 120" className="h-auto w-full max-w-md" role="img" aria-label="A loop: start, check, and back to start on failure">
      <defs>
        <marker id="lp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10z" className="fill-primary" />
        </marker>
        <marker id="lp-arrow-muted" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10z" className="fill-muted-foreground" />
        </marker>
      </defs>
      <rect x="10" y="40" width="110" height="40" rx="10" className="fill-card stroke-border" />
      <text x="65" y="65" textAnchor="middle" className="fill-foreground text-[13px] font-medium">Start: Build</text>
      <rect x="190" y="40" width="110" height="40" rx="10" className="fill-card stroke-primary" />
      <text x="245" y="65" textAnchor="middle" className="fill-foreground text-[13px] font-medium">Check: Test</text>
      <rect x="370" y="40" width="80" height="40" rx="10" className="fill-success/10 stroke-success/50" />
      <text x="410" y="65" textAnchor="middle" className="fill-success text-[13px] font-medium">Exit</text>
      <path d="M120 60 H186" className="stroke-muted-foreground" strokeWidth="1.5" markerEnd="url(#lp-arrow-muted)" />
      <path d="M300 60 H366" className="stroke-success" strokeWidth="1.5" markerEnd="url(#lp-arrow-muted)" />
      <text x="333" y="52" textAnchor="middle" className="fill-success text-[11px]">pass</text>
      <path d="M245 80 V104 Q245 110 239 110 H71 Q65 110 65 104 V84" fill="none" className="stroke-primary" strokeWidth="1.75" markerEnd="url(#lp-arrow)" />
      <text x="155" y="104" textAnchor="middle" className="fill-primary text-[11px]">fail → next pass, with findings</text>
      <text x="155" y="26" textAnchor="middle" className="fill-muted-foreground text-[11px]">at most N passes or $ budget, then ask a person</text>
    </svg>
  )
}

function LoopRow({ wf, loop, onEdit }: { wf: Workflow; loop: WorkflowLoop; onEdit: () => void }) {
  const name = (id: string) => wf.stages.find((s) => s.id === id)?.name ?? "?"
  const entry = name(loop.entry_stage_id)
  const check = name(loop.check_stage_id)
  return (
    <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Repeat className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onEdit} className="text-sm font-semibold hover:underline">{loop.name}</button>
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
            {entry}{entry !== check && <><ArrowRight className="h-3 w-3" />{check}</>}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">Until: {loop.goal || "the check stage passes"}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          <Tooltip content={<GlossaryContent term="maxPasses" />}>
            <span tabIndex={0} className="rounded-full bg-muted px-2 py-0.5">≤{loop.max_iterations} passes</span>
          </Tooltip>
          <Tooltip content={<GlossaryContent term="loopBudget" />}>
            <span tabIndex={0} className="rounded-full bg-muted px-2 py-0.5">{loop.max_cost_usd ? `$${loop.max_cost_usd.toFixed(2)} budget` : "no budget cap"}</span>
          </Tooltip>
          <Tooltip content={<GlossaryContent term="onExhausted" />}>
            <span tabIndex={0} className="rounded-full bg-muted px-2 py-0.5">then {loop.on_exhausted === "ask_human" ? "ask a person" : "proceed"}</span>
          </Tooltip>
          {loop.carry_feedback && (
            <Tooltip content={<GlossaryContent term="carryFeedback" />}>
              <span tabIndex={0} className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">feedback carried</span>
            </Tooltip>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link href={`/workflows/${wf.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <GitBranch className="h-3.5 w-3.5" /> {wf.name}
        </Link>
        <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
      </div>
    </div>
  )
}

export default function LoopsPage() {
  const router = useRouter()
  const { data: workflows, isLoading } = useWorkflows()
  const { data: meta } = useMeta()
  const fromTemplate = useCreateWorkflowFromTemplate()
  const [editing, setEditing] = useState<{ wf: Workflow; loop: WorkflowLoop | null } | null>(null)
  const [target, setTarget] = useState("")
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  const rows = (workflows ?? []).flatMap((wf) => (wf.loops ?? []).map((loop) => ({ wf, loop })))
  const withStages = (workflows ?? []).filter((w) => w.stages.length > 0)
  const loopTemplates = (meta?.workflow_templates ?? []).filter((t) => (t.loops ?? []).length > 0)
  const targetWf = withStages.find((w) => w.id === target) ?? withStages[0]

  async function startFromTemplate(key: string) {
    setPendingKey(key)
    try {
      const wf = await fromTemplate.mutateAsync({ template_key: key })
      toast.success(`Created “${wf.name}”`)
      router.push(`/workflows/${wf.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create workflow")
    } finally {
      setPendingKey(null)
    }
  }

  return (
    <Page>
      <PageHeader
        icon={<Repeat className="h-4 w-4" />}
        title="Loops"
        help="loopEngineering"
        description="Loop engineering: let engineers repeat work → check until it’s right, inside limits you set."
        actions={withStages.length > 0 && (
          <div className="flex items-center gap-2">
            <Select value={targetWf?.id ?? ""} onChange={(e) => setTarget(e.target.value)} aria-label="Workflow for the new loop" className="h-8 w-44 text-xs">
              {withStages.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
            <Button size="sm" onClick={() => targetWf && setEditing({ wf: targetWf, loop: null })}>
              <Plus className="h-3.5 w-3.5" /> New loop
            </Button>
          </div>
        )}
      />

      <section className="surface mb-8 grid gap-6 overflow-hidden p-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <h2 className="text-sm font-semibold">How a loop works</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            One pass runs from the loop’s <b>start</b> stage to its <b>check</b> stage. If the check confirms the exit condition, the task
            leaves the loop. If not, the check’s findings go on the task and the next pass begins — until the pass limit or budget
            runs out. Then the loop asks a person, or proceeds with the findings noted. Every pass is recorded on the task’s activity.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {PRINCIPLES.map((p) => (
              <Tooltip key={p.title} content={<GlossaryContent term={p.term} />}>
                <div tabIndex={0} className="rounded-lg border bg-muted/30 p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="text-primary">{p.icon}</span>
                  <p className="mt-1 text-xs font-semibold">{p.title}</p>
                  <p className="text-[11px] text-muted-foreground">{p.body}</p>
                </div>
              </Tooltip>
            ))}
          </div>
        </div>
        <LoopDiagram />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold">Your loops {rows.length > 0 && <span className="font-normal text-muted-foreground">· {rows.length}</span>}</h2>
        {isLoading ? (
          <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="surface h-24 animate-pulse bg-muted/40" />)}</div>
        ) : rows.length > 0 ? (
          <div className="space-y-3">
            {rows.map(({ wf, loop }) => <LoopRow key={loop.id} wf={wf} loop={loop} onEdit={() => setEditing({ wf, loop })} />)}
          </div>
        ) : (
          <EmptyState
            icon={<Repeat className="h-5 w-5" />}
            title="No loops yet"
            description={withStages.length
              ? "Pick a workflow above and add a loop — for example Build → Test until every test passes."
              : "Start from a template below; “Build until green” comes with a loop."}
          />
        )}
      </section>

      {loopTemplates.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Templates with loops</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {loopTemplates.map((tpl) => (
              <TemplateCard key={tpl.key} template={tpl} pending={pendingKey === tpl.key} onUse={() => startFromTemplate(tpl.key)} />
            ))}
          </div>
        </section>
      )}

      {editing && (
        <LoopEditor
          open
          onOpenChange={(v) => { if (!v) setEditing(null) }}
          workflowId={editing.wf.id}
          stages={editing.wf.stages}
          loops={editing.wf.loops ?? []}
          loop={editing.loop}
        />
      )}
    </Page>
  )
}
