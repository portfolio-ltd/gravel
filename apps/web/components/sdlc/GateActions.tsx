"use client"

import { useState } from "react"
import { CheckCircle, Loader2, MessageSquareWarning, OctagonX } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/form"
import { errorDetail, useApproveGate, useRejectGate } from "@/hooks/useTaskExtras"
import { cn } from "@/lib/utils"

interface Props {
  runId: string
  taskId?: string
  /** Smaller buttons for cards and lists */
  compact?: boolean
  className?: string
}

/**
 * Approve / Request changes / Stop for a run waiting at a human gate.
 * "Request changes" asks for a note — it becomes the feedback the next attempt reads.
 */
export default function GateActions({ runId, taskId, compact, className }: Props) {
  const approve = useApproveGate()
  const reject = useRejectGate()
  const [mode, setMode] = useState<"idle" | "changes">("idle")
  const [note, setNote] = useState("")
  const busy = approve.isPending || reject.isPending
  const size = compact ? "h-7 px-2.5 text-[11px]" : "h-8 text-xs"

  function onApprove() {
    approve.mutate({ runId, taskId }, {
      onSuccess: () => toast.success("Approved — the next step is queued"),
      onError: (e) => toast.error(errorDetail(e, "Could not approve")),
    })
  }

  function onReject(rework: boolean) {
    reject.mutate({ runId, taskId, note: note.trim(), rework }, {
      onSuccess: () => {
        toast.success(rework ? "Changes requested — the stage will run again" : "Task stopped and returned to pending")
        setMode("idle")
        setNote("")
      },
      onError: (e) => toast.error(errorDetail(e, "Could not reject")),
    })
  }

  if (mode === "changes") {
    return (
      <div className={cn("space-y-2", className)} onClick={(e) => e.stopPropagation()}>
        <label className="sr-only" htmlFor={`changes-${runId}`}>What should change?</label>
        <Textarea
          id={`changes-${runId}`}
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What should change? The engineer reads this on the next attempt."
          className="min-h-[72px] text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && note.trim()) onReject(true)
            if (e.key === "Escape") setMode("idle")
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="warning" className={size} disabled={busy || !note.trim()} onClick={() => onReject(true)}>
            {reject.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquareWarning className="h-3 w-3" />}
            Send back
          </Button>
          <Button size="sm" variant="ghost" className={size} disabled={busy} onClick={() => setMode("idle")}>Cancel</Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)} onClick={(e) => e.stopPropagation()}>
      <Button size="sm" variant="success" className={size} onClick={onApprove} disabled={busy}>
        {approve.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
        Approve
      </Button>
      <Button size="sm" variant="outline" className={size} onClick={() => setMode("changes")} disabled={busy}>
        <MessageSquareWarning className="h-3 w-3" /> Request changes
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className={cn(size, "text-muted-foreground hover:text-destructive")}
        onClick={() => onReject(false)}
        disabled={busy}
        title="Stop this task and return it to pending"
      >
        <OctagonX className="h-3 w-3" /> Stop
      </Button>
    </div>
  )
}
