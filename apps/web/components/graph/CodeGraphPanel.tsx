"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Boxes, Loader2, Network, RefreshCw, Terminal } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { EmptyState, SectionCard } from "@/components/ui/page"
import Markdown from "@/components/Markdown"
import GraphView, { type GraphEdge, type GraphNode } from "@/components/graph/GraphView"
import { useBuildCodeGraph, useCodeGraph } from "@/hooks/useCodeGraph"
import { formatRelativeTime } from "@/lib/utils"
import type { CodeGraphData, Project } from "@/types"

function moduleLabel(id: string) {
  if (id === ".") return "root files"
  const parts = id.split("/")
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : id
}

function ModuleDetail({ graph, moduleId }: { graph: CodeGraphData; moduleId: string }) {
  const m = graph.modules.find((x) => x.id === moduleId)
  if (!m) return null
  const dependsOn = graph.edges.filter((e) => e.source === m.id).sort((a, b) => b.weight - a.weight)
  const usedBy = graph.edges.filter((e) => e.target === m.id).sort((a, b) => b.weight - a.weight)
  return (
    <div className="mt-3 rounded-lg border bg-background p-3 text-xs">
      <p className="font-mono text-[11px] font-semibold">{m.id}</p>
      {m.purpose && <p className="mt-1 text-foreground/80">{m.purpose}</p>}
      <p className="mt-1 text-muted-foreground">{m.files} files · {m.lines.toLocaleString()} lines · {m.languages.join(", ")}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <p className="mb-1 font-medium">Key files</p>
          <ul className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
            {m.key_files.map((f) => <li key={f} className="truncate" title={f}>{f}</li>)}
          </ul>
        </div>
        <div className="space-y-2">
          <div>
            <p className="mb-1 font-medium">Depends on</p>
            <p className="text-muted-foreground">{dependsOn.map((e) => `${moduleLabel(e.target)} (${e.weight})`).join(", ") || "nothing internal"}</p>
          </div>
          <div>
            <p className="mb-1 font-medium">Used by</p>
            <p className="text-muted-foreground">{usedBy.map((e) => `${moduleLabel(e.source)} (${e.weight})`).join(", ") || "nothing internal"}</p>
          </div>
          {m.externals.length > 0 && (
            <div>
              <p className="mb-1 font-medium">External packages</p>
              <p className="text-muted-foreground">{m.externals.join(", ")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** The project's code graph: what engineers are grounded in before they touch an existing repo. */
export default function CodeGraphPanel({ project }: { project: Project }) {
  const { data: row, isLoading } = useCodeGraph(project.id)
  const build = useBuildCodeGraph(project.id)
  const [selected, setSelected] = useState<string | null>(null)
  const [allEdges, setAllEdges] = useState(false)
  const graph = row?.graph ?? null

  const { nodes, edges, hidden } = useMemo(() => {
    if (!graph) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[], hidden: 0 }
    // Every import edge at once is unreadable past a dozen modules: keep the
    // strongest ones, plus every edge of the selected module.
    const limit = Math.max(12, Math.round(graph.modules.length * 1.5))
    const strongest = new Set([...graph.edges].sort((a, b) => b.weight - a.weight).slice(0, limit))
    const shown = allEdges ? graph.edges
      : graph.edges.filter((e) => strongest.has(e) || e.source === selected || e.target === selected)
    return {
      hidden: graph.edges.length - shown.length,
      nodes: graph.modules.map((m) => ({
        id: m.id,
        label: moduleLabel(m.id),
        sublabel: `${m.files} files · ${m.languages[0] ?? "—"}`,
        tone: "default" as const,
      })),
      edges: shown.map((e) => ({ source: e.source, target: e.target, weight: e.weight })),
    }
  }, [graph, allEdges, selected])

  async function handleBuild() {
    try {
      await build.mutateAsync()
      toast.success("Mapping the repository — this takes a minute for large repos")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start mapping")
    }
  }

  if (!project.repo_url) {
    return (
      <EmptyState
        icon={<Network className="h-5 w-5" />}
        title="No repository connected"
        description="Add a GitHub repository URL in Settings. Gravel maps its modules, dependencies, stack and commands, and grounds every run in that map."
      />
    )
  }
  if (isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />

  const busy = row?.status === "pending" || row?.status === "building" || build.isPending
  const rebuild = (
    <Button size="sm" variant="outline" onClick={handleBuild} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      {row ? "Rebuild" : "Map the codebase"}
    </Button>
  )

  if (!row || (!graph && !busy && row.status !== "failed")) {
    return (
      <EmptyState
        icon={<Network className="h-5 w-5" />}
        title="Map this repository"
        description="Builds a graph of the code's modules and how they depend on each other, so engineers start from the existing architecture instead of guessing."
        action={rebuild}
      />
    )
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title={<span className="inline-flex items-center gap-2"><Network className="h-4 w-4 text-muted-foreground" /> Code graph</span>}
        description={
          busy ? "Mapping the repository…"
            : row.built_at ? `Mapped ${formatRelativeTime(row.built_at)} at ${row.commit_sha?.slice(0, 7) ?? "?"} · ${graph?.stats.files ?? 0} files in ${graph?.modules.length ?? 0} modules`
              : "Not mapped yet"
        }
        actions={rebuild}
      >
        {row.status === "failed" && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {row.error ?? "Mapping failed"}
          </div>
        )}
        {graph ? (
          <>
            <GraphView nodes={nodes} edges={edges} selectedId={selected} onSelect={setSelected}
              ariaLabel="Modules and their import dependencies" minScale={0.9} className="max-h-[520px]" />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <p>Arrows point from a module to the modules it imports; thicker means more imports. Select a module for details.</p>
              {(hidden > 0 || allEdges) && (
                <button onClick={() => setAllEdges((v) => !v)} className="font-medium text-primary hover:underline">
                  {allEdges ? "Show the strongest imports only" : `Show all imports (${hidden} more)`}
                </button>
              )}
            </div>
            {selected && <ModuleDetail graph={graph} moduleId={selected} />}
          </>
        ) : busy ? (
          <div className="h-48 animate-pulse rounded-lg bg-muted/60" />
        ) : null}
      </SectionCard>

      {graph && (
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <SectionCard title="Architecture overview" description="Every run gets this with the modules relevant to its task.">
            <Markdown className="text-sm">{row.summary_markdown ?? ""}</Markdown>
          </SectionCard>
          <div className="space-y-4">
            <SectionCard title={<span className="inline-flex items-center gap-2"><Boxes className="h-4 w-4 text-muted-foreground" /> Stack</span>}>
              <div className="flex flex-wrap gap-1.5">
                {graph.stack.map((s) => <span key={s} className="rounded-full border px-2 py-0.5 text-[11px]">{s}</span>)}
                {graph.stack.length === 0 && <p className="text-xs text-muted-foreground">Not detected.</p>}
              </div>
            </SectionCard>
            <SectionCard
              title={<span className="inline-flex items-center gap-2"><Terminal className="h-4 w-4 text-muted-foreground" /> Commands</span>}
              description="Test commands also gate Claude Code build runs."
            >
              {graph.commands.length === 0 ? (
                <p className="text-xs text-muted-foreground">None detected.</p>
              ) : (
                <ul className="space-y-1">
                  {graph.commands.map((c) => (
                    <li key={`${c.cwd}-${c.run}`} className="flex items-baseline justify-between gap-2 text-xs">
                      <code className="truncate font-mono text-[11px]">{c.run}</code>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{c.cwd}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  )
}
