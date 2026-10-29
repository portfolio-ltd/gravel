"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Eye, Loader2, Plus, Save, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState, Page, PageHeader, SectionCard } from "@/components/ui/page"
import { useHarnessPreview, useHarnesses, useUpdateHarness } from "@/hooks/useHarnesses"
import { useMeta } from "@/hooks/useSdlc"
import { cn } from "@/lib/utils"
import type { AgentHarness, HarnessAgent, HarnessExecutor, HarnessInput } from "@/types"
import { EXECUTOR_LABEL } from "@/components/harness/meta"

const ROLE_KEYS = ["analyze", "refine", "plan", "build", "review", "verify", "deploy", "custom"]
const CLAUDE_TOOLS = ["Read", "Grep", "Glob", "Bash", "Edit", "Write", "MultiEdit", "NotebookEdit", "WebFetch", "WebSearch"]

function listToText(list: string[] | null | undefined) {
  return (list ?? []).join(", ")
}
function textToList(text: string): string[] | null {
  const items = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
  return items.length ? items : null
}

function RoleChips({ value, onChange, label }: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {ROLE_KEYS.map((r) => {
        const on = value.includes(r)
        return (
          <button key={r} type="button" aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== r) : [...value, r])}
            className={cn("rounded-full border px-2 py-0.5 text-[11px] capitalize transition-colors",
              on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
            {r}
          </button>
        )
      })}
    </div>
  )
}

