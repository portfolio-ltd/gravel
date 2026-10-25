"use client"

import Link from "next/link"
import { AlertTriangle, Bot, Coins, FolderKanban, ListChecks } from "lucide-react"
import { useWorkspaceMetrics } from "@/hooks/useBoard"
import { formatTokens } from "@/hooks/useTokens"
import { cn } from "@/lib/utils"

export default function WorkspaceMetrics() {
  const { data: m } = useWorkspaceMetrics()
  const cards = [
    { label: "Projects", value: String(m?.total_projects ?? 0), icon: FolderKanban, tone: "text-info bg-info/10" },
    { label: "Engineers running", value: String(m?.engineers_running ?? 0), icon: Bot, tone: "text-success bg-success/10" },
    { label: "Tasks", value: String(m?.total_tasks ?? 0), icon: ListChecks, tone: "text-primary bg-primary/10" },
    {
      label: "Waiting on you", value: String(m?.blocked_tasks ?? 0), icon: AlertTriangle, tone: "text-warning bg-warning/10",
      href: (m?.blocked_tasks ?? 0) > 0 ? "/attention" : undefined, pulse: (m?.blocked_tasks ?? 0) > 0,
    },
    {
      label: `LLM spend · ${formatTokens(m?.total_tokens ?? 0)} tokens`, value: `$${(m?.total_cost_usd ?? 0).toFixed(2)}`,
      icon: Coins, tone: "text-rose-600 bg-rose-500/10",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map(({ label, value, icon: Icon, tone, href, pulse }) => {
        const body = (
          <div className={cn("surface flex h-full items-center gap-3 p-3.5 transition-shadow", href && "hover:shadow-md")}>
            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tone)}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-semibold leading-none tabular-nums">{value}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
            </div>
            {pulse && <span className="ml-auto h-2 w-2 shrink-0 animate-pulse rounded-full bg-warning" />}
          </div>
        )
        return href ? <Link key={label} href={href}>{body}</Link> : <div key={label}>{body}</div>
      })}
    </div>
  )
}
