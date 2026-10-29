/**
 * Layered layout for small directed graphs (workflows, task graphs, code graphs).
 *
 * Cycles are broken by a DFS that marks edges into the current path as back
 * edges; the remaining DAG is layered by longest path from the sources (each
 * node then pulled right next to its nearest successor), and each layer is
 * ordered with a few barycenter sweeps to reduce crossings.
 * Back edges are kept and drawn as loops by the renderer.
 */

export interface LayoutEdge {
  source: string
  target: string
}

export interface LayoutResult {
  /** layer index and position within the layer, per node id */
  position: Map<string, { layer: number; index: number }>
  layers: string[][]
  /** "source→target" keys of edges that close a cycle */
  backEdges: Set<string>
}

export const edgeKey = (e: LayoutEdge) => `${e.source}→${e.target}`

export function layoutGraph(nodeIds: string[], edges: LayoutEdge[]): LayoutResult {
  const ids = new Set(nodeIds)
  const valid = edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
  const out = new Map<string, string[]>(nodeIds.map((id) => [id, []]))
  for (const e of valid) out.get(e.source)!.push(e.target)

  // 1. Back edges: DFS in input order, so the first node's flow reads left to right
  const backEdges = new Set<string>()
  const state = new Map<string, 1 | 2>() // 1 = on stack, 2 = done
  const visit = (id: string) => {
    state.set(id, 1)
    for (const next of out.get(id)!) {
      const s = state.get(next)
      if (s === 1) backEdges.add(`${id}→${next}`)
      else if (s === undefined) visit(next)
    }
    state.set(id, 2)
  }
  for (const id of nodeIds) if (!state.has(id)) visit(id)
  const forward = valid.filter((e) => !backEdges.has(edgeKey(e)))

  // 2. Layers: longest path from the sources (Kahn order over the DAG)
  const indegree = new Map<string, number>(nodeIds.map((id) => [id, 0]))
  for (const e of forward) indegree.set(e.target, indegree.get(e.target)! + 1)
  const layerOf = new Map<string, number>(nodeIds.map((id) => [id, 0]))
  const queue = nodeIds.filter((id) => indegree.get(id) === 0)
  const fwdOut = new Map<string, string[]>(nodeIds.map((id) => [id, []]))
  for (const e of forward) fwdOut.get(e.source)!.push(e.target)
  const topo: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    topo.push(id)
    for (const next of fwdOut.get(id)!) {
      layerOf.set(next, Math.max(layerOf.get(next)!, layerOf.get(id)! + 1))
      indegree.set(next, indegree.get(next)! - 1)
      if (indegree.get(next) === 0) queue.push(next)
    }
  }
  // Pull each node right, next to its nearest successor, so sources don't all
  // pile up in the first column with long edges reaching across the drawing
  for (const id of [...topo].reverse()) {
    const next = fwdOut.get(id)!
    if (next.length) layerOf.set(id, Math.min(...next.map((n) => layerOf.get(n)!)) - 1)
  }
  const depth = Math.max(0, ...layerOf.values())
  const layers: string[][] = Array.from({ length: depth + 1 }, () => [])
  for (const id of nodeIds) layers[layerOf.get(id)!].push(id)

  // 3. Order within layers: barycenter sweeps down, then up
  const preds = new Map<string, string[]>(nodeIds.map((id) => [id, []]))
  for (const e of forward) preds.get(e.target)!.push(e.source)
  const indexIn = () => {
    const m = new Map<string, number>()
    layers.forEach((layer) => layer.forEach((id, i) => m.set(id, i)))
    return m
  }
  const sortBy = (layer: string[], neighbours: (id: string) => string[], idx: Map<string, number>) => {
    const score = (id: string, fallback: number) => {
      const ns = neighbours(id)
      return ns.length ? ns.reduce((sum, n) => sum + idx.get(n)!, 0) / ns.length : fallback
    }
    const scored = layer.map((id, i) => ({ id, s: score(id, i) }))
    scored.sort((a, b) => a.s - b.s)
    return scored.map((x) => x.id)
  }
  for (let sweep = 0; sweep < 2; sweep++) {
    for (let l = 1; l < layers.length; l++) layers[l] = sortBy(layers[l], (id) => preds.get(id)!, indexIn())
    for (let l = layers.length - 2; l >= 0; l--) layers[l] = sortBy(layers[l], (id) => fwdOut.get(id)!, indexIn())
  }

  const position = new Map<string, { layer: number; index: number }>()
  layers.forEach((layer, l) => layer.forEach((id, i) => position.set(id, { layer: l, index: i })))
  return { position, layers, backEdges }
}
