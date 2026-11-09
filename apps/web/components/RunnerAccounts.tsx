"use client"

import { KeyRound, Laptop } from "lucide-react"
import { useRunnerAccounts } from "@/hooks/useBoard"
import { formatTokens } from "@/hooks/useTokens"
import { formatDuration } from "@/lib/agentTime"
import { cn } from "@/lib/utils"

/**
 * Local runners grouped by the AI account their CLI is signed in to
 * (`gravel work --account <label>`), with what each account did this week.
 * Usage through a subscription is recorded at $0, so this shows runs, time
 * and tokens rather than cost.
 */
export default function RunnerAccounts() {
  const { data } = useRunnerAccounts()
  const accounts = data ?? []
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">AI accounts</h2>
        <span className="text-xs text-muted-foreground">local runners by the account they use · last 7 days</span>
      </div>
      {accounts.length === 0 ? (
        <div className="surface p-4 text-sm text-muted-foreground">
          No local runners yet. Start one with your own Claude or ChatGPT plan:{" "}
          <code className="rounded bg-muted px-1 text-xs">gravel work --executor claude-code --account work</code>.
          One runner per account; see <span className="font-medium text-foreground">docs/local-runners.md</span>.
        </div>
      ) : (
        <div className="surface divide-y overflow-hidden">
          {accounts.map((a) => {
            const online = a.runners.filter((r) => r.online).length
            return (
              <div key={`${a.owner_id}:${a.account ?? ""}`} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className={cn("h-2 w-2 rounded-full", online ? "bg-success" : "bg-muted-foreground/40")} />
                    {a.account ? <span className="font-mono">{a.account}</span> : <span className="text-muted-foreground">No account label</span>}
                    <span className="text-xs font-normal text-muted-foreground">· {a.owner_name}</span>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {a.runners.length === 0 ? (
                      <span>No runner started</span>
                    ) : a.runners.map((r, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        <Laptop className="h-3 w-3" /> {r.host_label ?? "a machine"} · {r.executor ?? "AI CLI"}
                        {r.scope === "org" && " · team"}{!r.online && " · offline"}
                      </span>
                    ))}
                  </p>
                  {a.pinned_projects.length > 0 && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      Pinned: {a.pinned_projects.join(", ")}
                    </p>
                  )}
                </div>
                <dl className="flex gap-5 text-right text-xs">
                  <div><dt className="text-muted-foreground">Runs</dt><dd className="text-sm font-semibold tabular-nums">{a.runs_week}</dd></div>
                  <div><dt className="text-muted-foreground">Time</dt><dd className="text-sm font-semibold tabular-nums">{formatDuration(a.agent_seconds_week)}</dd></div>
                  <div><dt className="text-muted-foreground">Tokens</dt><dd className="text-sm font-semibold tabular-nums">{formatTokens(a.tokens_week)}</dd></div>
                </dl>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
