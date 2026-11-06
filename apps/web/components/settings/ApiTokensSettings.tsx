"use client"

import { useState } from "react"
import { Check, Copy, KeyRound, Loader2, Terminal, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Field, Input, Select } from "@/components/ui/form"
import { EmptyState, SectionCard } from "@/components/ui/page"
import { useApiTokens, useCreateApiToken, useRevokeApiToken } from "@/hooks/useApiTokens"
import { formatRelativeTime } from "@/lib/utils"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button type="button" aria-label={label}
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

/** Personal API tokens for the gravel CLI and editor extensions, plus how to run tasks on your own machine. */
export default function ApiTokensSettings() {
  const { data: tokens = [], isLoading } = useApiTokens()
  const create = useCreateApiToken()
  const revoke = useRevokeApiToken()
  const [name, setName] = useState("")
  const [expiry, setExpiry] = useState("")
  const [fresh, setFresh] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      const created = await create.mutateAsync({ name: name.trim(), expires_in_days: expiry ? Number(expiry) : null })
      setFresh(created.token)
      setName("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the token")
    }
  }

  async function handleRevoke(id: string, tokenName: string) {
    if (!confirm(`Revoke "${tokenName}"? Anything using it stops working.`)) return
    try {
      await revoke.mutateAsync(id)
      toast.success("Token revoked")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke the token")
    }
  }

  const loginCmd = `gravel login --server ${API_URL}`
  return (
    <div className="space-y-4">
      <SectionCard
        title={<span className="inline-flex items-center gap-2"><Terminal className="h-4 w-4 text-muted-foreground" /> Run tasks on your machine</span>}
        description="Use your own Claude Code or Codex sign-in instead of an API key: the gravel CLI picks up runs and executes them locally."
      >
        <ol className="list-decimal space-y-2 pl-5 text-xs">
          <li>Install the CLI: <code className="rounded bg-muted px-1 py-0.5 font-mono">pip install &quot;git+https://github.com/portfolio-ltd/gravel#subdirectory=apps/runtime&quot;</code></li>
          <li>
            <span className="inline-flex flex-wrap items-center gap-1">Sign in (opens this site to approve): <code className="rounded bg-muted px-1 py-0.5 font-mono">{loginCmd}</code><CopyButton text={loginCmd} label="Copy login command" /></span>
          </li>
          <li>Start the runner with the AI CLI you&apos;re signed in to: <code className="rounded bg-muted px-1 py-0.5 font-mono">gravel work --executor claude-code</code> or <code className="rounded bg-muted px-1 py-0.5 font-mono">--executor codex</code></li>
        </ol>
        <p className="mt-3 text-[11px] text-muted-foreground">
          While it runs, your projects&apos; stages, PRD parsing and code-graph summaries go to it when you have no key for the model. It takes runs only from projects you own unless you pass <code className="font-mono">--team</code>.
        </p>
      </SectionCard>

      <SectionCard
        title={<span className="inline-flex items-center gap-2"><KeyRound className="h-4 w-4 text-muted-foreground" /> API tokens</span>}
        description="For the CLI, the VS Code extension and scripts. A token acts as you; revoke it if it leaks."
      >
        {fresh && (
          <div className="mb-4 rounded-lg border border-success/40 bg-success/5 p-3">
            <p className="mb-1.5 text-xs font-medium">Copy your new token now — it won&apos;t be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">{fresh}</code>
              <CopyButton text={fresh} label="Copy token" />
              <Button size="sm" variant="outline" onClick={() => setFresh(null)}>Done</Button>
            </div>
          </div>
        )}
        <form onSubmit={handleCreate} className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="Name" className="flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Work laptop" maxLength={200} />
          </Field>
          <Field label="Expires">
            <Select value={expiry} onChange={(e) => setExpiry(e.target.value)} aria-label="Token expiry">
              <option value="">Never</option>
              <option value="30">In 30 days</option>
              <option value="90">In 90 days</option>
              <option value="365">In a year</option>
            </Select>
          </Field>
          <Button type="submit" size="sm" className="h-9" disabled={!name.trim() || create.isPending}>
            {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create token
          </Button>
        </form>
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        ) : tokens.length === 0 ? (
          <EmptyState title="No tokens yet" description="Device logins from the CLI or VS Code appear here too." />
        ) : (
          <ul className="divide-y rounded-lg border">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-mono">{t.prefix}…</span> · created {formatRelativeTime(t.created_at)}
                    {" · "}{t.last_used_at ? `last used ${formatRelativeTime(t.last_used_at)}` : "never used"}
                    {t.expires_at && ` · expires ${new Date(t.expires_at).toLocaleDateString()}`}
                  </p>
                </div>
                <button onClick={() => handleRevoke(t.id, t.name)} aria-label={`Revoke ${t.name}`}
                  className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
