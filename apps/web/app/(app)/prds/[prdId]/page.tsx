"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, Trash2, ListPlus, Pencil, Check } from "lucide-react"
import { usePRD, useUpdatePRD, useDeletePRD } from "@/hooks/usePRDs"
import { useSetPRDTags } from "@/hooks/useTags"
import { usePRDTokenSummary, formatTokens } from "@/hooks/useTokens"
import PRDChatPanel from "@/components/PRDChatPanel"
import PRDConvertDialog from "@/components/PRDConvertDialog"
import TagPicker from "@/components/TagPicker"
import { Button } from "@/components/ui/button"
import DictationButton from "@/components/ui/dictation-button"
import { appendTranscript } from "@/lib/dictation"
import { toast } from "sonner"
import type { PRDStatus } from "@/types"

const STATUSES: PRDStatus[] = ["draft", "in_review", "approved", "converted", "archived"]

export default function PRDDetailPage({ params }: { params: Promise<{ prdId: string }> }) {
  const { prdId } = use(params)
  const router = useRouter()
  const { data: prd, isLoading } = usePRD(prdId)
  const updatePRD = useUpdatePRD()
  const deletePRD = useDeletePRD()
  const setPRDTags = useSetPRDTags()
  const { data: tokens } = usePRDTokenSummary(prdId)
  const [editing, setEditing] = useState(false)
  const [draftBody, setDraftBody] = useState("")

  useEffect(() => {
    if (prd && !editing) setDraftBody(prd.body_markdown)
  }, [prd, editing])

  const [showConvert, setShowConvert] = useState(false)

  if (isLoading || !prd) {
    return <div className="p-6 text-sm text-muted-foreground">Loading PRD…</div>
  }

  async function saveBody() {
    try {
      await updatePRD.mutateAsync({ id: prdId, body_markdown: draftBody })
      setEditing(false)
      toast.success("Saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete PRD "${prd!.title}"?`)) return
    try {
      await deletePRD.mutateAsync(prdId)
      router.push("/prds")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed")
    }
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary shrink-0" />
            <h1 className="text-xl font-bold truncate">{prd.title}</h1>
            <select
              value={prd.status}
              onChange={(e) => updatePRD.mutate({ id: prdId, status: e.target.value as PRDStatus })}
              className="text-xs px-2 py-1 rounded-lg border bg-background"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
          <button onClick={() => router.push("/prds")} className="text-xs text-muted-foreground hover:text-foreground">
            ← Back to PRDs
          </button>
          <div className="mt-2">
            <TagPicker
              selected={prd.tags}
              onChange={(tagIds) => setPRDTags.mutate({ prdId, tagIds })}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tokens && tokens.calls > 0 && (
            <span className="text-[10px] text-muted-foreground hidden sm:block">
              {formatTokens(tokens.tokens_in + tokens.tokens_out)} tok · ${tokens.cost_usd.toFixed(2)}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowConvert(true)} disabled={prd.status === "converted"}>
            <ListPlus className="w-3.5 h-3.5" /> Convert to tasks
          </Button>
          <button onClick={handleDelete} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        {/* Body */}
        <div className="flex flex-col border rounded-xl bg-background overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold">Body</h2>
            {editing ? (
              <div className="flex items-center gap-2">
                <DictationButton size="sm" onText={(t) => setDraftBody((v) => appendTranscript(v, t))} />
                <Button size="sm" className="h-7 text-xs" onClick={saveBody} disabled={updatePRD.isPending}>
                  <Check className="w-3 h-3" /> Save
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(true)}>
                <Pencil className="w-3 h-3" /> Edit
              </Button>
            )}
          </div>
          {editing ? (
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              className="flex-1 p-4 text-sm font-mono resize-none focus:outline-none bg-background"
            />
          ) : (
            <div className="flex-1 p-4 overflow-y-auto">
              <pre className="text-sm whitespace-pre-wrap font-sans">{prd.body_markdown || "Empty — use Edit or ask the AI chat to draft it."}</pre>
            </div>
          )}
        </div>

        {/* Chat */}
        <PRDChatPanel prd={prd} />
      </div>

      {showConvert && <PRDConvertDialog prd={prd} onClose={() => setShowConvert(false)} />}
    </div>
  )
}
