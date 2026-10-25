"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowDown, ArrowRight, ArrowUp, BookOpen, Check, Eye, EyeOff, FolderKanban, GitBranch, Inbox, Key,
  Kanban, LayoutGrid, Plus, Settings2, Sparkles,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useAuth } from "@/contexts/AuthContext"
import { usePreferences } from "@/contexts/PreferencesContext"
import { useAttentionTasks, useBoard } from "@/hooks/useBoard"
import { useProjects } from "@/hooks/useProjects"
import { useApiKeys } from "@/hooks/useUsers"
import { useKnowledge } from "@/hooks/useSdlc"
import { useWorkflows } from "@/hooks/useWorkflows"
import WorkspaceMetrics from "@/components/WorkspaceMetrics"
import { Button } from "@/components/ui/button"
import { Page } from "@/components/ui/page"
import { HOME_WIDGETS } from "@/lib/theme"
import { cn } from "@/lib/utils"

type WidgetId = (typeof HOME_WIDGETS)[number]["id"]

function greeting(): string {
  const h = new Date().getHours()
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}

function Widget({ title, icon, href, children, className }: {
  title: string; icon: React.ReactNode; href?: string; children: React.ReactNode; className?: string
}) {
  return (
    <section className={cn("surface flex flex-col", className)}>
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
        {href && (
          <Link href={href} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </header>
      <div className="flex-1 p-4">{children}</div>
    </section>
  )
}

function AttentionWidget() {
  const { data } = useAttentionTasks()
  const items = data ?? []
  return (
    <Widget title="Needs your attention" icon={<Inbox className="h-4 w-4" />} href="/attention">
      {items.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-success" /> Nothing is waiting on you.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 5).map((a) => (
            <li key={a.run_id}>
              <Link href="/attention" className="group block rounded-lg border px-3 py-2 transition-colors hover:bg-accent">
                <div className="flex items-center gap-2">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", a.outcome === "needs_human_input" || a.outcome === "blocked" ? "bg-warning" : "bg-primary")} />
                  <p className="truncate text-sm font-medium">{a.task_title}</p>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(a.blocked_since), { addSuffix: true })}
                  </span>
                </div>
                <p className="mt-0.5 truncate pl-3.5 text-xs text-muted-foreground">
                  {a.project_name} · {a.blocking_reason ?? a.outcome.replace(/_/g, " ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  )
}

function ProjectsWidget() {
  const { data } = useProjects()
  const projects = (data ?? []).slice(0, 6)
  return (
    <Widget title="Active projects" icon={<FolderKanban className="h-4 w-4" />} href="/projects">
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects yet.</p>
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects?project=${p.id}`} className="block">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium hover:underline">{p.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.progress}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${p.progress}%` }} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  )
}

function PipelineWidget() {
  const { data } = useBoard()
  const columns = data?.columns ?? []
  const max = Math.max(1, ...columns.map((c) => c.tasks.length))
  return (
    <Widget title="Pipeline at a glance" icon={<Kanban className="h-4 w-4" />} href="/board">
      {columns.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        <div className="space-y-2.5">
          {columns.map((c) => (
            <div key={c.key} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 truncate text-muted-foreground">{c.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${(c.tasks.length / max) * 100}%` }} />
              </div>
              <span className="w-6 text-right font-medium tabular-nums">{c.tasks.length}</span>
            </div>
          ))}
        </div>
      )}
    </Widget>
  )
}

function KnowledgeWidget() {
  const { data } = useKnowledge({ status: "proposed" })
  const proposed = data ?? []
  return (
    <Widget title="Knowledge to review" icon={<BookOpen className="h-4 w-4" />} href="/knowledge">
      {proposed.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No proposals. Engineers suggest decisions, patterns and glossary terms here as they work.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {proposed.slice(0, 5).map((k) => (
            <li key={k.id} className="flex items-center gap-2 text-sm">
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">{k.kind}</span>
              <Link href="/knowledge" className="truncate hover:underline">{k.title}</Link>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  )
}

function GettingStarted() {
  const { user } = useAuth()
  const { data: projects } = useProjects()
  const { data: keys } = useApiKeys(user?.id)
  const { data: workflows } = useWorkflows()
  const steps = [
    { done: !!(keys && (keys.anthropic || keys.openai || keys.groq)), label: "Add an LLM API key", hint: "Without one, engineers run in simulated mode.", href: "/settings?tab=models", icon: Key },
    { done: (workflows ?? []).length > 0, label: "Pick a workflow", hint: "Start from the spec-driven template.", href: "/workflows", icon: GitBranch },
    { done: (projects ?? []).length > 0, label: "Create a project", hint: "Upload a PRD or import GitHub issues.", href: "/projects?new=1", icon: Plus },
  ]
  if (steps.every((s) => s.done)) return null
  return (
    <section className="surface mb-6 overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-glow px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Get set up</h2>
        <span className="ml-auto text-xs text-muted-foreground">{steps.filter((s) => s.done).length}/{steps.length} done</span>
      </div>
      <ol className="grid gap-px bg-border sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.label} className="bg-card">
            <Link href={s.href} className="flex h-full items-start gap-3 p-4 transition-colors hover:bg-accent/60">
              <span className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                s.done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground",
              )}>
                {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div>
                <p className={cn("text-sm font-medium", s.done && "text-muted-foreground line-through")}>{s.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

const RENDER: Record<WidgetId, { node: () => React.ReactNode; wide?: boolean }> = {
  metrics: { node: () => <WorkspaceMetrics />, wide: true },
  attention: { node: () => <AttentionWidget /> },
  projects: { node: () => <ProjectsWidget /> },
  pipeline: { node: () => <PipelineWidget /> },
  knowledge: { node: () => <KnowledgeWidget /> },
}

export default function HomePage() {
  const { user } = useAuth()
  const { prefs, update } = usePreferences()
  const [customizing, setCustomizing] = useState(false)
  const visible = prefs.home.widgets.filter((id): id is WidgetId => id in RENDER)

  function setWidgets(widgets: string[]) {
    update({ home: { widgets } })
  }
  function move(id: WidgetId, delta: number) {
    const list = [...visible]
    const i = list.indexOf(id)
    const j = i + delta
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    setWidgets(list)
  }

  return (
    <Page wide>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()},</p>
          <h1 className="text-2xl font-semibold tracking-tight">{user?.name?.split(" ")[0] ?? "there"}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setCustomizing((v) => !v)}>
            <LayoutGrid className="h-3.5 w-3.5" /> {customizing ? "Done" : "Customize"}
          </Button>
          <Link href="/board"><Button variant="outline" size="sm"><Kanban className="h-3.5 w-3.5" /> Board</Button></Link>
          <Link href="/projects?new=1"><Button size="sm"><Plus className="h-3.5 w-3.5" /> New project</Button></Link>
        </div>
      </div>

      <GettingStarted />

      {customizing && (
        <section className="surface mb-6 p-4 animate-slide-in">
          <div className="mb-3 flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Dashboard widgets</h2>
            <button className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setWidgets(HOME_WIDGETS.map((w) => w.id))}>Reset</button>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {HOME_WIDGETS.map((w) => {
              const on = visible.includes(w.id)
              const idx = visible.indexOf(w.id)
              return (
                <li key={w.id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", !on && "opacity-60")}>
                  <button
                    onClick={() => setWidgets(on ? visible.filter((v) => v !== w.id) : [...visible, w.id])}
                    aria-label={on ? `Hide ${w.label}` : `Show ${w.label}`}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {on ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <span className="flex-1 truncate">{w.label}</span>
                  {on && (
                    <>
                      <button disabled={idx === 0} onClick={() => move(w.id, -1)} aria-label={`Move ${w.label} up`}
                        className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button disabled={idx === visible.length - 1} onClick={() => move(w.id, 1)} aria-label={`Move ${w.label} down`}
                        className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map((id) => (
          <div key={id} className={cn(RENDER[id].wide && "lg:col-span-2")}>{RENDER[id].node()}</div>
        ))}
      </div>
    </Page>
  )
}
