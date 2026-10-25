"use client"

import { useState } from "react"
import { Play, Square, ChevronDown, ChevronUp, MoreHorizontal, Edit2, Trash2, Bot, RotateCw } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { Engineer } from "@/types"
import { useLaunchEngineer, useStopEngineer, useDeleteEngineer, useStopRuntime, useRestartRuntime } from "@/hooks/useEngineers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown"
import { cn } from "@/lib/utils"

const STATUS_CONFIG = {
  idle:    { label: "Idle",    dot: "bg-slate-400",   badge: "bg-slate-100 text-slate-700" },
  running: { label: "Running", dot: "bg-emerald-500 animate-pulse", badge: "bg-emerald-100 text-emerald-700" },
  stopped: { label: "Stopped", dot: "bg-slate-400",   badge: "bg-slate-100 text-slate-700" },
  error:   { label: "Error",   dot: "bg-red-500 animate-ping",  badge: "bg-red-100 text-red-700" },
}

const TEMPLATE_COLORS: Record<string, string> = {
  frontend:  "bg-blue-50 text-blue-700 border-blue-200",
  backend:   "bg-purple-50 text-purple-700 border-purple-200",
  fullstack: "bg-indigo-50 text-indigo-700 border-indigo-200",
}

interface Props {
  engineer: Engineer
  onEdit: (eng: Engineer) => void
}

export default function EngineerCard({ engineer, onEdit }: Props) {
  const [showRuntimes, setShowRuntimes] = useState(false)
  const launch = useLaunchEngineer()
  const stop = useStopEngineer()
  const del = useDeleteEngineer()
  const stopRuntime = useStopRuntime()
  const restartRuntime = useRestartRuntime()
  const cfg = STATUS_CONFIG[engineer.status] ?? STATUS_CONFIG.idle

  const activeRuntime = engineer.runtimes.find((r) => r.is_active)
  const isStale = activeRuntime?.last_heartbeat_at
    ? Date.now() - new Date(activeRuntime.last_heartbeat_at).getTime() > 90_000
    : false

  return (
    <div className="bg-background rounded-xl border shadow-sm hover:shadow-md transition-all overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm leading-tight truncate">{engineer.name}</h3>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={cn("relative w-2 h-2 rounded-full", isStale ? "bg-red-500" : cfg.dot)} />
                <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", TEMPLATE_COLORS[engineer.template] ?? "bg-muted text-muted-foreground border-border")}>
                  {engineer.template}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono truncate">
                  {engineer.model_provider}/{engineer.model_name}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Badge className={cn("text-[10px]", cfg.badge)} variant="outline">{cfg.label}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(engineer)}>
                  <Edit2 className="w-4 h-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => del.mutate(engineer.id)} className="text-destructive">
                  <Trash2 className="w-4 h-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {engineer.skills_markdown && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{engineer.skills_markdown}</p>
        )}

        <div className="flex items-center gap-2">
          {engineer.status !== "running" ? (
            <Button
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={() => launch.mutate(engineer.id)}
              disabled={launch.isPending}
            >
              <Play className="w-3 h-3" /> Launch
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs flex-1"
              onClick={() => stop.mutate(engineer.id)}
              disabled={stop.isPending}
            >
              <Square className="w-3 h-3" /> Stop
            </Button>
          )}

          <button
            onClick={() => setShowRuntimes((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted"
          >
            {showRuntimes ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {engineer.runtimes.length} run{engineer.runtimes.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>

      {showRuntimes && engineer.runtimes.length > 0 && (
        <div className="border-t bg-muted/30 p-3 space-y-1.5">
          {engineer.runtimes.map((rt) => (
            <div key={rt.id} className="flex items-center gap-2 text-xs">
              <span className={cn("w-1.5 h-1.5 rounded-full", rt.is_active ? "bg-emerald-500" : "bg-slate-400")} />
              <span className="text-muted-foreground">
                {formatDistanceToNow(new Date(rt.started_at), { addSuffix: true })}
              </span>
              {rt.current_task_run_id && rt.is_active && (
                <span className="text-[10px] text-blue-600">working</span>
              )}
              {rt.is_active && rt.last_heartbeat_at && (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  ♥ {formatDistanceToNow(new Date(rt.last_heartbeat_at), { addSuffix: true })}
                </span>
              )}
              {rt.stopped_at && !rt.is_active && (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  Stopped {formatDistanceToNow(new Date(rt.stopped_at), { addSuffix: true })}
                </span>
              )}
              {rt.is_active ? (
                <button
                  title="Stop runtime"
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => stopRuntime.mutate(rt.id)}
                  disabled={stopRuntime.isPending}
                >
                  <Square className="w-3 h-3" />
                </button>
              ) : (
                <button
                  title="Restart runtime"
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => restartRuntime.mutate(rt.id)}
                  disabled={restartRuntime.isPending}
                >
                  <RotateCw className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
