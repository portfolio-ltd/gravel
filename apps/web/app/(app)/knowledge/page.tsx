"use client"

import { useMemo, useState } from "react"
import {
  BookOpen, Check, ChevronDown, ChevronRight, Download, Library, Loader2, MoreHorizontal, Pencil, Plus,
  Search, Sparkles, Trash2, X, Archive, RotateCcw, Scale, Puzzle, BookA, LifeBuoy, ListChecks,
} from "lucide-react"
import { toast } from "sonner"
import { useCreateKnowledge, useDeleteKnowledge, useKnowledge, useUpdateKnowledge } from "@/hooks/useSdlc"
import { useProjects } from "@/hooks/useProjects"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown"
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/form"
import { EmptyState, Page, PageHeader } from "@/components/ui/page"
import Markdown from "@/components/Markdown"
import { getAccessToken } from "@/lib/auth"
import { getActiveOrgId } from "@/lib/orgStore"
import { cn, formatRelativeTime } from "@/lib/utils"
import type { KnowledgeEntry, KnowledgeKind, KnowledgeStatus } from "@/types"

const KINDS: { key: KnowledgeKind; label: string; singular: string; icon: React.ReactNode; hint: string }[] = [
  { key: "decision", label: "Decisions", singular: "Decision", icon: <Scale className="h-3.5 w-3.5" />,
    hint: "Architecture decision records: what was decided, why, and what it rules out." },
  { key: "pattern", label: "Patterns", singular: "Pattern", icon: <Puzzle className="h-3.5 w-3.5" />,
    hint: "Reusable implementation idioms engineers should follow." },
  { key: "glossary", label: "Glossary", singular: "Glossary term", icon: <BookA className="h-3.5 w-3.5" />,
    hint: "Domain terms and their exact meaning." },
  { key: "runbook", label: "Runbooks", singular: "Runbook", icon: <LifeBuoy className="h-3.5 w-3.5" />,
    hint: "Operational procedures: deploys, incidents, backfills." },
  { key: "convention", label: "Conventions", singular: "Convention", icon: <ListChecks className="h-3.5 w-3.5" />,
    hint: "Coding, repository and review conventions." },
]
const KIND_BY_KEY = Object.fromEntries(KINDS.map((k) => [k.key, k])) as Record<KnowledgeKind, (typeof KINDS)[number]>

const KIND_STYLE: Record<KnowledgeKind, string> = {
  decision: "bg-violet-100 text-violet-700",
  pattern: "bg-sky-100 text-sky-700",
  glossary: "bg-amber-100 text-amber-700",
  runbook: "bg-rose-100 text-rose-700",
  convention: "bg-emerald-100 text-emerald-700",
}

type StatusFilter = "accepted" | "deprecated" | "rejected" | "all"
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

function KindBadge({ kind }: { kind: KnowledgeKind }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", KIND_STYLE[kind])}>
      {KIND_BY_KEY[kind].icon} {KIND_BY_KEY[kind].singular}
    </span>
  )
}

interface EditorState {
  entry: KnowledgeEntry | null
  acceptOnSave: boolean
  kind: KnowledgeKind
}

