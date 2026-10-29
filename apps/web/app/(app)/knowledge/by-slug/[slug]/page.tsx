"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { FileQuestion, Loader2, Plus } from "lucide-react"
import EntryEditor, { type EditorState } from "@/components/knowledge/EntryEditor"
import { Button } from "@/components/ui/button"
import { EmptyState, Page } from "@/components/ui/page"
import { apiFetch } from "@/lib/api"
import type { KnowledgeEntry } from "@/types"

/** [[wikilink]] target: resolves by slug or title and jumps to the entry, or offers to create it. */
export default function KnowledgeBySlugPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  // Next decodes route params already; a literal "%" in a title must not be decoded twice
  const target = safeDecode(slug)
  const [missing, setMissing] = useState(false)
  const [editor, setEditor] = useState<EditorState | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch<KnowledgeEntry>(`/api/knowledge/by-slug/${encodeURIComponent(target)}`)
      .then((entry) => { if (!cancelled) router.replace(`/knowledge/${entry.id}`) })
      .catch(() => { if (!cancelled) setMissing(true) })
    return () => { cancelled = true }
  }, [target, router])

  if (!missing) {
    return (
      <Page>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Looking up [[{target}]]…</div>
      </Page>
    )
  }
  return (
    <Page>
      <EmptyState
        icon={<FileQuestion className="h-5 w-5" />}
        title={`No page called “${target}” yet`}
        description="Something links here, but no knowledge entry has this title or slug. Create it now, or fix the link where it was written."
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setEditor({ entry: null, acceptOnSave: false, kind: "wiki", title: target })}>
              <Plus className="h-3.5 w-3.5" /> Create “{target}”
            </Button>
            <Link href="/map" className="inline-flex items-center rounded-lg border px-3 text-sm hover:bg-muted">Open the map</Link>
          </div>
        }
      />
      {editor && <EntryEditor state={editor} onClose={() => setEditor(null)} onSaved={(e) => router.replace(`/knowledge/${e.id}`)} />}
    </Page>
  )
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
