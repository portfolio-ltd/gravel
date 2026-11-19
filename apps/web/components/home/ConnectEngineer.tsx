"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, Copy, Laptop, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { usePreferences } from "@/contexts/PreferencesContext"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { Engineer } from "@/types"
import { useApiKeys } from "@/hooks/useUsers"
import { runnerCommands } from "@/lib/quickStart"
import { cn } from "@/lib/utils"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export function CommandList({ commands }: { commands: string[] }) {
  const [copied, setCopied] = useState<number | null>(null)
  return (
    <ol className="space-y-1.5">
      {commands.map((cmd, i) => (
        <li key={cmd} className="flex items-center gap-2">
          <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
          <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-[11px]" title={cmd}>{cmd}</code>
          <button type="button" aria-label={`Copy command ${i + 1}`}
            onClick={() => navigator.clipboard.writeText(cmd).then(() => { setCopied(i); setTimeout(() => setCopied(null), 1500) })}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            {copied === i ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </li>
      ))}
    </ol>
  )
}

/**
 * Says plainly who will do the work, and what to do when nobody can yet:
 * "run on my machine" with no runner online shows the three commands; no key and
 * no runner says that runs are simulated. Hidden once real work can happen.
 */
export default function ConnectEngineer({ className }: { className?: string }) {
  const { user } = useAuth()
  const { prefs } = usePreferences()
  const { data: keys } = useApiKeys(user?.id)
  // Poll while this panel is on screen, so it disappears the moment a runner comes online
  const { data: engineers, isLoading } = useQuery<Engineer[]>({
    queryKey: ["engineers"], queryFn: () => apiFetch("/api/engineers"), refetchInterval: 5000,
  })
  if (isLoading || !keys || !engineers) return null
  const online = engineers.some((e) => e.runtimes.some((r) => r.is_active && (r.kind !== "local" || r.online)))
  const hasKey = !!(keys.anthropic || keys.openai || keys.groq)
  if (online) return null

  if (prefs.runOn === "machine") {
    return (
      <section className={cn("surface p-4", className)} aria-label="Start your runner">
        <div className="mb-3 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <h2 className="text-sm font-semibold">Waiting for your machine</h2>
          <span className="text-xs text-muted-foreground">Queued work starts the moment your runner is online.</span>
        </div>
        <CommandList commands={runnerCommands(API_URL)} />
        <p className="mt-3 text-[11px] text-muted-foreground">
          Uses the Claude Code sign-in on your machine; add <code className="font-mono">--executor codex</code> for Codex.
          Prefer a key instead? <Link href="/settings?tab=models" className="font-medium text-primary hover:underline">Add one in Settings</Link>.
        </p>
      </section>
    )
  }
  if (hasKey) return null
  return (
    <section className={cn("surface flex flex-wrap items-center gap-x-3 gap-y-2 p-4 text-sm", className)} aria-label="Connect an engineer">
      <Laptop className="h-4 w-4 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <b className="font-semibold">Runs are simulated for now.</b>{" "}
        <span className="text-muted-foreground">For real work, run tasks on your machine with your Claude Code or Codex sign-in, or add an API key.</span>
      </span>
      <Link href="/settings?tab=cli" className="text-xs font-medium text-primary hover:underline">Use my machine</Link>
      <Link href="/settings?tab=models" className="text-xs font-medium text-primary hover:underline">Add an API key</Link>
    </section>
  )
}
