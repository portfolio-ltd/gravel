"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle, XCircle, Clock, ExternalLink } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useAttentionTasks } from "@/hooks/useBoard"
import { useApproveRun, useRejectRun } from "@/hooks/useTaskRuns"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AttentionTask } from "@/types"

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  needs_human_input: { label: "Needs review",  color: "text-amber-700 bg-amber-100" },
  blocked:           { label: "Blocked",        color: "text-red-700 bg-red-100" },
}

function AttentionCard({ item }: { item: AttentionTask }) {
  const approve = useApproveRun()
  const reject = useRejectRun()
  const outcomeConfig = OUTCOME_LABELS[item.outcome] ?? { label: item.outcome, color: "text-muted-foreground bg-muted" }
  const age = formatDistanceToNow(new Date(item.blocked_since), { addSuffix: true })

  return (
    <div className="bg-background rounded-xl border shadow-sm p-4 hover:shadow-md transition-all">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-sm leading-snug">{item.task_title}</h3>
            <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", outcomeConfig.color)}>
              {outcomeConfig.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-1">
            <span className="font-medium text-foreground">{item.project_name}</span>
          </p>
          {item.blocking_reason && (
            <p className="text-xs text-muted-foreground bg-muted rounded px-2 py-1.5 mb-2">{item.blocking_reason}</p>
          )}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-3">
            <Clock className="w-3 h-3" />
            <span>Blocked {age}</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
              onClick={() => approve.mutate({ runId: item.run_id })}
              disabled={approve.isPending}
            >
              <CheckCircle className="w-3 h-3" /> Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs"
              onClick={() => reject.mutate({ runId: item.run_id })}
              disabled={reject.isPending}
            >
              <XCircle className="w-3 h-3" /> Reject
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AttentionPage() {
  const { data: tasks, isLoading } = useAttentionTasks()

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h1 className="text-xl font-bold">Attention Required</h1>
          {tasks && tasks.length > 0 && (
            <span className="min-w-[22px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center">
              {tasks.length}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : tasks && tasks.length > 0 ? (
          <div className="space-y-3">
            {tasks.map((item) => (
              <AttentionCard key={item.run_id} item={item} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="font-semibold mb-1">All clear</h2>
            <p className="text-sm text-muted-foreground">No tasks need your attention right now.</p>
          </div>
        )}
      </div>
    </div>
  )
}
