"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Download, ExternalLink, Loader2, Search, Waypoints } from "lucide-react"
import { toast } from "sonner"
import ForceGraph from "@/components/graph/ForceGraph"
import { Button } from "@/components/ui/button"
import { Input, Segmented, Select, Switch } from "@/components/ui/form"
import { EmptyState, Page, PageHeader } from "@/components/ui/page"
import { downloadVault, useKnowledgeMap } from "@/hooks/useKnowledgeMap"
import { useProjects } from "@/hooks/useProjects"
import {
  EDGE_LABEL, KIND_LABEL, KNOWLEDGE_TONE, TYPE_LABEL, TYPE_TONE, matchesQuery, neighbourhood, toForceEdge, toForceNode,
} from "@/lib/mapView"
import { cn } from "@/lib/utils"
import type { KnowledgeKind, MapNode, MapNodeType } from "@/types"

const TYPES: MapNodeType[] = ["knowledge", "task", "prd", "project", "link", "module"]
const KINDS: KnowledgeKind[] = ["decision", "pattern", "glossary", "runbook", "convention", "wiki"]
const DOT: Record<string, string> = {
  primary: "bg-primary", info: "bg-info", warning: "bg-warning", danger: "bg-destructive", success: "bg-success",
  foreground: "bg-foreground/70", muted: "border border-muted-foreground/60 bg-background", accent: "bg-fuchsia-500",
}

export default function MapPage() {
  return (
    <Suspense fallback={null}>
      <KnowledgeMapPage />
    </Suspense>
  )
}

function KnowledgeMapPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: projects } = useProjects()
  const [projectId, setProjectId] = useState(searchParams.get("project") ?? "")
  const [types, setTypes] = useState<Set<MapNodeType>>(new Set(TYPES))
  const [kinds, setKinds] = useState<Set<KnowledgeKind>>(new Set(KINDS))
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<"global" | "local">("global")
  const [depth, setDepth] = useState(1)
  const [orphans, setOrphans] = useState(true)
  const [selected, setSelected] = useState<string | null>(searchParams.get("node"))
  const [exporting, setExporting] = useState(false)
  const { data, isLoading } = useKnowledgeMap({ projectId: projectId || undefined })

  useEffect(() => {
    const params = new URLSearchParams()
    if (projectId) params.set("project", projectId)
    if (selected) params.set("node", selected)
    router.replace(params.size ? `/map?${params}` : "/map", { scroll: false })
  }, [projectId, selected, router])

  const filtered = useMemo(() => {
    if (!data) return { nodes: [] as MapNode[], edges: [] }
    let nodes = data.nodes.filter((n) => types.has(n.type) && (n.type !== "knowledge" || kinds.has(n.kind as KnowledgeKind)))
    const ids = new Set(nodes.map((n) => n.id))
    let edges = data.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
    if (mode === "local" && selected && ids.has(selected)) ({ nodes, edges } = neighbourhood(nodes, edges, selected, depth))
    if (!orphans) {
      const linked = new Set(edges.flatMap((e) => [e.source, e.target]))
      nodes = nodes.filter((n) => linked.has(n.id) || n.id === selected)
    }
    return { nodes, edges }
  }, [data, types, kinds, mode, selected, depth, orphans])

  const highlighted = useMemo(() => {
    if (!query.trim()) return null
    return new Set(filtered.nodes.filter((n) => matchesQuery(n, query)).map((n) => n.id))
  }, [filtered.nodes, query])

  const forceNodes = useMemo(() => filtered.nodes.map(toForceNode), [filtered.nodes])
  const forceEdges = useMemo(() => filtered.edges.map(toForceEdge), [filtered.edges])
  const nodeById = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data])
  const current = selected ? nodeById.get(selected) : null

  const neighbours = useMemo(() => {
    if (!current || !data) return []
    return data.edges
      .filter((e) => e.source === current.id || e.target === current.id)
      .map((e) => {
        const otherId = e.source === current.id ? e.target : e.source
        const other = nodeById.get(otherId)
        return other ? { other, type: e.type, outgoing: e.source === current.id } : null
      })
      .filter((x): x is { other: MapNode; type: (typeof data.edges)[number]["type"]; outgoing: boolean } => x !== null)
  }, [current, data, nodeById])

  const unresolved = useMemo(() => {
    if (!data) return []
    return data.unresolved.flatMap((u) => u.targets.map((target) => ({ target, from: nodeById.get(u.source) })))
  }, [data, nodeById])

  function open(id: string) {
    const n = nodeById.get(id)
    if (!n?.href) return
    if (n.type === "link") window.open(n.href, "_blank", "noopener,noreferrer")
    else router.push(n.href)
  }

  async function exportVault() {
    setExporting(true)
    try {
      await downloadVault(projectId || undefined)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed")
    } finally {
      setExporting(false)
    }
  }

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value); else next.add(value)
    return next
  }

  return (
    <Page wide>
      <PageHeader
        icon={<Waypoints className="h-4 w-4" />}
        title="Map"
        description="Your knowledge as a graph: entries joined by [[wikilinks]], with the projects, tasks, PRDs, links and code they touch."
        actions={
          <>
            <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setSelected(null) }} aria-label="Scope to a project" className="h-8 w-48 text-xs">
              <option value="">Whole organization</option>
              {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Button size="sm" variant="outline" onClick={exportVault} disabled={exporting || !data || data.nodes.length === 0}>
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Obsidian vault
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[220px_1fr_280px]">
        <aside className="space-y-4 text-xs">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a node…" className="pl-8" aria-label="Search the map" />
          </div>
          <div>
            <p className="mb-1.5 font-semibold uppercase tracking-wide text-muted-foreground">View</p>
            <Segmented size="sm" value={mode} onChange={setMode}
              options={[{ value: "global", label: "Global" }, { value: "local", label: "Local" }]} />
            {mode === "local" && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-muted-foreground">Depth</span>
                <Segmented size="sm" value={String(depth)} onChange={(v) => setDepth(Number(v))}
                  options={[{ value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }]} />
              </div>
            )}
            {mode === "local" && !selected && <p className="mt-1.5 text-muted-foreground">Select a node to see its neighbourhood.</p>}
          </div>
          <div>
            <p className="mb-1.5 font-semibold uppercase tracking-wide text-muted-foreground">Show</p>
            <ul className="space-y-1">
              {TYPES.map((t) => (
                <li key={t}>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" className="accent-[hsl(var(--primary))]" checked={types.has(t)} onChange={() => setTypes(toggle(types, t))} />
                    <span className={cn("h-2.5 w-2.5 rounded-full", DOT[TYPE_TONE[t]])} />
                    <span className="flex-1">{TYPE_LABEL[t]}</span>
                    <span className="tabular-nums text-muted-foreground">{data?.counts[t] ?? 0}</span>
                  </label>
                </li>
              ))}
            </ul>
            {!projectId && types.has("module") && (
              <p className="mt-1 text-[11px] text-muted-foreground">Code modules appear when the map is scoped to one project.</p>
            )}
          </div>
          <div>
            <p className="mb-1.5 font-semibold uppercase tracking-wide text-muted-foreground">Knowledge kinds</p>
            <ul className="space-y-1">
              {KINDS.map((k) => (
                <li key={k}>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" className="accent-[hsl(var(--primary))]" checked={kinds.has(k)} onChange={() => setKinds(toggle(kinds, k))} />
                    <span className={cn("h-2.5 w-2.5 rounded-full", DOT[KNOWLEDGE_TONE[k]])} />
                    <span>{KIND_LABEL[k]}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <Switch checked={orphans} onChange={setOrphans} label="Show unlinked nodes" />
          <p className="text-[11px] text-muted-foreground">
            Drag to pan, wheel to zoom, drag a node to move it. Click selects, double-click opens.
          </p>
        </aside>

        <div className="min-w-0">
          {isLoading ? (
            <div className="flex h-[560px] items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Building the map…
            </div>
          ) : data && data.nodes.length > 0 ? (
            <ForceGraph nodes={forceNodes} edges={forceEdges} selectedId={selected} onSelect={setSelected} onOpen={open}
              highlighted={highlighted} ariaLabel="Knowledge map" focusId={mode === "local" ? selected : null} />
          ) : (
            <EmptyState icon={<Waypoints className="h-5 w-5" />} title="Nothing to map yet"
              description={<>Add knowledge entries and link them with <code>[[wikilinks]]</code>; tasks, PRDs and external links join the graph automatically.</>}
              action={<Link href="/knowledge" className="text-sm font-medium text-primary hover:underline">Open the knowledge base →</Link>} />
          )}
          {unresolved.length > 0 && (
            <div className="mt-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
              <p className="font-semibold">Unresolved links — pages that are referenced but don't exist yet</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {unresolved.slice(0, 30).map(({ target, from }, i) => (
                  <li key={`${target}-${i}`}>
                    <Link href={`/knowledge?new=${encodeURIComponent(target)}&kind=wiki`}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-warning/60 bg-background px-2 py-0.5 hover:border-warning hover:text-warning"
                      title={from ? `Linked from ${from.label}` : undefined}>
                      [[{target}]] <span className="text-muted-foreground">create</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="surface min-h-[200px] p-4 text-xs">
          {current ? (
            <>
              <div className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", DOT[toForceNode(current).tone])} />
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {current.type === "knowledge" ? KIND_LABEL[current.kind as KnowledgeKind] : TYPE_LABEL[current.type].replace(/s$/, "")}
                  {current.status ? ` · ${current.status.replace("_", " ")}` : ""}
                </span>
              </div>
              <h2 className="mt-1 text-sm font-semibold">{current.label}</h2>
              {current.purpose && <p className="mt-1 text-muted-foreground">{current.purpose}</p>}
              {current.url && <p className="mt-1 truncate text-muted-foreground">{current.url}</p>}
              {current.href && (
                current.type === "link"
                  ? <a href={current.href} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-flex items-center gap-1 font-medium text-primary hover:underline">Open link <ExternalLink className="h-3 w-3" /></a>
                  : <Link href={current.href} className="mt-2 inline-block font-medium text-primary hover:underline">Open →</Link>
              )}
              <div className="mt-3 flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setMode(mode === "local" ? "global" : "local")}>
                  {mode === "local" ? "Show whole map" : "Local graph"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setSelected(null)}>Clear</Button>
              </div>
              <h3 className="mb-1.5 mt-4 font-semibold uppercase tracking-wide text-muted-foreground">Connections ({neighbours.length})</h3>
              {neighbours.length === 0 ? (
                <p className="text-muted-foreground">Nothing links here yet.</p>
              ) : (
                <ul className="max-h-[360px] space-y-1 overflow-y-auto">
                  {neighbours.map(({ other, type, outgoing }, i) => (
                    <li key={`${other.id}-${type}-${i}`}>
                      <button onClick={() => setSelected(other.id)} className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted">
                        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", DOT[toForceNode(other).tone])} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{other.label}</span>
                          <span className="block text-[10px] text-muted-foreground">{outgoing ? EDGE_LABEL[type] : `← ${EDGE_LABEL[type]}`}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p className="font-semibold">Legend</p>
              <ul className="mt-2 space-y-1">
                {KINDS.map((k) => (
                  <li key={k} className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full", DOT[KNOWLEDGE_TONE[k]])} /> {KIND_LABEL[k]}</li>
                ))}
                {(["task", "prd", "project", "link", "module"] as MapNodeType[]).map((t) => (
                  <li key={t} className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full", DOT[TYPE_TONE[t]])} /> {TYPE_LABEL[t]}</li>
                ))}
              </ul>
              <p className="mt-3 text-muted-foreground">
                Solid lines are wikilinks, dependencies, parents and imports; dashed lines are mentions, scope and external links.
                Bigger circles have more connections.
              </p>
              <p className="mt-3 text-muted-foreground">Select a node to see what it connects to.</p>
            </>
          )}
        </aside>
      </div>
    </Page>
  )
}
