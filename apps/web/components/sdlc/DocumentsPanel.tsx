"use client"

import { useMemo, useState } from "react"
import { FileText, History, Pencil, Sparkles, UserRound } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import type { DocumentKind, TaskDocument } from "@/types"
import { useDocumentHistory, useSaveDocument, useTaskDocuments } from "@/hooks/useSdlc"
import { errorDetail } from "@/hooks/useTaskExtras"
import Markdown, { Gherkin } from "@/components/Markdown"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/form"
import { EmptyState } from "@/components/ui/page"
import { cn } from "@/lib/utils"
import { DOC_LABELS, DOC_ORDER } from "./meta"

function DocBody({ doc }: { doc: TaskDocument }) {
  return doc.kind === "scenarios" ? <Gherkin source={doc.body_markdown} /> : <Markdown>{doc.body_markdown}</Markdown>
}

function DocumentCard({ taskId, latest, versions }: { taskId: string; latest: TaskDocument; versions: TaskDocument[] }) {
  const save = useSaveDocument(taskId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(latest.body_markdown)
  const [showHistory, setShowHistory] = useState(false)
  const [viewing, setViewing] = useState<TaskDocument | null>(null)
  const shown = viewing ?? latest

  function onSave() {
    save.mutate({ kind: latest.kind, title: latest.title, body_markdown: draft }, {
      onSuccess: () => { setEditing(false); setViewing(null); toast.success(`Saved as version ${latest.version + 1}`) },
      onError: (e) => toast.error(errorDetail(e, "Could not save document")),
    })
  }

  return (
    <article className="surface overflow-hidden" id={`doc-${latest.kind}`}>
      <header className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
        <FileText className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{DOC_LABELS[latest.kind]}</h3>
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">v{shown.version}</span>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          {shown.author_type === "ai" ? <Sparkles className="h-3 w-3 text-primary" /> : <UserRound className="h-3 w-3" />}
          {shown.author_type === "ai" ? "AI" : "Edited by a person"} · {formatDistanceToNow(new Date(shown.created_at), { addSuffix: true })}
        </span>
        <div className="ml-auto flex gap-1">
          {versions.length > 1 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" aria-expanded={showHistory}
              onClick={() => setShowHistory((v) => !v)}>
              <History className="h-3.5 w-3.5" /> {versions.length} versions
            </Button>
          )}
          {!editing && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setDraft(shown.body_markdown); setEditing(true) }}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>
      </header>

      {showHistory && (
        <ul className="flex flex-wrap gap-1.5 border-b px-4 py-2">
          {versions.map((v) => (
            <li key={v.id}>
              <button
                onClick={() => setViewing(v.id === latest.id ? null : v)}
                className={cn("rounded-md border px-2 py-1 text-[11px] transition-colors",
                  shown.id === v.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}
              >
                v{v.version} · {v.author_type === "ai" ? "AI" : "human"} · {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="px-4 py-3">
        {viewing && !editing && (
          <p className="mb-2 rounded-md bg-info/10 px-2 py-1 text-[11px] text-info">
            Viewing an older version. Edit to restore it as a new version.
          </p>
        )}
        {editing ? (
          <div className="space-y-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[280px] font-mono text-xs"
              aria-label={`Edit ${DOC_LABELS[latest.kind]}`} />
            <div className="flex gap-2">
              <Button size="sm" onClick={onSave} disabled={save.isPending || draft === latest.body_markdown}>Save new version</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Later stages read the newest version, so your edit becomes what the engineer works from.
            </p>
          </div>
        ) : (
          <DocBody doc={shown} />
        )}
      </div>
    </article>
  )
}

export default function DocumentsPanel({ taskId }: { taskId: string }) {
  const { data: latest, isLoading } = useTaskDocuments(taskId)
  const hasDocs = (latest ?? []).length > 0
  const { data: history } = useDocumentHistory(taskId, hasDocs)

  const byKind = useMemo(() => {
    const map = new Map<DocumentKind, TaskDocument>()
    for (const d of latest ?? []) map.set(d.kind, d)
    return map
  }, [latest])

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading documents…</p>
  if (!hasDocs) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title="No documents yet"
        description="As the task moves through its workflow, each stage writes here: the analysis, refined spec, technical plan, acceptance scenarios, review and verification."
      />
    )
  }

  const present = DOC_ORDER.filter((k) => byKind.has(k))
  return (
    <div className="space-y-4">
      {present.length > 1 && (
        <nav className="flex flex-wrap gap-1.5" aria-label="Jump to document">
          {present.map((k) => (
            <a key={k} href={`#doc-${k}`} className="rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              {DOC_LABELS[k]}
            </a>
          ))}
        </nav>
      )}
      {present.map((kind) => (
        <DocumentCard
          key={`${kind}-${byKind.get(kind)!.id}`}
          taskId={taskId}
          latest={byKind.get(kind)!}
          versions={(history ?? []).filter((d) => d.kind === kind)}
        />
      ))}
    </div>
  )
}
