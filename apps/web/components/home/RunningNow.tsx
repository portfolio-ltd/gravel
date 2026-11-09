"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Activity, ArrowRight, Hourglass, WifiOff } from "lucide-react"
import { useRunningRuns } from "@/hooks/useBoard"
import EngineerAvatar from "@/components/EngineerAvatar"
import { formatDuration, runProgress, secondsSince, stageLabel } from "@/lib/agentTime"
import { cn } from "@/lib/utils"
import type { RunningRun } from "@/types"

/** Re-render every `ms` so elapsed timers tick between polls. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** One segment per pipeline stage: finished ones solid, the current one filled as far as history allows. */
function StageBar({ run, fraction }: { run: RunningRun; fraction: number | null }) {
  const count = run.stage_count ?? 1
  const index = run.stage_index ?? 1
  return (
    <div className="flex w-full gap-0.5" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const n = i + 1
        return (
          <div key={n} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            {n < index && <div className="h-full w-full bg-primary/70" />}
            {n === index && run.state === "running" && (
              fraction === null
                ? <div className="h-full w-full animate-pulse bg-primary/40" />
                : <div className="h-full bg-primary transition-[width] duration-1000" style={{ width: `${Math.max(6, fraction * 100)}%` }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function RunRow({ run, now, onOpen }: { run: RunningRun; now: number; onOpen: () => void }) {
  const running = run.state === "running" && run.started_at
  const elapsed = secondsSince(running ? run.started_at! : run.queued_at, now)
  const { stageFraction, overdue } = runProgress(elapsed, running ? run.typical_seconds : null)
  const quietFor = run.stale && run.last_heartbeat_at ? secondsSince(run.last_heartbeat_at, now) : null
  const step = run.stage_index && run.stage_count ? `Step ${run.stage_index} of ${run.stage_count}` : null

  let status: React.ReactNode
  if (!running) {
    status = (
      <span className="flex items-center justify-end gap-1" title={run.runner_account ? `Waiting for a runner signed in to '${run.runner_account}'` : undefined}>
        <Hourglass className="h-3 w-3" /> Queued {formatDuration(elapsed)}
      </span>
    )
  } else if (quietFor !== null) {
    status = <span className="flex items-center gap-1 text-warning"><WifiOff className="h-3 w-3" /> No heartbeat for {formatDuration(quietFor)}</span>
  } else if (run.typical_seconds) {
    status = (
      <span className={cn(overdue && "text-warning")}>
        {overdue ? "Longer than usual" : `Usually ~${formatDuration(run.typical_seconds)}`}
      </span>
    )
  } else {
    status = <span>First runs of this step</span>
  }

  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60">
        <EngineerAvatar id={run.engineer_id} name={run.engineer_name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{run.task_title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[run.engineer_name ?? (run.runner_account ? `Waiting for a ${run.runner_account} runner` : "Waiting for an engineer"), step && `${step} · ${stageLabel(run.stage_name)}`, run.project_name,
              run.attempt_number > 1 && `attempt ${run.attempt_number}`,
              run.engineer_name && run.runner_account && `${run.runner_account} account`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="w-28 shrink-0 space-y-1.5 text-right sm:w-40">
          <div className="flex items-baseline justify-end gap-1 text-xs">
            {running && <span className="font-semibold tabular-nums text-foreground">{formatDuration(elapsed)}</span>}
            {running && <span className="text-muted-foreground">running</span>}
          </div>
          <StageBar run={run} fraction={stageFraction} />
          <div className="truncate text-[11px] text-muted-foreground">{status}</div>
        </div>
      </button>
    </li>
  )
}

export default function RunningNow({ onOpenTask }: { onOpenTask: (projectId: string, taskId: string) => void }) {
  const { data, isLoading } = useRunningRuns()
  const now = useNow()
  const runs = data ?? []
  return (
    <section className="surface flex flex-col">
      <header className="flex items-center gap-2 px-4 py-3">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Running now</h2>
        {runs.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums">{runs.length}</span>
        )}
        <Link href="/board" className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          View board <ArrowRight className="h-3 w-3" />
        </Link>
      </header>
      {isLoading ? null : runs.length === 0 ? (
        <p className="border-t px-4 py-4 text-sm text-muted-foreground">
          No engineer is working right now. Start a project run from the board to see it here.
        </p>
      ) : (
        <ul className="divide-y border-t">
          {runs.slice(0, 8).map((r) => <RunRow key={r.run_id} run={r} now={now} onOpen={() => onOpenTask(r.project_id, r.task_id)} />)}
        </ul>
      )}
    </section>
  )
}
