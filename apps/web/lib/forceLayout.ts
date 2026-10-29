/**
 * A small force-directed layout for the knowledge map (no d3 dependency).
 *
 * Forces, per tick: pairwise repulsion (inverse-square, capped), spring
 * attraction along edges, a weak pull to the centre, and velocity decay.
 * `alpha` cools from 1 towards 0 so the drawing settles; dragging a node
 * reheats it. Positions start on a deterministic spiral from a seeded
 * generator, so the same graph always settles the same way.
 */

export interface SimNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  /** Pinned nodes (being dragged) ignore forces */
  fixed: boolean
  /** Node size, used for collision radius and repulsion strength */
  r: number
}

export interface SimEdge {
  source: string
  target: string
}

export interface SimulationOptions {
  width: number
  height: number
  seed?: number
  /** Ideal edge length */
  linkDistance?: number
  /** Repulsion strength (bigger = more spread) */
  charge?: number
  gravity?: number
}

export class Simulation {
  nodes: SimNode[]
  private byId = new Map<string, SimNode>()
  private edges: Array<[SimNode, SimNode]>
  alpha = 1
  readonly alphaMin = 0.02
  private readonly decay = 0.06
  private readonly options: Required<SimulationOptions>

  constructor(ids: Array<{ id: string; r?: number }>, edges: SimEdge[], options: SimulationOptions) {
    // Gravity weakens with size so big maps spread instead of collapsing on the centre
    const gravity = 0.03 * Math.min(1, 12 / Math.max(1, ids.length)) + 0.004
    this.options = { seed: 7, linkDistance: 48, charge: 3000, gravity, ...options }
    const rand = mulberry32(this.options.seed)
    const cx = this.options.width / 2, cy = this.options.height / 2
    this.nodes = ids.map(({ id, r }, i) => {
      // Golden-angle spiral: evenly spread, deterministic, no overlaps at start
      const angle = i * 2.399963 + rand() * 0.3
      const radius = 14 * Math.sqrt(i + 1) + rand() * 6
      return { id, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, vx: 0, vy: 0, fixed: false, r: r ?? 6 }
    })
    for (const n of this.nodes) this.byId.set(n.id, n)
    this.edges = edges
      .filter((e) => this.byId.has(e.source) && this.byId.has(e.target) && e.source !== e.target)
      .map((e) => [this.byId.get(e.source)!, this.byId.get(e.target)!])
  }

  get(id: string): SimNode | undefined {
    return this.byId.get(id)
  }

  get settled(): boolean {
    return this.alpha < this.alphaMin
  }

  reheat(alpha = 0.5): void {
    this.alpha = Math.max(this.alpha, alpha)
  }

  pin(id: string, x: number, y: number): void {
    const n = this.byId.get(id)
    if (!n) return
    n.fixed = true
    n.x = x
    n.y = y
    n.vx = n.vy = 0
  }

  release(id: string): void {
    const n = this.byId.get(id)
    if (n) n.fixed = false
  }

  /** One step. Returns the remaining alpha. */
  tick(): number {
    if (this.settled) return this.alpha
    const { charge, linkDistance, gravity, width, height } = this.options
    const a = this.alpha
    const nodes = this.nodes
    const cx = width / 2, cy = height / 2

    // Repulsion: O(n²) is fine for the few hundred nodes a map holds
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i]
      for (let j = i + 1; j < nodes.length; j++) {
        const q = nodes[j]
        let dx = q.x - p.x, dy = q.y - p.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) { dx = 0.5; dy = 0.5; d2 = 0.5 }
        const min = p.r + q.r + 6
        const d = Math.sqrt(d2)
        // Inverse-square repulsion, plus a hard push when circles overlap
        let f = (charge * a) / d2
        if (d < min) f += (min - d) * 0.6
        f = Math.min(f, 12)
        const fx = (dx / d) * f, fy = (dy / d) * f
        if (!p.fixed) { p.vx -= fx; p.vy -= fy }
        if (!q.fixed) { q.vx += fx; q.vy += fy }
      }
    }
    // Springs
    for (const [s, t] of this.edges) {
      const dx = t.x - s.x, dy = t.y - s.y
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy))
      const f = ((d - linkDistance) / d) * 0.3 * a
      const fx = dx * f, fy = dy * f
      if (!s.fixed) { s.vx += fx; s.vy += fy }
      if (!t.fixed) { t.vx -= fx; t.vy -= fy }
    }
    // Gravity + integrate
    for (const n of nodes) {
      if (n.fixed) continue
      n.vx += (cx - n.x) * gravity * a
      n.vy += (cy - n.y) * gravity * a
      n.vx *= 0.6
      n.vy *= 0.6
      n.x += n.vx
      n.y += n.vy
    }
    this.alpha -= this.alpha * this.decay
    return this.alpha
  }

  /** Run until settled or `max` ticks (used for an initial synchronous layout). */
  run(max = 300): void {
    for (let i = 0; i < max && !this.settled; i++) this.tick()
  }

  bounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of this.nodes) {
      minX = Math.min(minX, n.x - n.r); minY = Math.min(minY, n.y - n.r)
      maxX = Math.max(maxX, n.x + n.r); maxY = Math.max(maxY, n.y + n.r)
    }
    if (!this.nodes.length) return { minX: 0, minY: 0, maxX: this.options.width, maxY: this.options.height }
    return { minX, minY, maxX, maxY }
  }
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
