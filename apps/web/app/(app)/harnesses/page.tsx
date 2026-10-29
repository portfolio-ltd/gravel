"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bot, Check, ChevronDown, Loader2, MoreHorizontal, Plus, Shield, Star, Trash2, Wrench } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown"
import { EmptyState, Page, PageHeader } from "@/components/ui/page"
import {
  useCreateHarness, useCreateHarnessFromTemplate, useDeleteHarness, useHarnesses, useHarnessTemplates, useUpdateHarness,
} from "@/hooks/useHarnesses"
import { cn } from "@/lib/utils"
import type { AgentHarness } from "@/types"
import { EXECUTOR_LABEL } from "@/components/harness/meta"

function HarnessCard({ harness }: { harness: AgentHarness }) {
  const update = useUpdateHarness()
  const remove = useDeleteHarness()
  const agents = Object.keys(harness.agents ?? {})

  async function makeDefault() {
    try {
      await update.mutateAsync({ id: harness.id, is_default: true })
      toast.success(`${harness.name} is now the default harness`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update")
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete harness “${harness.name}”? Stages pinned to it fall back to the default.`)) return
    try {
      await remove.mutateAsync(harness.id)
      toast.success("Deleted")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete")
    }
  }

  return (
    <div className={cn("surface flex flex-col p-4", harness.is_default && "ring-1 ring-primary/40")}>
      <div className="flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Wrench className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <Link href={`/harnesses/${harness.id}`} className="text-sm font-semibold hover:underline">{harness.name}</Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            {harness.is_default && <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-primary"><Star className="h-2.5 w-2.5" /> Default</span>}
            <span className="rounded-full bg-muted px-1.5 py-0.5">{EXECUTOR_LABEL[harness.executor] ?? harness.executor}</span>
            {harness.roles.length > 0 && <span>for {harness.roles.join(", ")}</span>}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label={`Actions for ${harness.name}`}><MoreHorizontal className="h-4 w-4" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><Link href={`/harnesses/${harness.id}`}>Edit</Link></DropdownMenuItem>
            {!harness.is_default && <DropdownMenuItem onClick={makeDefault}><Star className="h-4 w-4" /> Make default</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {harness.description && <p className="mt-3 text-xs text-muted-foreground">{harness.description}</p>}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <dt className="text-muted-foreground">Subagents</dt>
        <dd className="truncate" title={agents.join(", ")}>{agents.length ? agents.join(", ") : "none (solo)"}</dd>
        <dt className="text-muted-foreground">Test gate</dt>
        <dd className="inline-flex items-center gap-1">{harness.test_gate ? <><Shield className="h-3 w-3 text-success" /> on</> : "off"}</dd>
        <dt className="text-muted-foreground">Turn limit</dt>
        <dd>{harness.max_turns > 0 ? harness.max_turns : "none"}</dd>
        <dt className="text-muted-foreground">Review rounds</dt>
        <dd>{harness.max_review_rounds}</dd>
        {(harness.disallowed_tools?.length ?? 0) > 0 && (<><dt className="text-muted-foreground">Blocked tools</dt><dd className="truncate">{harness.disallowed_tools!.join(", ")}</dd></>)}
      </dl>
    </div>
  )
}

export default function HarnessesPage() {
  const router = useRouter()
  const { data: harnesses, isLoading } = useHarnesses()
  const { data: templates } = useHarnessTemplates()
  const fromTemplate = useCreateHarnessFromTemplate()
  const createBlank = useCreateHarness()
  const [busy, setBusy] = useState(false)

  async function create(templateKey?: string) {
    setBusy(true)
    try {
      const created = templateKey
        ? await fromTemplate.mutateAsync({ template_key: templateKey, make_default: (harnesses ?? []).length === 0 })
        : await createBlank.mutateAsync({ name: "New harness", agents: {}, routing: {}, roles: [], executor: "any",
                                          test_gate: true, max_review_rounds: 2, max_turns: 0, is_default: (harnesses ?? []).length === 0,
                                          description: null, instructions_markdown: null, allowed_tools: null, disallowed_tools: null })
      router.push(`/harnesses/${created.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the harness")
    } finally {
      setBusy(false)
    }
  }

  const newMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} New harness <ChevronDown className="h-3 w-3" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {(templates ?? []).map((t) => (
          <DropdownMenuItem key={t.key} onClick={() => create(t.key)} className="flex-col items-start gap-0.5">
            <span className="font-medium">{t.name}</span>
            <span className="text-[11px] text-muted-foreground">{t.description}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => create()}>Blank harness</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <Page wide>
      <PageHeader
        icon={<Wrench className="h-4 w-4" />}
        title="Agent harnesses"
        description="How a run is wrapped: the subagents it may delegate to, how work is routed between them, the test gate, and the executor's turn and tool limits."
        actions={newMenu}
      />
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="surface h-40 animate-pulse bg-muted/40" />)}</div>
      ) : (harnesses ?? []).length === 0 ? (
        <EmptyState
          icon={<Bot className="h-5 w-5" />}
          title="Runs use Gravel's built-in harness"
          description={<>Explorer, parallel implementers, a test runner, a fresh-context reviewer and a test gate on code-writing stages. Create a harness to change any of that — per organization, or pinned to a workflow stage.</>}
          action={newMenu}
        />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(harnesses ?? []).map((h) => <HarnessCard key={h.id} harness={h} />)}
          </div>
          <div className="mt-6 rounded-xl border bg-muted/20 p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">How a run picks its harness</p>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-5">
              <li>The harness pinned to the workflow stage, if any (Workflows → stage → Harness).</li>
              <li>Otherwise the organization's <b>default</b> harness.</li>
              <li>Otherwise Gravel's built-in harness for the stage's role.</li>
            </ol>
            <p className="mt-2 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Subagents and the Stop-hook test gate apply to the Claude Code executor; turn and tool limits too. Every executor gets the routing and instructions as plain markdown.</p>
          </div>
        </>
      )}
    </Page>
  )
}
