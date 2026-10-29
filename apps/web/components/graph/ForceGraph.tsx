"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Simulation } from "@/lib/forceLayout"
import { cn } from "@/lib/utils"

export type ForceNodeTone = "primary" | "info" | "warning" | "danger" | "success" | "foreground" | "muted" | "accent"

export interface ForceNode {
  id: string
  label: string
  tone: ForceNodeTone
  /** Circle radius; defaults scale with `weight` */
  weight?: number
  /** Hollow circle (e.g. an unresolved or external node) */
  hollow?: boolean
}

export interface ForceEdge {
  source: string
  target: string
  dashed?: boolean
  directed?: boolean
}

const FILL: Record<ForceNodeTone, string> = {
  primary: "fill-primary", info: "fill-info", warning: "fill-warning", danger: "fill-destructive",
  success: "fill-success", foreground: "fill-foreground/70", muted: "fill-muted-foreground/60", accent: "fill-fuchsia-500",
}
const STROKE: Record<ForceNodeTone, string> = {
  primary: "stroke-primary", info: "stroke-info", warning: "stroke-warning", danger: "stroke-destructive",
  success: "stroke-success", foreground: "stroke-foreground/70", muted: "stroke-muted-foreground/60", accent: "stroke-fuchsia-500",
}

interface Transform { x: number; y: number; k: number }

/**
 * An Obsidian-style graph: force-directed, pan with drag, zoom with the wheel,
 * drag nodes, hover to light up a neighbourhood, click to select, double-click
 * to open. Labels fade in as you zoom.
 */