function EntryEditor({ state, onClose }: { state: EditorState; onClose: () => void }) {
  const { entry, acceptOnSave } = state
  const { data: projects } = useProjects()
  const create = useCreateKnowledge()
  const update = useUpdateKnowledge()
  const [kind, setKind] = useState<KnowledgeKind>(entry?.kind ?? state.kind)
  const [title, setTitle] = useState(entry?.title ?? "")
  const [body, setBody] = useState(entry?.body_markdown ?? "")
  const [projectId, setProjectId] = useState<string>(entry?.project_id ?? "")
  const [mode, setMode] = useState<"write" | "preview">("write")
  const pending = create.isPending || update.isPending

  async function save() {
    try {
      if (entry) {
        await update.mutateAsync({
          id: entry.id, title: title.trim(), body_markdown: body, project_id: projectId || null,
          ...(acceptOnSave ? { status: "accepted" as KnowledgeStatus } : {}),
        })
        toast.success(acceptOnSave ? "Accepted into the knowledge base" : "Saved")
      } else {
        await create.mutateAsync({ kind, title: title.trim(), body_markdown: body, project_id: projectId || null })
        toast.success("Added to the knowledge base")
      }
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save")
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{entry ? (acceptOnSave ? "Review & accept" : `Edit ${entry.label}`) : "New knowledge entry"}</DialogTitle>
          <DialogDescription>
            Accepted entries are given to every engineer run in scope, so keep them precise and current.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind" hint={KIND_BY_KEY[kind].hint}>
              <Select value={kind} onChange={(e) => setKind(e.target.value as KnowledgeKind)} disabled={!!entry}>
                {KINDS.map((k) => <option key={k.key} value={k.key}>{k.singular}</option>)}
              </Select>
            </Field>
            <Field label="Applies to">
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Every project in this organization</option>
                {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={
              kind === "decision" ? "Use Postgres for all transactional data"
                : kind === "glossary" ? "Invoice" : "Short, searchable title"
            } autoFocus />
          </Field>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/80">Body (markdown)</span>
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={[{ value: "write", label: "Write" }, { value: "preview", label: "Preview" }]}
              />
            </div>
            {mode === "write" ? (
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="font-mono text-xs"
                placeholder={kind === "decision"
                  ? "## Context\n\n## Decision\n\n## Consequences"
                  : "Describe it so an engineer who has never seen the code can apply it."}
              />
            ) : (
              <div className="min-h-[220px] rounded-lg border bg-muted/20 p-3">
                {body.trim() ? <Markdown>{body}</Markdown> : <p className="text-xs text-muted-foreground">Nothing to preview.</p>}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={!title.trim() || pending}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {acceptOnSave ? <><Check className="h-3.5 w-3.5" /> Save & accept</> : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProposedCard({ entry, onEdit, projectName }: {
  entry: KnowledgeEntry; onEdit: () => void; projectName?: string
}) {
  const update = useUpdateKnowledge()
  const [open, setOpen] = useState(false)

  async function setStatus(status: KnowledgeStatus) {
    try {
      await update.mutateAsync({ id: entry.id, status })
      toast.success(status === "accepted" ? `Accepted “${entry.title}”` : "Proposal rejected")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update")
    }
  }

  return (
    <div className="surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <KindBadge kind={entry.kind} />
        {projectName && <span className="text-[10px] text-muted-foreground">· {projectName}</span>}
        <span className="text-[10px] text-muted-foreground">· proposed {formatRelativeTime(entry.created_at)}</span>
      </div>
      <p className="mt-2 text-sm font-semibold">{entry.title}</p>
      <div className={cn("relative mt-1.5", !open && "max-h-24 overflow-hidden")}>
        <Markdown className="text-xs text-muted-foreground">{entry.body_markdown}</Markdown>
        {!open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />}
      </div>
      <button onClick={() => setOpen((v) => !v)} className="mt-1 text-[11px] font-medium text-primary hover:underline">
        {open ? "Show less" : "Read all"}
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="success" onClick={() => setStatus("accepted")} disabled={update.isPending}>
          <Check className="h-3.5 w-3.5" /> Accept
        </Button>
        <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /> Edit, then accept</Button>
        <Button size="sm" variant="ghost" onClick={() => setStatus("rejected")} disabled={update.isPending}>
          <X className="h-3.5 w-3.5" /> Reject
        </Button>
      </div>
    </div>
  )
}

function EntryRow({ entry, onEdit, projectName }: { entry: KnowledgeEntry; onEdit: () => void; projectName?: string }) {
  const update = useUpdateKnowledge()
  const remove = useDeleteKnowledge()
  const [open, setOpen] = useState(false)
  const inactive = entry.status === "deprecated" || entry.status === "rejected"

  async function setStatus(status: KnowledgeStatus) {
    try {
      await update.mutateAsync({ id: entry.id, status })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update")
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete “${entry.title}”? This can't be undone — deprecating keeps the history.`)) return
    try {
      await remove.mutateAsync(entry.id)
      toast.success("Deleted")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete")
    }
  }

  return (
    <div className={cn("surface overflow-hidden", inactive && "opacity-70")}>
      <div className="flex items-start gap-2 px-4 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <p className="text-sm font-medium">{entry.label}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              <KindBadge kind={entry.kind} />
              <span>{projectName ?? "All projects"}</span>
              <span>· updated {formatRelativeTime(entry.updated_at)}</span>
              {entry.author_type === "ai" && <span className="inline-flex items-center gap-0.5"><Sparkles className="h-2.5 w-2.5" /> AI-proposed</span>}
              {inactive && <span className="rounded bg-muted px-1.5 py-0.5 font-medium capitalize">{entry.status}</span>}
            </div>
          </div>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label={`Actions for ${entry.title}`}>
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4" /> Edit</DropdownMenuItem>
            {entry.status === "accepted"
              ? <DropdownMenuItem onClick={() => setStatus("deprecated")}><Archive className="h-4 w-4" /> Deprecate</DropdownMenuItem>
              : <DropdownMenuItem onClick={() => setStatus("accepted")}><RotateCcw className="h-4 w-4" /> Reactivate</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && (
        <div className="border-t bg-muted/10 px-4 py-3 pl-10">
          {entry.body_markdown.trim()
            ? <Markdown>{entry.body_markdown}</Markdown>
            : <p className="text-xs text-muted-foreground">No body yet.</p>}
        </div>
      )}
    </div>
  )
}

export default function KnowledgePage() {
  const { data: entries, isLoading } = useKnowledge()
  const { data: projects } = useProjects()
  const [kind, setKind] = useState<KnowledgeKind | "all">("all")
  const [status, setStatus] = useState<StatusFilter>("accepted")
  const [query, setQuery] = useState("")
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [exporting, setExporting] = useState(false)

  const projectName = useMemo(
    () => Object.fromEntries((projects ?? []).map((p) => [p.id, p.name])) as Record<string, string>,
    [projects],
  )
  const all = entries ?? []
  const proposed = all.filter((e) => e.status === "proposed")
  const settled = all.filter((e) => e.status !== "proposed")
  const counts = Object.fromEntries(KINDS.map((k) => [k.key, settled.filter((e) => e.kind === k.key && e.status === "accepted").length]))
  const q = query.trim().toLowerCase()
  const visible = settled.filter((e) =>
    (kind === "all" || e.kind === kind)
    && (status === "all" || e.status === status)
    && (!q || e.title.toLowerCase().includes(q) || e.body_markdown.toLowerCase().includes(q)),
  )

  async function handleExport() {
    setExporting(true)
    try {
      const token = getAccessToken()
      const orgId = getActiveOrgId()
      const res = await fetch(`${BASE}/api/knowledge/export`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(orgId ? { "X-Org-Id": orgId } : {}) },
      })
      if (!res.ok) throw new Error(res.status === 401 ? "Session expired — reload and try again" : `Export failed (${res.status})`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement("a")
      a.href = url
      a.download = "KNOWLEDGE.md"
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed")
    } finally {
      setExporting(false)
    }
  }

  const newKind: KnowledgeKind = kind === "all" ? "decision" : kind

  return (
    <Page wide>
      <PageHeader
        icon={<Library className="h-4 w-4" />}
        title="Knowledge"
        description="Decisions, patterns, glossary, runbooks and conventions that ground every engineer run."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting || settled.length === 0}>
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Export markdown
            </Button>
            <Button size="sm" onClick={() => setEditor({ entry: null, acceptOnSave: false, kind: newKind })}>
              <Plus className="h-3.5 w-3.5" /> New entry
            </Button>
          </>
        }
      />

      {proposed.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Proposed by AI</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{proposed.length}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">— nothing reaches engineers until you accept it.</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {proposed.map((e) => (
              <ProposedCard
                key={e.id}
                entry={e}
                projectName={e.project_id ? projectName[e.project_id] : undefined}
                onEdit={() => setEditor({ entry: e, acceptOnSave: true, kind: e.kind })}
              />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav aria-label="Knowledge kinds" className="flex gap-1 overflow-x-auto no-scrollbar md:flex-col md:overflow-visible">
          <button
            onClick={() => setKind("all")}
            className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              kind === "all" ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
          >
            <BookOpen className="h-3.5 w-3.5" /> All
            <span className="ml-auto text-xs tabular-nums">{settled.filter((e) => e.status === "accepted").length}</span>
          </button>
          {KINDS.map((k) => (
            <button
              key={k.key}
              onClick={() => setKind(k.key)}
              className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                kind === k.key ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
            >
              {k.icon} {k.label}
              <span className="ml-auto pl-2 text-xs tabular-nums">{counts[k.key]}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles and content…" className="pl-8" aria-label="Search knowledge" />
            </div>
            <Segmented
              size="sm"
              value={status}
              onChange={setStatus}
              options={[
                { value: "accepted", label: "Accepted" },
                { value: "deprecated", label: "Deprecated" },
                { value: "rejected", label: "Rejected" },
                { value: "all", label: "All" },
              ]}
            />
          </div>
          {kind !== "all" && <p className="mb-3 text-xs text-muted-foreground">{KIND_BY_KEY[kind].hint}</p>}

          {isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="surface h-16 animate-pulse bg-muted/40" />)}</div>
          ) : visible.length > 0 ? (
            <div className="space-y-2">
              {visible.map((e) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  projectName={e.project_id ? projectName[e.project_id] : undefined}
                  onEdit={() => setEditor({ entry: e, acceptOnSave: false, kind: e.kind })}
                />
              ))}
            </div>
          ) : all.length === 0 ? (
            <EmptyState
              icon={<Library className="h-5 w-5" />}
              title="Your knowledge base is empty"
              description={<>Everything accepted here is handed to every engineer run, so plans honour your decisions and code follows your patterns. AI stages may <b>propose</b> entries as they work — only a person can accept them.</>}
              action={
                <Button size="sm" onClick={() => setEditor({ entry: null, acceptOnSave: false, kind: "decision" })}>
                  <Plus className="h-3.5 w-3.5" /> Record your first decision
                </Button>
              }
            />
          ) : (
            <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              Nothing matches these filters.
            </p>
          )}
        </div>
      </div>

      {editor && <EntryEditor state={editor} onClose={() => setEditor(null)} />}
    </Page>
  )
}