function AgentEditor({ name, agent, onChange, onRename, onRemove }: {
  name: string
  agent: HarnessAgent
  onChange: (a: HarnessAgent) => void
  onRename: (n: string) => void
  onRemove: () => void
}) {
  const [draftName, setDraftName] = useState(name)
  useEffect(() => setDraftName(name), [name])
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <Input value={draftName} onChange={(e) => setDraftName(e.target.value)}
          onBlur={() => { const n = draftName.trim().replace(/[^a-zA-Z0-9_-]/g, "-"); if (n && n !== name) onRename(n); else setDraftName(name) }}
          aria-label="Subagent name" className="h-8 max-w-[220px] font-mono text-xs font-semibold" />
        <span className="text-[11px] text-muted-foreground">name the main agent uses to delegate</span>
        <button onClick={onRemove} aria-label={`Remove subagent ${name}`} className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <div className="grid gap-3">
        <Field label="Description" hint="When the main agent should hand work to this subagent.">
          <Input value={agent.description} onChange={(e) => onChange({ ...agent, description: e.target.value })} />
        </Field>
        <Field label="Prompt" hint="The subagent's own instructions. It starts with a fresh context and only sees this plus what it is handed.">
          <Textarea rows={5} className="font-mono text-xs" value={agent.prompt} onChange={(e) => onChange({ ...agent, prompt: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tools" hint={`Comma-separated; empty = all tools. Claude Code names: ${CLAUDE_TOOLS.slice(0, 6).join(", ")}…`}>
            <Input value={listToText(agent.tools)} onChange={(e) => onChange({ ...agent, tools: textToList(e.target.value) })} placeholder="Read, Grep, Glob, Bash" />
          </Field>
          <Field label="Model" hint="Optional override for this subagent (e.g. a cheaper model for scouting).">
            <Input value={agent.model ?? ""} onChange={(e) => onChange({ ...agent, model: e.target.value || null })} placeholder="inherit" />
          </Field>
        </div>
        <Field label="Offered to roles" hint="Empty = every stage role.">
          <RoleChips value={agent.roles ?? []} onChange={(roles) => onChange({ ...agent, roles })} label={`Roles for ${name}`} />
        </Field>
      </div>
    </div>
  )
}

function Preview({ harnessId }: { harnessId: string }) {
  const [role, setRole] = useState("build")
  const { data, isFetching } = useHarnessPreview(harnessId, role)
  const files = Object.keys(data?.files ?? {})
  const [file, setFile] = useState<string | null>(null)
  const current = file && data?.files[file] !== undefined ? file : files[0]
  return (
    <SectionCard title="Preview the bundle" description="What a run of this role receives under .gravel/. Save first — the preview reads the saved harness."
      actions={<Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Preview role" className="h-8 w-36 text-xs">
        {ROLE_KEYS.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
      </Select>}>
      {isFetching && !data ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : files.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing for this role.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-[180px_1fr]">
          <ul className="space-y-0.5 text-xs">
            {files.map((f) => (
              <li key={f}>
                <button onClick={() => setFile(f)} className={cn("w-full rounded-md px-2 py-1 text-left font-mono", current === f ? "bg-primary/10 text-primary" : "hover:bg-muted")}>{f}</button>
              </li>
            ))}
          </ul>
          <pre className="max-h-[420px] overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">{current ? data?.files[current] : ""}</pre>
        </div>
      )}
    </SectionCard>
  )
}

export default function HarnessEditorPage() {
  const { id } = useParams<{ id: string }>()
  const { data: harnesses, isLoading } = useHarnesses()
  const { data: meta } = useMeta()
  const update = useUpdateHarness()
  const saved = useMemo(() => harnesses?.find((h) => h.id === id) ?? null, [harnesses, id])
  const [draft, setDraft] = useState<HarnessInput | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  useEffect(() => {
    if (saved && loadedFor !== saved.id) {
      setDraft(toInput(saved))
      setLoadedFor(saved.id)
    }
  }, [saved, loadedFor])

  const dirty = useMemo(() => !!saved && !!draft && JSON.stringify(toInput(saved)) !== JSON.stringify(draft), [saved, draft])

  async function save() {
    if (!draft) return
    const empty = Object.entries(draft.agents).filter(([, a]) => !a.prompt.trim()).map(([n]) => n)
    if (empty.length) {
      toast.error(`Every subagent needs a prompt — missing for: ${empty.join(", ")}`)
      return
    }
    try {
      await update.mutateAsync({ id, ...draft })
      toast.success("Harness saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save")
    }
  }

  if (isLoading || (saved && !draft)) {
    return <Page><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div></Page>
  }
  if (!saved || !draft) {
    return <Page><EmptyState title="Harness not found" action={<Link href="/harnesses" className="text-sm font-medium text-primary hover:underline">Back to harnesses</Link>} /></Page>
  }

  const set = <K extends keyof HarnessInput>(key: K, value: HarnessInput[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d))
  const agentNames = Object.keys(draft.agents)
  const roleHints = Object.fromEntries((meta?.stage_roles ?? []).map((r) => [r.key, r.description]))

  function addAgent() {
    let name = "helper", n = 2
    while (draft!.agents[name]) name = `helper-${n++}`
    set("agents", { ...draft!.agents, [name]: { description: "", prompt: "", tools: null, model: null, roles: [] } })
  }

  return (
    <Page wide>
      <nav className="mb-3 text-xs text-muted-foreground"><Link href="/harnesses" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Harnesses</Link></nav>
      <PageHeader
        title={<span className="inline-flex items-center gap-2">{draft.name || "Untitled harness"} {draft.is_default && <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"><Star className="h-2.5 w-2.5" /> Default</span>}</span>}
        description={saved.template_key ? `Copied from the “${saved.template_key}” template. Edit anything; runs read the saved version.` : "Runs read the saved version."}
        actions={
          <>
            {!draft.is_default && <Button size="sm" variant="outline" onClick={() => set("is_default", true)}><Star className="h-3.5 w-3.5" /> Make default</Button>}
            <Button size="sm" onClick={save} disabled={!dirty || update.isPending || !draft.name.trim()}>
              {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {dirty ? "Save changes" : "Saved"}
            </Button>
          </>
        }
      />

      <Tabs defaultValue="basics">
        <TabsList className="mb-4">
          <TabsTrigger value="basics">Basics & limits</TabsTrigger>
          <TabsTrigger value="agents">Subagents ({agentNames.length})</TabsTrigger>
          <TabsTrigger value="routing">Routing & instructions</TabsTrigger>
          <TabsTrigger value="preview"><Eye className="mr-1 h-3.5 w-3.5" /> Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="basics" className="space-y-4">
          <SectionCard title="Basics">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><Input value={draft.name} onChange={(e) => set("name", e.target.value)} /></Field>
              <Field label="Executor" hint="Which runtime executor this harness is written for. “Any” keeps to settings every executor understands.">
                <Select value={draft.executor} onChange={(e) => set("executor", e.target.value as HarnessExecutor)}>
                  {Object.entries(EXECUTOR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Description" className="mt-3"><Textarea rows={2} value={draft.description ?? ""} onChange={(e) => set("description", e.target.value || null)} /></Field>
            <Field label="Meant for roles" hint="A hint for the picker. Empty = any stage." className="mt-3">
              <RoleChips value={draft.roles} onChange={(v) => set("roles", v)} label="Harness roles" />
            </Field>
          </SectionCard>
          <SectionCard title="Limits" description="Turn and tool limits apply to the Claude Code executor; the test gate and review rounds shape the routing every executor reads.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Switch checked={draft.test_gate} onChange={(v) => set("test_gate", v)} label="Test gate — run the project's tests before a code-writing run may finish" />
              <Field label="Review rounds" hint="Stop rule for the in-run reviewer loop (0 = no reviewer loop).">
                <Input type="number" min={0} max={10} value={draft.max_review_rounds} onChange={(e) => set("max_review_rounds", Math.max(0, Number(e.target.value) || 0))} />
              </Field>
              <Field label="Turn limit" hint="0 = none. The runtime's own GRAVEL_CLAUDE_MAX_TURNS, when set, is the ceiling.">
                <Input type="number" min={0} max={10000} value={draft.max_turns} onChange={(e) => set("max_turns", Math.max(0, Number(e.target.value) || 0))} />
              </Field>
              <div />
              <Field label="Allowed tools" hint="Comma-separated; empty = the executor's default set.">
                <Input value={listToText(draft.allowed_tools)} onChange={(e) => set("allowed_tools", textToList(e.target.value))} placeholder="Read, Grep, Glob, Bash, Edit, Write" />
              </Field>
              <Field label="Disallowed tools" hint="Blocked for the whole run, e.g. Edit, Write for analysis-only stages.">
                <Input value={listToText(draft.disallowed_tools)} onChange={(e) => set("disallowed_tools", textToList(e.target.value))} placeholder="Edit, Write" />
              </Field>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="agents" className="space-y-3">
          {agentNames.length === 0 && (
            <EmptyState title="No subagents — a solo harness" description="The main agent does everything in its own context. Add subagents to give it scouts, parallel implementers, test runners and fresh-context reviewers."
              action={<Button size="sm" onClick={addAgent}><Plus className="h-3.5 w-3.5" /> Add a subagent</Button>} />
          )}
          {agentNames.map((name) => (
            <AgentEditor key={name} name={name} agent={draft.agents[name]}
              onChange={(a) => set("agents", { ...draft.agents, [name]: a })}
              onRename={(n) => { const next: Record<string, HarnessAgent> = {}; for (const k of agentNames) next[k === name ? n : k] = draft.agents[k]; set("agents", next) }}
              onRemove={() => { const next = { ...draft.agents }; delete next[name]; set("agents", next) }} />
          ))}
          {agentNames.length > 0 && <Button size="sm" variant="outline" onClick={addAgent}><Plus className="h-3.5 w-3.5" /> Add a subagent</Button>}
        </TabsContent>

        <TabsContent value="routing" className="space-y-4">
          <SectionCard title="Routing" description="Per role: how the main agent should split work between its subagents. The “*” entry covers roles without their own. Leave a role empty to use Gravel's default routing.">
            <div className="space-y-3">
              {["*", ...ROLE_KEYS].map((role) => (
                <Field key={role} label={role === "*" ? "Any other role (*)" : role[0].toUpperCase() + role.slice(1)} hint={role !== "*" ? roleHints[role] : undefined}>
                  <Textarea rows={role === "*" || draft.routing[role] ? 3 : 1} className="font-mono text-xs" value={draft.routing[role] ?? ""}
                    onChange={(e) => { const next = { ...draft.routing }; if (e.target.value) next[role] = e.target.value; else delete next[role]; set("routing", next) }}
                    placeholder={role === "build" ? "1. `explorer` maps what the plan touches.\n2. One `implementer` per independent piece, in parallel.\n3. `test-runner` runs the checks.\n4. `reviewer` reviews the diff." : "Default routing"} />
                </Field>
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Extra instructions" description="Appended to every run's stage instructions, whatever the executor. Conventions the harness enforces: “always run the linter”, “never edit migrations by hand”.">
            <Textarea rows={6} className="font-mono text-xs" value={draft.instructions_markdown ?? ""} onChange={(e) => set("instructions_markdown", e.target.value || null)} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="preview">
          <Preview harnessId={id} />
        </TabsContent>
      </Tabs>
    </Page>
  )
}

function toInput(h: AgentHarness): HarnessInput {
  return {
    name: h.name, description: h.description, executor: h.executor, roles: h.roles ?? [], agents: h.agents ?? {},
    routing: h.routing ?? {}, instructions_markdown: h.instructions_markdown, test_gate: h.test_gate,
    max_review_rounds: h.max_review_rounds, max_turns: h.max_turns, allowed_tools: h.allowed_tools?.length ? h.allowed_tools : null,
    disallowed_tools: h.disallowed_tools?.length ? h.disallowed_tools : null, is_default: h.is_default,
  }
}
