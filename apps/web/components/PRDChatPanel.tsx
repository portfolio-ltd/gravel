"use client"

import { useEffect, useRef, useState } from "react"
import { Send, Loader2, Sparkles } from "lucide-react"
import { usePRDChat, useUpdatePRD } from "@/hooks/usePRDs"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import DictationButton from "@/components/ui/dictation-button"
import { appendTranscript } from "@/lib/dictation"
import { toast } from "sonner"
import type { PRD } from "@/types"

export default function PRDChatPanel({ prd }: { prd: PRD }) {
  const chat = usePRDChat()
  const updatePRD = useUpdatePRD()
  const [message, setMessage] = useState("")
  const [proposal, setProposal] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [prd.comments.length])

  async function handleSend() {
    const text = message.trim()
    if (!text || chat.isPending) return
    setMessage("")
    try {
      const res = await chat.mutateAsync({ prdId: prd.id, message: text })
      if (res.updated_body) setProposal(res.updated_body)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chat failed")
    }
  }

  async function applyProposal() {
    if (!proposal) return
    try {
      await updatePRD.mutateAsync({ id: prd.id, body_markdown: proposal })
      setProposal(null)
      toast.success("PRD body updated")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply changes")
    }
  }

  return (
    <div className="flex flex-col h-full border rounded-xl bg-background overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">AI chat</h2>
        <span className="text-[10px] text-muted-foreground ml-auto">uses your BYOK key</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {prd.comments.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            Ask the assistant to critique, expand, or rewrite this PRD.
            Proposed edits show up with an Apply button.
          </p>
        )}
        {prd.comments.map((c) => (
          <div key={c.id} className={cn("flex", c.author_type === "ai" ? "justify-start" : "justify-end")}>
            <div className={cn(
              "rounded-xl px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap",
              c.author_type === "ai" ? "bg-purple-50 text-purple-900" : "bg-blue-50 text-blue-900"
            )}>
              {c.body}
            </div>
          </div>
        ))}
        {chat.isPending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> thinking…
          </div>
        )}
      </div>

      {proposal && (
        <div className="mx-3 mb-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-xs font-semibold text-amber-800 mb-1">Assistant proposed changes to the PRD body</p>
          <p className="text-[11px] text-amber-900/70 line-clamp-2 font-mono mb-2">{proposal.slice(0, 160)}…</p>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                    onClick={applyProposal} disabled={updatePRD.isPending}>
              Apply changes
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setProposal(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <div className="border-t px-3 py-3 flex items-center gap-2">
        <DictationButton showInterim={false} onText={(t) => setMessage((v) => appendTranscript(v, t))} />
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder="Ask about or edit this PRD…"
          className="flex-1 text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button size="sm" onClick={handleSend} disabled={!message.trim() || chat.isPending} className="h-9">
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}
