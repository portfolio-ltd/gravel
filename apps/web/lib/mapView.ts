import type { ForceEdge, ForceNode, ForceNodeTone } from "@/components/graph/ForceGraph"
import type { KnowledgeKind, MapEdge, MapNode, MapNodeType } from "@/types"

export const KNOWLEDGE_TONE: Record<KnowledgeKind, ForceNodeTone> = {
  decision: "primary", pattern: "info", glossary: "warning", runbook: "danger", convention: "success", wiki: "foreground",
}

export const TYPE_TONE: Record<MapNodeType, ForceNodeTone> = {
  knowledge: "foreground", task: "accent", prd: "info", project: "foreground", link: "muted", module: "muted",
}

export const TYPE_LABEL: Record<MapNodeType, string> = {
  knowledge: "Knowledge", task: "Tasks", prd: "PRDs", project: "Projects", link: "External links", module: "Code modules",
}

export const KIND_LABEL: Record<KnowledgeKind, string> = {
  decision: "Decision", pattern: "Pattern", glossary: "Glossary", runbook: "Runbook", convention: "Convention", wiki: "Wiki page",
}

export const EDGE_LABEL: Record<MapEdge["type"], string> = {
  wikilink: "links to", mentions: "mentions", proposed: "proposed", parent: "contains", scope: "applies to",
  depends: "is needed by", link: "references", import: "imports",
}

export function toneFor(node: MapNode): ForceNodeTone {
  if (node.type === "knowledge") return KNOWLEDGE_TONE[(node.kind as KnowledgeKind) ?? "wiki"] ?? "foreground"
  return TYPE_TONE[node.type]
}

export function toForceNode(node: MapNode): ForceNode {
  return {
    id: node.id, label: node.label, tone: toneFor(node), weight: node.degree + 1,
    hollow: node.type === "link" || node.type === "module" || node.status === "deprecated" || node.status === "rejected",
  }
}

export function toForceEdge(edge: MapEdge): ForceEdge {
  return { source: edge.source, target: edge.target, dashed: edge.type === "scope" || edge.type === "mentions" || edge.type === "link" }
}

/** The depth-limited neighbourhood of one node (Obsidian's "local graph"). */
export function neighbourhood(nodes: MapNode[], edges: MapEdge[], centre: string, depth = 1): { nodes: MapNode[]; edges: MapEdge[] } {
  const keep = new Set([centre])
  let frontier = [centre]
  for (let d = 0; d < depth; d++) {
    const next: string[] = []
    for (const e of edges) {
      if (frontier.includes(e.source) && !keep.has(e.target)) { keep.add(e.target); next.push(e.target) }
      if (frontier.includes(e.target) && !keep.has(e.source)) { keep.add(e.source); next.push(e.source) }
    }
    frontier = next
  }
  return {
    nodes: nodes.filter((n) => keep.has(n.id)),
    edges: edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  }
}

export function matchesQuery(node: MapNode, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return node.label.toLowerCase().includes(q) || (node.slug ?? "").includes(q) || (node.kind ?? "").includes(q)
}
