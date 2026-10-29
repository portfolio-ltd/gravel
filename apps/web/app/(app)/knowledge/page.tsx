"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  BookOpen, Check, ChevronDown, ChevronRight, Download, FolderInput, Library, Loader2, MoreHorizontal, Pencil, Plus,
  Search, Sparkles, Trash2, X, Archive, RotateCcw, Waypoints, ExternalLink,
} from "lucide-react"
import { toast } from "sonner"
import { useDeleteKnowledge, useKnowledge, useUpdateKnowledge } from "@/hooks/useSdlc"
import { downloadVault, useImportNotes } from "@/hooks/useKnowledgeMap"
import { useProjects } from "@/hooks/useProjects"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown"
import { Input, Segmented } from "@/components/ui/form"
import { EmptyState, Page, PageHeader } from "@/components/ui/page"
import Markdown from "@/components/Markdown"
import EntryEditor, { KIND_BY_KEY, KIND_STYLE, KINDS, type EditorState } from "@/components/knowledge/EntryEditor"
import { apiDownload } from "@/lib/api"
import { cn, formatRelativeTime } from "@/lib/utils"
import type { KnowledgeEntry, KnowledgeKind, KnowledgeStatus } from "@/types"

type StatusFilter = "accepted" | "deprecated" | "rejected" | "all"

function KindBadge({ kind }: { kind: KnowledgeKind }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", KIND_STYLE[kind])}>
      {KIND_BY_KEY[kind].icon} {KIND_BY_KEY[kind].singular}
    </span>
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
      <p className="mt-2 text-sm font-semibold"><Link href={`/knowledge/${entry.id}`} className="hover:underline">{entry.title}</Link></p>
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

function EntryRow({ entry, onEdit, projectName, depth = 0 }: {
  entry: KnowledgeEntry; onEdit: () => void; projectName?: string; depth?: number
}) {
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
    <div className={cn("surface overflow-hidden", inactive && "opacity-70")} style={depth ? { marginLeft: depth * 20 } : undefined}>
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
        <Link href={`/knowledge/${entry.id}`} aria-label={`Open ${entry.title}`}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <ExternalLink className="h-4 w-4" />
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label={`Actions for ${entry.title}`}>
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4" /> Edit</DropdownMenuItem>
            <DropdownMenuItem asChild><Link href={`/knowledge/${entry.id}`}><ExternalLink className="h-4 w-4" /> Open page</Link></DropdownMenuItem>
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
  return (
    <Suspense fallback={null}>
      <Knowledge />
    </Suspense>
  )
}

function Knowledge() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: entries, isLoading } = useKnowledge()
  const { data: projects } = useProjects()
  const importNotes = useImportNotes()
  const [kind, setKind] = useState<KnowledgeKind | "all">("all")
  const [status, setStatus] = useState<StatusFilter>("accepted")
  const [query, setQuery] = useState("")
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [exporting, setExporting] = useState<"md" | "vault" | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // /knowledge?new=Title&kind=wiki — create a page from an unresolved [[link]]
  useEffect(() => {
    const title = searchParams.get("new")
    if (!title) return
    const k = searchParams.get("kind") as KnowledgeKind | null
    setEditor({ entry: null, acceptOnSave: false, kind: k && KIND_BY_KEY[k] ? k : "wiki", title })
    router.replace("/knowledge", { scroll: false })
  }, [searchParams, router])

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
    && (!q || e.title.toLowerCase().includes(q) || e.body_markdown.toLowerCase().includes(q) || (e.slug ?? "").includes(q)),
  )
  // Wiki pages list as a tree (children under parents) when nothing is filtered away
  const ordered = useMemo(() => {
    if (q || kind !== "wiki") return visible.map((e) => ({ entry: e, depth: 0 }))
    const ids = new Set(visible.map((e) => e.id))
    const children = new Map<string | null, KnowledgeEntry[]>()
    for (const e of visible) {
      const parent = e.parent_id && ids.has(e.parent_id) ? e.parent_id : null
      children.set(parent, [...(children.get(parent) ?? []), e])
    }
    const out: { entry: KnowledgeEntry; depth: number }[] = []
    const walk = (parent: string | null, depth: number) => {
      for (const e of children.get(parent) ?? []) { out.push({ entry: e, depth }); walk(e.id, depth + 1) }
    }
    walk(null, 0)
    return out
  }, [visible, q, kind])

  async function exportMarkdown() {
    setExporting("md")
    try {
      await apiDownload("/api/knowledge/export", "KNOWLEDGE.md")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed")
    } finally {
      setExporting(null)
    }
  }

  async function exportVault() {
    setExporting("vault")
    try {
      await downloadVault()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed")
    } finally {
      setExporting(null)
    }
  }

  async function onFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter((f) => /\.(md|markdown|txt)$/i.test(f.name))
    e.target.value = ""
    if (!files.length) {
      toast.error("Choose markdown (.md) files")
      return
    }
    try {
      const result = await importNotes.mutateAsync({ files })
      toast.success(`Imported ${result.created} new, updated ${result.updated}${result.skipped ? `, skipped ${result.skipped}` : ""}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed")
    }
  }

  const newKind: KnowledgeKind = kind === "all" ? "decision" : kind

  return (
    <Page wide>
      <PageHeader
        icon={<Library className="h-4 w-4" />}
        title="Knowledge"
        description="Decisions, patterns, glossary, runbooks, conventions and wiki pages that ground every engineer run."
        actions={
          <>
            <input ref={fileInput} type="file" accept=".md,.markdown,.txt,text/markdown" multiple className="hidden" onChange={onFilesChosen} aria-label="Import markdown notes" />
            <Link href="/map" className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-muted">
              <Waypoints className="h-3.5 w-3.5" /> Map
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={!!exporting || importNotes.isPending}>
                  {exporting || importNotes.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Import / export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => fileInput.current?.click()}><FolderInput className="h-4 w-4" /> Import markdown notes…</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={exportMarkdown} disabled={settled.length === 0}><Download className="h-4 w-4" /> KNOWLEDGE.md (for engineers)</DropdownMenuItem>
                <DropdownMenuItem onClick={exportVault} disabled={all.length === 0}><Waypoints className="h-4 w-4" /> Obsidian vault (.zip)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles, slugs and content…" className="pl-8" aria-label="Search knowledge" />
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
          ) : ordered.length > 0 ? (
            <div className="space-y-2">
              {ordered.map(({ entry: e, depth }) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  depth={depth}
                  projectName={e.project_id ? projectName[e.project_id] : undefined}
                  onEdit={() => setEditor({ entry: e, acceptOnSave: false, kind: e.kind })}
                />
              ))}
            </div>
          ) : all.length === 0 ? (
            <EmptyState
              icon={<Library className="h-5 w-5" />}
              title="Your knowledge base is empty"
              description={<>Everything accepted here is handed to every engineer run, so plans honour your decisions and code follows your patterns. AI stages may <b>propose</b> entries as they work — only a person can accept them. Already keep notes in Obsidian? Import the folder.</>}
              action={
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setEditor({ entry: null, acceptOnSave: false, kind: "decision" })}>
                    <Plus className="h-3.5 w-3.5" /> Record your first decision
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                    <FolderInput className="h-3.5 w-3.5" /> Import notes
                  </Button>
                </div>
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
