"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft, ArrowRight, Archive, ChevronRight, CornerDownRight, Link2, Loader2, Pencil, Plus, RotateCcw, Sparkles, Waypoints,
} from "lucide-react"
import { toast } from "sonner"
import ForceGraph from "@/components/graph/ForceGraph"
import EntryEditor, { KIND_BY_KEY, KIND_STYLE, type EditorState } from "@/components/knowledge/EntryEditor"
import LinksPanel from "@/components/LinksPanel"
import Markdown from "@/components/Markdown"
import { Button } from "@/components/ui/button"
import { EmptyState, Page } from "@/components/ui/page"
import { useKnowledgeEntry, useKnowledgeLinks, useKnowledgeMap } from "@/hooks/useKnowledgeMap"
import { useProjects } from "@/hooks/useProjects"
import { useKnowledge, useUpdateKnowledge } from "@/hooks/useSdlc"
import { neighbourhood, toForceEdge, toForceNode } from "@/lib/mapView"
import { cn, formatRelativeTime } from "@/lib/utils"
import type { KnowledgeRef, KnowledgeStatus } from "@/types"

function RefChip({ entry }: { entry: KnowledgeRef }) {
  return (
    <Link href={`/knowledge/${entry.id}`}
      className={cn("inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium hover:opacity-80",
        KIND_STYLE[entry.kind], entry.status !== "accepted" && "opacity-60")}>
      {KIND_BY_KEY[entry.kind].icon} <span className="truncate">{entry.label}</span>
    </Link>
  )
}