export default function ForceGraph({
  nodes, edges, selectedId, onSelect, onOpen, highlighted, ariaLabel, className, height = 560, focusId,
}: {
  nodes: ForceNode[]
  edges: ForceEdge[]
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  onOpen?: (id: string) => void
  /** Ids matching a search: everything else dims */
  highlighted?: Set<string> | null
  ariaLabel: string
  className?: string
  height?: number
  /** Centre the view on this node when it changes */
  focusId?: string | null
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: height })
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 })
  const [hovered, setHovered] = useState<string | null>(null)
  const [, bump] = useState(0)
  const dragRef = useRef<{ id: string | null; startX: number; startY: number; moved: boolean; origin: Transform } | null>(null)

  useEffect(() => {
    const el = svgRef.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.max(240, entry.contentRect.width)
      setSize((s) => (s.w === w ? s : { w, h: height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [height])

  // One simulation per graph shape; the renderer reads positions off it each frame
  const signature = useMemo(
    () => `${nodes.map((n) => `${n.id}:${n.weight ?? 1}`).join("|")}#${edges.map((e) => `${e.source}>${e.target}`).join("|")}`,
    [nodes, edges],
  )
  const sim = useMemo(() => {
    const s = new Simulation(
      nodes.map((n) => ({ id: n.id, r: radiusOf(n) })), edges, { width: size.w, height: size.h },
    )
    s.run(nodes.length > 150 ? 60 : 120)  // a head start so the first paint is already readable
    return s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, size.w, size.h])

  useEffect(() => {
    let frame = 0
    const step = () => {
      if (!sim.settled) {
        for (let i = 0; i < 2; i++) sim.tick()
        bump((v) => v + 1)
        frame = requestAnimationFrame(step)
      }
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [sim])

  // Fit the drawing when the graph changes shape; the Fit button does the same on demand
  const fit = useCallback(() => {
    const b = sim.bounds()
    const pad = 40
    const k = Math.min(2, Math.max(0.3, Math.min(size.w / (b.maxX - b.minX + pad * 2), size.h / (b.maxY - b.minY + pad * 2))))
    setTransform({ k, x: size.w / 2 - ((b.minX + b.maxX) / 2) * k, y: size.h / 2 - ((b.minY + b.maxY) / 2) * k })
  }, [sim, size.w, size.h])
  const fitted = useRef<string | null>(null)
  useEffect(() => {
    if (fitted.current === signature) return
    fitted.current = signature
    fit()
  }, [fit, signature])

  useEffect(() => {
    if (!focusId) return
    const n = sim.get(focusId)
    if (!n) return
    setTransform((t) => ({ ...t, x: size.w / 2 - n.x * t.k, y: size.h / 2 - n.y * t.k }))
  }, [focusId, sim, size.w, size.h])

  const neighbours = useMemo(() => {
    const active = hovered ?? selectedId
    if (!active) return null
    const set = new Set([active])
    for (const e of edges) {
      if (e.source === active) set.add(e.target)
      if (e.target === active) set.add(e.source)
    }
    return set
  }, [hovered, selectedId, edges])

  const toGraph = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: (clientX - rect.left - transform.x) / transform.k, y: (clientY - rect.top - transform.y) / transform.k }
  }, [transform])

  // React registers wheel listeners as passive, so preventDefault (keeping the
  // page still while zooming) needs a native non-passive listener
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const px = e.clientX - rect.left, py = e.clientY - rect.top
      const factor = Math.exp(-e.deltaY * 0.0015)
      setTransform((t) => {
        const k = Math.min(4, Math.max(0.15, t.k * factor))
        return { k, x: px - ((px - t.x) / t.k) * k, y: py - ((py - t.y) / t.k) * k }
      })
    }
    svg.addEventListener("wheel", onWheel, { passive: false })
    return () => svg.removeEventListener("wheel", onWheel)
  }, [])

  function onPointerDown(e: React.PointerEvent, id: string | null) {
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, moved: false, origin: transform }
    if (id) {
      const n = sim.get(id)
      if (n) sim.pin(id, n.x, n.y)
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) < 3) return
    d.moved = true
    if (d.id) {
      const p = toGraph(e.clientX, e.clientY)
      sim.pin(d.id, p.x, p.y)
      sim.reheat(0.3)
      bump((v) => v + 1)
    } else {
      setTransform({ ...d.origin, x: d.origin.x + dx, y: d.origin.y + dy })
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (d.id) {
      sim.release(d.id)
      if (!d.moved) onSelect?.(selectedId === d.id ? null : d.id)
    } else if (!d.moved) {
      onSelect?.(null)
    }
    ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
  }

  const showLabels = transform.k >= 0.7
  const active = hovered ?? selectedId
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  return (
    <div className={cn("relative overflow-hidden rounded-lg border bg-muted/20", className)} style={{ height }}>
      <svg ref={svgRef} width={size.w} height={size.h} role="group" aria-label={ariaLabel}
        className="block cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={(e) => onPointerDown(e, null)} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {edges.map((e, i) => {
            const s = sim.get(e.source), t = sim.get(e.target)
            if (!s || !t) return null
            const lit = active && (e.source === active || e.target === active)
            const dim = (neighbours && !lit) || (highlighted && !(highlighted.has(e.source) && highlighted.has(e.target)))
            return (
              <line key={`${e.source}>${e.target}:${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                strokeWidth={lit ? 1.6 / transform.k : 1 / transform.k}
                strokeDasharray={e.dashed ? `${4 / transform.k} ${3 / transform.k}` : undefined}
                className={cn("transition-opacity", lit ? "stroke-primary" : "stroke-muted-foreground/40", dim && "opacity-15")} />
            )
          })}
          {sim.nodes.map((p) => {
            const n = nodeById.get(p.id)
            if (!n) return null
            const r = radiusOf(n)
            const isActive = p.id === active
            const dim = (neighbours && !neighbours.has(p.id)) || (highlighted && !highlighted.has(p.id))
            const label = showLabels || isActive || (neighbours?.has(p.id) ?? false) || (highlighted?.has(p.id) ?? false)
            return (
              <g key={p.id} transform={`translate(${p.x},${p.y})`}
                className={cn("cursor-pointer outline-none transition-opacity", dim && "opacity-25")}
                role="button" tabIndex={0} aria-label={n.label} aria-pressed={p.id === selectedId}
                onPointerDown={(e) => onPointerDown(e, p.id)}
                onPointerEnter={() => setHovered(p.id)} onPointerLeave={() => setHovered(null)}
                onDoubleClick={(e) => { e.stopPropagation(); onOpen?.(p.id) }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); if (onOpen) onOpen(p.id); else onSelect?.(p.id) }
                  if (e.key === " ") { e.preventDefault(); onSelect?.(selectedId === p.id ? null : p.id) }
                }}>
                <title>{n.label}</title>
                {p.id === selectedId && (
                  <circle r={r + 5 / transform.k} className="fill-primary/15 stroke-primary" strokeWidth={1.5 / transform.k} />
                )}
                <circle r={r} strokeWidth={n.hollow ? 1.5 / transform.k : isActive ? 2 / transform.k : 0}
                  className={cn(n.hollow ? "fill-background" : FILL[n.tone], STROKE[n.tone])} />
                {label && (
                  <text y={r + 11 / transform.k} textAnchor="middle" fontSize={11 / transform.k}
                    className={cn("pointer-events-none fill-foreground", isActive ? "font-semibold" : "opacity-80")}
                    style={{ paintOrder: "stroke", stroke: "hsl(var(--background))", strokeWidth: 3 / transform.k, strokeLinejoin: "round" }}>
                    {clip(n.label, isActive ? 60 : 28)}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-background/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur">
        {nodes.length} nodes · {edges.length} links · {Math.round(transform.k * 100)}%
      </div>
      <div className="absolute left-2 top-2 flex gap-1">
        <button type="button" aria-label="Zoom in" className="rounded-md border bg-background/90 px-2 py-0.5 text-xs hover:bg-muted"
          onClick={() => setTransform((t) => zoomAt(t, size, 1.3))}>+</button>
        <button type="button" aria-label="Zoom out" className="rounded-md border bg-background/90 px-2 py-0.5 text-xs hover:bg-muted"
          onClick={() => setTransform((t) => zoomAt(t, size, 1 / 1.3))}>−</button>
        <button type="button" aria-label="Fit to view" className="rounded-md border bg-background/90 px-2 py-0.5 text-xs hover:bg-muted"
          onClick={fit}>Fit</button>
      </div>
    </div>
  )
}

function zoomAt(t: Transform, size: { w: number; h: number }, factor: number): Transform {
  const k = Math.min(4, Math.max(0.15, t.k * factor))
  const px = size.w / 2, py = size.h / 2
  return { k, x: px - ((px - t.x) / t.k) * k, y: py - ((py - t.y) / t.k) * k }
}

function radiusOf(n: ForceNode): number {
  return 4 + Math.min(10, Math.sqrt(n.weight ?? 1) * 2)
}

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
