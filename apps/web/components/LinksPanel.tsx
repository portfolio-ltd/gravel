"use client"

import { useState } from "react"
import {
  BookOpen, ExternalLink, Figma, Gauge, GitBranch, Link2, Loader2, Plus, ScrollText, Ticket, Trash2, X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input, Select } from "@/components/ui/form"
import { useCreateLink, useDeleteLink, useLinks, useUpdateLink } from "@/hooks/useLinks"
import { cn } from "@/lib/utils"
import type { ExternalLinkItem, LinkEntityType, LinkKind } from "@/types"

export const LINK_KINDS: { key: LinkKind; label: string; icon: React.ReactNode }[] = [
  { key: "docs", label: "Docs", icon: <BookOpen className="h-3 w-3" /> },
  { key: "design", label: "Design", icon: <Figma className="h-3 w-3" /> },
  { key: "ticket", label: "Ticket", icon: <Ticket className="h-3 w-3" /> },
  { key: "dashboard", label: "Dashboard", icon: <Gauge className="h-3 w-3" /> },
  { key: "repo", label: "Repository", icon: <GitBranch className="h-3 w-3" /> },
  { key: "spec", label: "Spec", icon: <ScrollText className="h-3 w-3" /> },
  { key: "other", label: "Other", icon: <Link2 className="h-3 w-3" /> },
]
const KIND = Object.fromEntries(LINK_KINDS.map((k) => [k.key, k])) as Record<LinkKind, (typeof LINK_KINDS)[number]>

function host(url: string): string {
  try { return new URL(url).host } catch { return url }
}

function guessKind(url: string): LinkKind {
  const u = url.toLowerCase()
  if (/figma|sketch|zeplin|dribbble/.test(u)) return "design"
  if (/jira|linear\.app|atlassian|youtrack|asana|trello|\/issues\//.test(u)) return "ticket"
  if (/grafana|datadog|newrelic|kibana|metabase|looker|sentry/.test(u)) return "dashboard"
  if (/github\.com|gitlab\.com|bitbucket/.test(u)) return "repo"
  if (/swagger|openapi|rfc|\/api\//.test(u)) return "spec"
  if (/notion|confluence|docs\.|readme|wiki/.test(u)) return "docs"
  return "other"
}

function LinkRow({ link, onDelete, editable }: { link: ExternalLinkItem; onDelete: () => void; editable: boolean }) {
  const update = useUpdateLink()
  return (
    <li className="group flex items-start gap-2 rounded-lg border bg-background px-2.5 py-2 text-xs">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {KIND[link.kind].icon}
      </span>
      <div className="min-w-0 flex-1">
        <a href={link.url} target="_blank" rel="noopener noreferrer nofollow"
          className="inline-flex max-w-full items-center gap-1 font-medium hover:text-primary hover:underline">
          <span className="truncate">{link.title}</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
        </a>
        <p className="truncate text-[11px] text-muted-foreground">{host(link.url)}{link.description ? ` · ${link.description}` : ""}</p>
      </div>
      {editable && (
        <>
          <Select value={link.kind} aria-label={`Kind of ${link.title}`} className="h-6 w-24 text-[11px]"
            onChange={(e) => update.mutate({ id: link.id, kind: e.target.value as LinkKind })}>
            {LINK_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </Select>
          <button onClick={onDelete} aria-label={`Remove link ${link.title}`}
            className="rounded p-1 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </li>
  )
}

/**
 * External links for one entity: designs, tickets, dashboards, specs. Engineer
 * runs receive the project's and the task's links as LINKS.md.
 */
export default function LinksPanel({ entityType, entityId, title = "Links", hint, editable = true, className }: {
  entityType: LinkEntityType
  entityId: string
  title?: string
  hint?: string
  editable?: boolean
  className?: string
}) {
  const { data: links, isLoading } = useLinks(entityType, entityId)
  const create = useCreateLink()
  const remove = useDeleteLink()
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState("")
  const [label, setLabel] = useState("")
  const [kind, setKind] = useState<LinkKind>("other")
  const [kindTouched, setKindTouched] = useState(false)

  function reset() {
    setAdding(false); setUrl(""); setLabel(""); setKind("other"); setKindTouched(false)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error("Enter a full http(s) URL")
      return
    }
    try {
      await create.mutateAsync({ entity_type: entityType, entity_id: entityId, url: trimmed, title: label.trim(), kind })
      reset()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the link")
    }
  }

  return (
    <section className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {editable && !adding && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" /> Add link
          </Button>
        )}
      </div>
      {hint && <p className="mb-2 text-[11px] text-muted-foreground">{hint}</p>}
      {isLoading ? (
        <div className="h-10 animate-pulse rounded-lg bg-muted/40" />
      ) : (links ?? []).length === 0 && !adding ? (
        <p className="text-xs text-muted-foreground">
          No links yet{editable ? " — add the design file, the ticket, the dashboard, anything an engineer should open." : "."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {(links ?? []).map((link) => (
            <LinkRow key={link.id} link={link} editable={editable}
              onDelete={() => remove.mutate(link.id, { onError: (err) => toast.error(err instanceof Error ? err.message : "Could not remove") })} />
          ))}
        </ul>
      )}
      {adding && (
        <form onSubmit={submit} className={cn("mt-2 grid gap-2 rounded-lg border bg-muted/20 p-2.5 sm:grid-cols-[1fr_1fr_110px_auto]")}>
          <Input value={url} autoFocus placeholder="https://…" aria-label="Link URL" className="h-8 text-xs"
            onChange={(e) => { setUrl(e.target.value); if (!kindTouched) setKind(guessKind(e.target.value)) }} />
          <Input value={label} placeholder="Title (optional)" aria-label="Link title" className="h-8 text-xs" onChange={(e) => setLabel(e.target.value)} />
          <Select value={kind} aria-label="Link kind" className="h-8 text-xs"
            onChange={(e) => { setKind(e.target.value as LinkKind); setKindTouched(true) }}>
            {LINK_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </Select>
          <div className="flex gap-1">
            <Button type="submit" size="sm" className="h-8" disabled={create.isPending || !url.trim()}>
              {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={reset} aria-label="Cancel"><X className="h-3.5 w-3.5" /></Button>
          </div>
        </form>
      )}
    </section>
  )
}
