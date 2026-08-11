"use client"

import { FolderKanban, Bot, ListChecks, AlertTriangle, Coins } from "lucide-react"
import Link from "next/link"
import { useWorkspaceMetrics } from "@/hooks/useBoard"
import { formatTokens } from "@/hooks/useTokens"
import { cn } from "@/lib/utils"

const CARDS = [
  {
    key: "total_projects" as const,
    label: "Projects",
    icon: FolderKanban,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    key: "engineers_running" as const,
    label: "Running",
    icon: Bot,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    key: "total_tasks" as const,
    label: "Tasks",
    icon: ListChecks,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    key: "blocked_tasks" as const,
    label: "Blocked",
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-50",
    href: "/attention",
  },
]

export default function WorkspaceMetrics() {
  const { data: metrics } = useWorkspaceMetrics()

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
      {CARDS.map(({ key, label, icon: Icon, color, bg, href }) => {
        const value = metrics?.[key] ?? 0
        const card = (
          <div
            key={key}
            className={cn(
              "rounded-xl border p-3 flex items-center gap-3 transition-all",
              href && value > 0 ? "hover:shadow-md cursor-pointer" : ""
            )}
          >
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", bg)}>
              <Icon className={cn("w-4.5 h-4.5", color)} />
            </div>
            <div>
              <p className="text-xl font-bold leading-none">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
            {key === "blocked_tasks" && value > 0 && (
              <span className="ml-auto w-2 h-2 rounded-full bg-destructive animate-pulse" />
            )}
          </div>
        )
        return href && value > 0 ? <Link key={key} href={href}>{card}</Link> : <div key={key}>{card}</div>
      })}

      {/* LLM spend */}
      <div className="rounded-xl border p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-rose-50">
          <Coins className="w-4.5 h-4.5 text-rose-600" />
        </div>
        <div>
          <p className="text-xl font-bold leading-none">
            ${(metrics?.total_cost_usd ?? 0).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            LLM spend · {formatTokens(metrics?.total_tokens ?? 0)} tok
          </p>
        </div>
      </div>
    </div>
  )
}
