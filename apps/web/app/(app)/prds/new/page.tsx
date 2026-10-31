"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, Loader2 } from "lucide-react"
import { useCreatePRD } from "@/hooks/usePRDs"
import { Button } from "@/components/ui/button"
import DictationButton from "@/components/ui/dictation-button"
import { appendTranscript } from "@/lib/dictation"
import { toast } from "sonner"

export default function NewPRDPage() {
  const router = useRouter()
  const createPRD = useCreatePRD()
  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [body, setBody] = useState("")

  async function handleCreate() {
    try {
      const prd = await createPRD.mutateAsync({
        title: title.trim(),
        summary: summary.trim() || undefined,
        body_markdown: body,
      })
      toast.success("PRD created")
      router.push(`/prds/${prd.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create PRD")
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <FileText className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">New PRD</h1>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Payments v1"
              autoFocus
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Summary</label>
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One-line description"
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground block">Body (markdown)</label>
              <DictationButton size="sm" onText={(t) => setBody((v) => appendTranscript(v, t))} />
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              placeholder={"# Overview\n\n## Requirements\n\n## Out of scope"}
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/prds")}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={!title.trim() || createPRD.isPending}>
              {createPRD.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
