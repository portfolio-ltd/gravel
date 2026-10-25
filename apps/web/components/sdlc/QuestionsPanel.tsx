"use client"

import { useState } from "react"
import { CircleHelp, Lock, LockOpen, Plus, RotateCcw, Sparkles, Trash2, UserRound } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import type { OpenQuestion, QuestionStatus } from "@/types"
import { useAddQuestion, useDeleteQuestion, useTaskQuestions, useUpdateQuestion } from "@/hooks/useSdlc"
import { errorDetail } from "@/hooks/useTaskExtras"
import { Input, Textarea } from "@/components/ui/form"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const STATUS_TONE: Record<QuestionStatus, string> = {
  open: "bg-warning/15 text-warning",
  answered: "bg-success/10 text-success",
  deferred: "bg-slate-100 text-slate-600",
  dismissed: "bg-slate-100 text-slate-500",
}

function QuestionItem({ q, taskId }: { q: OpenQuestion; taskId: string }) {
  const update = useUpdateQuestion(taskId)
  const del = useDeleteQuestion(taskId)
  const [answering, setAnswering] = useState(false)
  const [answer, setAnswer] = useState(q.answer ?? "")
  const [owner, setOwner] = useState(q.owner ?? "")
  const [editingOwner, setEditingOwner] = useState(false)

  function patch(p: Parameters<typeof update.mutate>[0], success?: string) {
    update.mutate(p, {
      onSuccess: () => success && toast.success(success),
      onError: (e) => toast.error(errorDetail(e, "Could not update question")),
    })
  }

  return (
    <li className={cn("rounded-lg border bg-card p-3", q.status === "open" && q.blocking && "border-warning/40")}>
      <div className="flex items-start gap-2">
        <CircleHelp className={cn("mt-0.5 h-4 w-4 shrink-0", q.status === "open" ? "text-warning" : "text-muted-foreground")} />
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm leading-snug", q.status !== "open" && q.status !== "answered" && "text-muted-foreground line-through")}>
            {q.question}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className={cn("rounded-full px-1.5 py-0.5 font-semibold capitalize", STATUS_TONE[q.status])}>{q.status}</span>
            {q.blocking && q.status === "open" && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-1.5 py-0.5 font-semibold text-destructive">
                <Lock className="h-2.5 w-2.5" /> Blocking
              </span>
            )}
            {editingOwner ? (
              <form className="inline-flex" onSubmit={(e) => {
                e.preventDefault()
                patch({ id: q.id, owner: owner.trim() || null })
                setEditingOwner(false)
              }}>
                <Input autoFocus value={owner} onChange={(e) => setOwner(e.target.value)} onBlur={() => setEditingOwner(false)}
                  className="h-6 w-32 px-1.5 text-[11px]" aria-label="Question owner" placeholder="Owner" />
              </form>
            ) : (
              <button className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setEditingOwner(true)} aria-label="Change owner">
                <UserRound className="h-2.5 w-2.5" /> {q.owner || "No owner"}
              </button>
            )}
            {q.author_type === "ai" && (
              <span className="inline-flex items-center gap-0.5 text-primary"><Sparkles className="h-2.5 w-2.5" /> raised by AI</span>
            )}
            <span className="text-muted-foreground">{formatDistanceToNow(new Date(q.created_at), { addSuffix: true })}</span>
          </div>

          {q.answer && !answering && (
            <div className="mt-2 rounded-md bg-success/10 px-2.5 py-1.5 text-xs">
              <span className="font-semibold text-success">Answer: </span>{q.answer}
            </div>
          )}

          {answering && (
            <form className="mt-2 space-y-2" onSubmit={(e) => {
              e.preventDefault()
              if (!answer.trim()) return
              patch({ id: q.id, answer: answer.trim(), status: "answered" }, "Answer recorded")
              setAnswering(false)
            }}>
              <Textarea autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} className="min-h-[60px] text-xs"
                placeholder="The decision, and who made it" aria-label="Answer" />
              <div className="flex gap-2">
                <Button type="submit" size="sm" className="h-7 text-xs" disabled={!answer.trim() || update.isPending}>Save answer</Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAnswering(false)}>Cancel</Button>
              </div>
            </form>
          )}

          {!answering && (
            <div className="mt-2 flex flex-wrap gap-1">
              {q.status === "open" ? (
                <>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setAnswering(true)}>Answer</Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => patch({ id: q.id, status: "deferred" }, "Deferred — it no longer blocks")}>
                    Defer
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => patch({ id: q.id, status: "dismissed" })}>
                    Dismiss
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => patch({ id: q.id, blocking: !q.blocking })}>
                    {q.blocking ? <LockOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    {q.blocking ? "Make non-blocking" : "Make blocking"}
                  </Button>
                </>
              ) : (
                <>
                  {q.status === "answered" && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setAnswering(true)}>Edit answer</Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => patch({ id: q.id, status: "open" })}>
                    <RotateCcw className="h-3 w-3" /> Reopen
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                aria-label="Delete question" onClick={() => del.mutate(q.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export default function QuestionsPanel({ taskId }: { taskId: string }) {
  const { data: questions } = useTaskQuestions(taskId)
  const add = useAddQuestion(taskId)
  const [text, setText] = useState("")
  const [owner, setOwner] = useState("")
  const [showResolved, setShowResolved] = useState(false)

  const open = (questions ?? []).filter((q) => q.status === "open")
  const resolved = (questions ?? []).filter((q) => q.status !== "open")

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open questions</h3>
        {open.some((q) => q.blocking) && (
          <span className="text-[11px] text-warning">Blocking questions hold back stages that wait for answers</span>
        )}
      </div>
      {open.length === 0 && (
        <p className="mb-2 text-xs text-muted-foreground">Nothing open. Unknowns found by any stage land here with an owner.</p>
      )}
      <ul className="space-y-2">
        {open.map((q) => <QuestionItem key={q.id} q={q} taskId={taskId} />)}
      </ul>
      {resolved.length > 0 && (
        <div className="mt-2">
          <button className="text-[11px] font-medium text-muted-foreground hover:text-foreground" onClick={() => setShowResolved((v) => !v)}
            aria-expanded={showResolved}>
            {showResolved ? "Hide" : "Show"} {resolved.length} resolved
          </button>
          {showResolved && (
            <ul className="mt-2 space-y-2">
              {resolved.map((q) => <QuestionItem key={q.id} q={q} taskId={taskId} />)}
            </ul>
          )}
        </div>
      )}
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          add.mutate({ question: text.trim(), owner: owner.trim() || null }, {
            onSuccess: () => { setText(""); setOwner("") },
            onError: (err) => toast.error(errorDetail(err, "Could not add question")),
          })
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question…" className="h-8 flex-1 text-xs"
          aria-label="New question" />
        <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Owner" className="h-8 text-xs sm:w-32"
          aria-label="Owner of the new question" />
        <Button type="submit" size="sm" variant="outline" className="h-8" disabled={!text.trim() || add.isPending}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </form>
    </div>
  )
}
