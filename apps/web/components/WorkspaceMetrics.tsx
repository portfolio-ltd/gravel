"use client"

import Link from "next/link"
import { CheckCheck, Clock, Coins, ShieldCheck } from "lucide-react"
import { formatDistanceToNowStrict } from "date-fns"
import { useWorkspaceMetrics } from "@/hooks/useBoard"
import { formatTokens } from "@/hooks/useTokens"
import { deltaLabel, formatDuration } from "@/lib/agentTime"
import { cn } from "@/lib/utils"

const money = (n: number) => `$${n.toFixed(2)}`

/**
 * The week in four numbers, each with a line of context underneath.
 * "Week" is the last 7 days; the comparison is with the 7 days before.
 */
export default function WorkspaceMetrics() {
  const { data: m } = useWorkspaceMetrics()
  const waiting = m?.blocked_tasks ?? 0
  const cards = [
    {
      label: "Waiting for you",
      value: String(waiting),
      note: waiting > 0 && m?.oldest_waiting_since
        ? `The oldest has waited ${formatDistanceToNowStrict(new Date(m.oldest_waiting_since))}`
        : "Nothing needs a decision",
      icon: ShieldCheck,
      href: waiting > 0 ? "/attention" : undefined,
      highlight: waiting > 0,
    },
    {
      label: "Stages finished this week",
      value: String(m?.stages_completed_week ?? 0),
      note: deltaLabel(m?.stages_completed_week ?? 0, m?.stages_completed_prev_week ?? 0),
      icon: CheckCheck,
    },
    {
      label: "Agent time this week",
      value: formatDuration(m?.agent_seconds_week ?? 0),
      note: deltaLabel(m?.agent_seconds_week ?? 0, m?.agent_seconds_prev_week ?? 0, formatDuration),
      icon: Clock,
    },
    {
      label: "LLM spend this week",
      value: money(m?.cost_usd_week ?? 0),
      note: `${money(m?.total_cost_usd ?? 0)} · ${formatTokens(m?.total_tokens ?? 0)} tokens all time`,
      icon: Coins,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, note, icon: Icon, href, highlight }) => {
        const body = (
          <div className={cn("surface flex h-full flex-col gap-3 p-4 transition-shadow", href && "hover:shadow-md")}>
            <div className="flex items-center gap-2.5">
              <span className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                highlight ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
              )}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="truncate text-sm text-muted-foreground">{label}</span>
              {highlight && <span className="ml-auto h-2 w-2 shrink-0 animate-pulse rounded-full bg-warning" />}
            </div>
            <p className="text-3xl font-semibold leading-none tracking-tight tabular-nums">{value}</p>
            <p className="truncate text-xs text-muted-foreground">{note}</p>
          </div>
        )
        return href ? <Link key={label} href={href}>{body}</Link> : <div key={label}>{body}</div>
      })}
    </div>
  )
}
