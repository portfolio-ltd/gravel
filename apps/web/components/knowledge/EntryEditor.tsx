"use client"

import { useMemo, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useCreateKnowledge, useKnowledge, useUpdateKnowledge } from "@/hooks/useSdlc"
import { useProjects } from "@/hooks/useProjects"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/form"
import Markdown from "@/components/Markdown"
import { parseWikilinks } from "@/lib/wikilinks"
import type { KnowledgeEntry, KnowledgeKind, KnowledgeStatus } from "@/types"
import { BookA, LifeBuoy, ListChecks, Puzzle, Scale, StickyNote } from "lucide-react"

export const KINDS: { key: KnowledgeKind; label: string; singular: string; icon: React.ReactNode; hint: string }[] = [
  { key: "decision", label: "Decisions", singular: "Decision", icon: <Scale className="h-3.5 w-3.5" />,
    hint: "Architecture decision records: what was decided, why, and what it rules out." },
  { key: "pattern", label: "Patterns", singular: "Pattern", icon: <Puzzle className="h-3.5 w-3.5" />,
    hint: "Reusable implementation idioms engineers should follow." },
  { key: "glossary", label: "Glossary", singular: "Glossary term", icon: <BookA className="h-3.5 w-3.5" />,
    hint: "Domain terms and their exact meaning." },
  { key: "runbook", label: "Runbooks", singular: "Runbook", icon: <LifeBuoy className="h-3.5 w-3.5" />,
    hint: "Operational procedures: deploys, incidents, backfills." },
  { key: "convention", label: "Conventions", singular: "Convention", icon: <ListChecks className="h-3.5 w-3.5" />,
    hint: "Coding, repository and review conventions." },
  { key: "wiki", label: "Wiki", singular: "Wiki page", icon: <StickyNote className="h-3.5 w-3.5" />,
    hint: "Free-form pages — overviews, how-things-fit-together, onboarding. Link entries with [[double brackets]]." },
]
export const KIND_BY_KEY = Object.fromEntries(KINDS.map((k) => [k.key, k])) as Record<KnowledgeKind, (typeof KINDS)[number]>

export const KIND_STYLE: Record<KnowledgeKind, string> = {
  decision: "bg-violet-100 text-violet-700",
  pattern: "bg-sky-100 text-sky-700",
  glossary: "bg-amber-100 text-amber-700",
  runbook: "bg-rose-100 text-rose-700",
  convention: "bg-emerald-100 text-emerald-700",
  wiki: "bg-slate-100 text-slate-700",
}

export interface EditorState {
  entry: KnowledgeEntry | null
  acceptOnSave: boolean
  kind: KnowledgeKind
  /** Prefill for a new entry (e.g. created from an unresolved [[link]]) */
  title?: string
  parentId?: string | null
}

export default function EntryEditor({ state, onClose, onSaved }: {
  state: EditorState
  onClose: () => void
  onSaved?: (entry: KnowledgeEntry) => void
}) {
  const { entry, acceptOnSave } = state
  const { data: projects } = useProjects()
  const { data: all } = useKnowledge()
  const create = useCreateKnowledge()
  const update = useUpdateKnowledge()
  const [kind, setKind] = useState<KnowledgeKind>(entry?.kind ?? state.kind)
  const [title, setTitle] = useState(entry?.title ?? state.title ?? "")
  const [body, setBody] = useState(entry?.body_markdown ?? "")
  const [projectId, setProjectId] = useState<string>(entry?.project_id ?? "")
  const [parentId, setParentId] = useState<string>(entry?.parent_id ?? state.parentId ?? "")
  const [mode, setMode] = useState<"write" | "preview">("write")
  const pending = create.isPending || update.isPending

  const parents = useMemo(() => (all ?? []).filter((e) => e.id !== entry?.id && e.status !== "rejected"), [all, entry])
  const linkStatus = useMemo(() => {
    const targets = parseWikilinks(body)
    if (!targets.length || !all) return null
    const known = new Set(all.flatMap((e) => [e.title.trim().toLowerCase(), (e.slug ?? "").toLowerCase()]))
    const missing = targets.filter((t) => !known.has(t.trim().toLowerCase()) && !known.has(t.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")))
    return { total: targets.length, missing }
  }, [body, all])

  async function save() {
    try {
      let saved: KnowledgeEntry
      if (entry) {
        saved = await update.mutateAsync({
          id: entry.id, title: title.trim(), body_markdown: body, project_id: projectId || null, parent_id: parentId || null,
          ...(acceptOnSave ? { status: "accepted" as KnowledgeStatus } : {}),
        })
        toast.success(acceptOnSave ? "Accepted into the knowledge base" : "Saved")
      } else {
        saved = await create.mutateAsync({
          kind, title: title.trim(), body_markdown: body, project_id: projectId || null, parent_id: parentId || null,
        })
        toast.success("Added to the knowledge base")
      }
      onSaved?.(saved)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save")
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{entry ? (acceptOnSave ? "Review & accept" : `Edit ${entry.label}`) : "New knowledge entry"}</DialogTitle>
          <DialogDescription>
            Accepted entries are given to every engineer run in scope, so keep them precise and current.
            Link to other entries with <code className="rounded bg-muted px-1">[[Title]]</code> or <code className="rounded bg-muted px-1">[[slug|shown text]]</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind" hint={KIND_BY_KEY[kind].hint}>
              <Select value={kind} onChange={(e) => setKind(e.target.value as KnowledgeKind)} disabled={!!entry}>
                {KINDS.map((k) => <option key={k.key} value={k.key}>{k.singular}</option>)}
              </Select>
            </Field>
            <Field label="Applies to">
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Every project in this organization</option>
                {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={
                kind === "decision" ? "Use Postgres for all transactional data"
                  : kind === "glossary" ? "Invoice" : kind === "wiki" ? "Billing overview" : "Short, searchable title"
              } autoFocus />
            </Field>
            <Field label="Sits under" hint={entry?.slug ? `Slug: ${entry.slug}` : undefined}>
              <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">No parent (top level)</option>
                {parents.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
            </Field>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/80">Body (markdown)</span>
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={[{ value: "write", label: "Write" }, { value: "preview", label: "Preview" }]}
              />
            </div>
            {mode === "write" ? (
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="font-mono text-xs"
                placeholder={kind === "decision"
                  ? "## Context\n\n## Decision\n\n## Consequences"
                  : kind === "wiki" ? "Explain how this area fits together. Link related entries: [[Invoice]], [[Stream large exports]]."
                    : "Describe it so an engineer who has never seen the code can apply it."}
              />
            ) : (
              <div className="min-h-[220px] rounded-lg border bg-muted/20 p-3">
                {body.trim() ? <Markdown>{body}</Markdown> : <p className="text-xs text-muted-foreground">Nothing to preview.</p>}
              </div>
            )}
            {linkStatus && (
              <p className="text-[11px] text-muted-foreground">
                {linkStatus.total} wikilink{linkStatus.total === 1 ? "" : "s"}
                {linkStatus.missing.length > 0 && (
                  <> · <span className="text-warning">{linkStatus.missing.length} unresolved: {linkStatus.missing.map((m) => `[[${m}]]`).join(", ")}</span> — they'll show on the map until the pages exist.</>
                )}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={!title.trim() || pending}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {acceptOnSave ? <><Check className="h-3.5 w-3.5" /> Save & accept</> : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