export default function KnowledgeEntryPage() {
  const { entryId } = useParams<{ entryId: string }>()
  const router = useRouter()
  const { data: entry, isLoading, error } = useKnowledgeEntry(entryId)
  const { data: links } = useKnowledgeLinks(entryId)
  const { data: all } = useKnowledge()
  const { data: projects } = useProjects()
  const { data: map } = useKnowledgeMap({ projectId: entry?.project_id ?? undefined })
  const update = useUpdateKnowledge()
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const nodeId = `knowledge:${entryId}`
  const local = useMemo(() => (map ? neighbourhood(map.nodes, map.edges, nodeId, 1) : { nodes: [], edges: [] }), [map, nodeId])
  const forceNodes = useMemo(() => local.nodes.map(toForceNode), [local.nodes])
  const forceEdges = useMemo(() => local.edges.map(toForceEdge), [local.edges])
  const byId = useMemo(() => new Map((all ?? []).map((e) => [e.id, e])), [all])

  const crumbs = useMemo(() => {
    const chain = []
    let current = entry?.parent_id ? byId.get(entry.parent_id) : undefined
    const seen = new Set<string>()
    while (current && !seen.has(current.id)) {
      chain.unshift(current)
      seen.add(current.id)
      current = current.parent_id ? byId.get(current.parent_id) : undefined
    }
    return chain
  }, [entry, byId])

  async function setStatus(status: KnowledgeStatus) {
    if (!entry) return
    try {
      await update.mutateAsync({ id: entry.id, status })
      toast.success(status === "accepted" ? "Accepted" : status === "deprecated" ? "Deprecated" : "Updated")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update")
    }
  }

  if (isLoading) {
    return <Page><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div></Page>
  }
  if (error || !entry) {
    return (
      <Page>
        <EmptyState title="Knowledge entry not found" description="It may have been deleted, or it belongs to another organization."
          action={<Link href="/knowledge" className="text-sm font-medium text-primary hover:underline">Back to Knowledge</Link>} />
      </Page>
    )
  }

  const kind = KIND_BY_KEY[entry.kind]
  const projectName = entry.project_id ? projects?.find((p) => p.id === entry.project_id)?.name : null
  const inactive = entry.status === "deprecated" || entry.status === "rejected"

  return (
    <Page wide>
      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link href="/knowledge" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Knowledge</Link>
        {crumbs.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            <Link href={`/knowledge/${c.id}`} className="hover:text-foreground">{c.title}</Link>
          </span>
        ))}
        <ChevronRight className="h-3 w-3" /><span className="text-foreground">{entry.title}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <article className={cn("min-w-0", inactive && "opacity-80")}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", KIND_STYLE[entry.kind])}>
              {kind.icon} {kind.singular}
            </span>
            {entry.status !== "accepted" && (
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                entry.status === "proposed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{entry.status}</span>
            )}
            <span className="text-[11px] text-muted-foreground">{projectName ?? "All projects"} · updated {formatRelativeTime(entry.updated_at)}</span>
            {entry.author_type === "ai" && <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground"><Sparkles className="h-3 w-3" /> AI-proposed</span>}
            {entry.slug && <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">[[{entry.slug}]]</code>}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{entry.label}</h1>
          <div className="mt-4">
            {entry.body_markdown.trim()
              ? <Markdown>{entry.body_markdown}</Markdown>
              : <p className="text-sm text-muted-foreground">No body yet.</p>}
          </div>
          {entry.status === "proposed" && (
            <div className="mt-6 flex flex-wrap gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="w-full text-xs text-muted-foreground">An AI run proposed this entry. Nothing reaches engineers until a person accepts it.</p>
              <Button size="sm" variant="success" onClick={() => setStatus("accepted")} disabled={update.isPending}>Accept</Button>
              <Button size="sm" variant="outline" onClick={() => setEditor({ entry, acceptOnSave: true, kind: entry.kind })}><Pencil className="h-3.5 w-3.5" /> Edit, then accept</Button>
              <Button size="sm" variant="ghost" onClick={() => setStatus("rejected")} disabled={update.isPending}>Reject</Button>
            </div>
          )}

          {(links?.children.length ?? 0) > 0 && (
            <section className="mt-8">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pages under this one</h2>
              <ul className="space-y-1">
                {links!.children.map((c) => (
                  <li key={c.id} className="flex items-center gap-1.5 text-sm">
                    <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <Link href={`/knowledge/${c.id}`} className="hover:text-primary hover:underline">{c.label}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <LinksPanel entityType="knowledge" entityId={entry.id} className="mt-8" title="External links"
            hint="Where this is documented, designed or tracked outside Gravel." />
        </article>

        <aside className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setEditor({ entry, acceptOnSave: false, kind: entry.kind })}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
            <Button size="sm" variant="outline" onClick={() => setEditor({ entry: null, acceptOnSave: false, kind: "wiki", parentId: entry.id })}>
              <Plus className="h-3.5 w-3.5" /> Sub-page
            </Button>
            {entry.status === "accepted"
              ? <Button size="sm" variant="ghost" onClick={() => setStatus("deprecated")} disabled={update.isPending}><Archive className="h-3.5 w-3.5" /> Deprecate</Button>
              : entry.status !== "proposed" && <Button size="sm" variant="ghost" onClick={() => setStatus("accepted")} disabled={update.isPending}><RotateCcw className="h-3.5 w-3.5" /> Reactivate</Button>}
          </div>

          <section className="surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Local graph</h2>
              <Link href={`/map?node=${encodeURIComponent(nodeId)}${entry.project_id ? `&project=${entry.project_id}` : ""}`}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                <Waypoints className="h-3 w-3" /> Open map
              </Link>
            </div>
            {map ? (
              forceNodes.length > 1 ? (
                <ForceGraph nodes={forceNodes} edges={forceEdges} selectedId={selected ?? nodeId} onSelect={setSelected}
                  onOpen={(id) => { const n = map.nodes.find((x) => x.id === id); if (n?.href && n.type !== "link") router.push(n.href) }}
                  ariaLabel={`Entries linked to ${entry.title}`} height={240} />
              ) : (
                <p className="text-xs text-muted-foreground">Nothing links here yet. Mention this entry as [[{entry.slug ?? entry.title}]] elsewhere and it will appear.</p>
              )
            ) : <div className="h-[240px] animate-pulse rounded-lg bg-muted/40" />}
          </section>

          <section>
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ArrowLeft className="h-3 w-3" /> Backlinks <span className="tabular-nums">({links?.backlinks.length ?? 0})</span>
            </h2>
            {links && links.backlinks.length > 0
              ? <div className="flex flex-wrap gap-1.5">{links.backlinks.map((b) => <RefChip key={b.id} entry={b} />)}</div>
              : <p className="text-xs text-muted-foreground">No entry links here yet.</p>}
          </section>
          <section>
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ArrowRight className="h-3 w-3" /> Links out <span className="tabular-nums">({links?.outgoing.length ?? 0})</span>
            </h2>
            {links && links.outgoing.length > 0
              ? <div className="flex flex-wrap gap-1.5">{links.outgoing.map((b) => <RefChip key={b.id} entry={b} />)}</div>
              : <p className="text-xs text-muted-foreground">This entry doesn't link to others yet.</p>}
            {links && links.unresolved.length > 0 && (
              <div className="mt-2 text-[11px]">
                <p className="text-warning">Unresolved:</p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {links.unresolved.map((t) => (
                    <li key={t}>
                      <button onClick={() => setEditor({ entry: null, acceptOnSave: false, kind: "wiki", title: t, parentId: entry.id })}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-warning/60 px-2 py-0.5 hover:border-warning hover:text-warning">
                        <Link2 className="h-3 w-3" /> [[{t}]] · create
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </aside>
      </div>

      {editor && <EntryEditor state={editor} onClose={() => setEditor(null)} onSaved={(e) => { if (!editor.entry) router.push(`/knowledge/${e.id}`) }} />}
    </Page>
  )
}
