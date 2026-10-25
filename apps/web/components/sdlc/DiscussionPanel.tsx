"use client"

import { useState } from "react"
import { Bot, MessageSquareWarning, Send, Trash2, UserRound } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import type { TaskComment } from "@/types"
import { useAddComment, useDeleteComment, useTaskComments } from "@/hooks/useTaskRuns"
import { errorDetail } from "@/hooks/useTaskExtras"
import Markdown from "@/components/Markdown"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/form"
import { cn } from "@/lib/utils"

function CommentItem({ comment, taskId }: { comment: TaskComment; taskId: string }) {
  const del = useDeleteComment()
  const ai = comment.author_type === "ai"
  const changes = comment.action_flag === "changes_requested"
  return (
    <li className="group flex gap-2.5">
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        ai ? "bg-primary/10 text-primary" : "bg-muted text-foreground")}>
        {ai ? <Bot className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-[11px]">
          <span className="font-semibold">{ai ? "Engineer" : "Team"}</span>
          {changes && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 font-semibold text-warning">
              <MessageSquareWarning className="h-2.5 w-2.5" /> Changes requested
            </span>
          )}
          {comment.action_flag === "needs_review" && (
            <span className="rounded-full bg-info/10 px-1.5 py-0.5 font-semibold text-info">Needs review</span>
          )}
          <span className="text-muted-foreground">{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}</span>
          <button
            aria-label="Delete comment"
            onClick={() => del.mutate({ taskId, commentId: comment.id })}
            className="ml-auto rounded p-1 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
        <div className={cn("rounded-lg border px-3 py-2",
          changes ? "border-warning/40 bg-warning/10" : ai ? "bg-primary/5" : "bg-card")}>
          <Markdown className="text-[13px]">{comment.body}</Markdown>
        </div>
      </div>
    </li>
  )
}

export default function DiscussionPanel({ taskId }: { taskId: string }) {
  const { data: comments } = useTaskComments(taskId)
  const add = useAddComment()
  const [body, setBody] = useState("")

  function send() {
    if (!body.trim()) return
    add.mutate({ taskId, body: body.trim() }, {
      onSuccess: () => setBody(""),
      onError: (e) => toast.error(errorDetail(e, "Could not post comment")),
    })
  }

  return (
    <div className="space-y-4">
      {comments && comments.length > 0 ? (
        <ul className="space-y-4">
          {comments.map((c) => <CommentItem key={c.id} comment={c} taskId={taskId} />)}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No comments yet. Comments are part of what the engineer reads on every stage — use them for decisions and context.
        </p>
      )}
      <div className="space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send() }}
          placeholder="Add context or a decision… (⌘/Ctrl + Enter to send)"
          className="min-h-[72px] text-sm"
          aria-label="New comment"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={send} disabled={!body.trim() || add.isPending}>
            <Send className="h-3.5 w-3.5" /> Comment
          </Button>
        </div>
      </div>
    </div>
  )
}
