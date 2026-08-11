"use client"

import { useState } from "react"
import { X, CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronRight, Upload, Send, Trash2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { Task, TaskRun, TaskComment } from "@/types"
import { useTaskRuns, useApproveRun, useRejectRun, useAddComment, useDeleteComment, useTaskComments } from "@/hooks/useTaskRuns"
import { useArtifacts, useUploadArtifact } from "@/hooks/useArtifacts"
import { useTaskTokenSummary, formatTokens } from "@/hooks/useTokens"
import { useSetTaskTags } from "@/hooks/useTags"
import TagPicker from "@/components/TagPicker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-emerald-100 text-emerald-700",
}

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  build_complete: { label: "Build complete", color: "text-emerald-600" },
  testing_complete: { label: "Testing complete", color: "text-emerald-600" },
  deployment_complete: { label: "Deployed", color: "text-emerald-600" },
  grooming_complete: { label: "Grooming done", color: "text-blue-600" },
  needs_human_input: { label: "Needs review", color: "text-amber-600" },
  blocked: { label: "Blocked", color: "text-red-600" },
  failed: { label: "Failed", color: "text-red-600" },
}

function RunRow({ run }: { run: TaskRun }) {
  const [open, setOpen] = useState(false)
  const { data: artifacts } = useArtifacts(open ? run.id : "")
  const outcome = run.outcome ? OUTCOME_LABELS[run.outcome] : null

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
        <span className="font-medium capitalize">
          {run.workflow_stage_id ? "Stage run" : `${run.phase} phase`}
        </span>
        {run.attempt_number > 1 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
            attempt {run.attempt_number}
          </span>
        )}
        {outcome && <span className={cn("text-xs ml-auto", outcome.color)}>{outcome.label}</span>}
        <span className="text-xs text-muted-foreground ml-2">
          {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}
        </span>
      </button>

      {open && (
        <div className="border-t bg-muted/20 p-3 space-y-2">
          {run.blocking_reason && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5">{run.blocking_reason}</p>
          )}
          {(run.logs ?? []).map((log) => (
            <p key={log.id} className={cn("text-xs font-mono", log.level === "error" ? "text-red-600" : "text-muted-foreground")}>
              [{log.level}] {log.message}
            </p>
          ))}
          {(artifacts ?? []).length > 0 && (
            <div className="flex gap-2 flex-wrap pt-1">
              {artifacts!.map((a) => (
                <a
                  key={a.id}
                  href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/uploads/${a.file_path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2 py-1 rounded bg-background border hover:bg-muted transition-colors"
                >
                  {a.artifact_type}: {a.filename}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CommentItem({ comment, taskId }: { comment: TaskComment; taskId: string }) {
  const del = useDeleteComment()
  return (
    <div className={cn("flex gap-2 group", comment.author_type === "ai" ? "flex-row-reverse" : "")}>
      <div className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5",
        comment.author_type === "ai" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
      )}>
        {comment.author_type === "ai" ? "AI" : "HU"}
      </div>
      <div className={cn("flex-1 max-w-[85%]", comment.author_type === "ai" ? "items-end" : "")}>
        <div className={cn(
          "rounded-xl px-3 py-2 text-sm",
          comment.author_type === "ai" ? "bg-purple-50 text-purple-900" : "bg-blue-50 text-blue-900"
        )}>
          {comment.body}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 px-1">
          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
        </p>
      </div>
      <button
        onClick={() => del.mutate({ taskId, commentId: comment.id })}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-destructive transition-all self-start mt-1"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}

interface Props {
  task: Task
  onClose: () => void
}

export default function TaskDetailPanel({ task, onClose }: Props) {
  const { data: runs } = useTaskRuns(task.id)
  const { data: comments } = useTaskComments(task.id)
  const { data: tokenSummary } = useTaskTokenSummary(task.id)
  const setTaskTags = useSetTaskTags()
  const approve = useApproveRun()
  const reject = useRejectRun()
  const addComment = useAddComment()
  const uploadArtifact = useUploadArtifact()
  const [commentBody, setCommentBody] = useState("")

  const latestRun = runs?.[0]
  const needsAction = !!latestRun && latestRun.approval_required && !latestRun.approved_at
  const isGate = needsAction && latestRun.outcome !== "needs_human_input" && latestRun.outcome !== "blocked"

  function handleSendComment() {
    if (!commentBody.trim()) return
    addComment.mutate({ taskId: task.id, body: commentBody })
    setCommentBody("")
  }

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-background border-l shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm leading-tight">{task.title}</h2>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px] capitalize">{task.status.replace("_", " ")}</Badge>
            <Badge className={cn("text-[10px]", PRIORITY_COLORS[task.priority])} variant="outline">{task.priority}</Badge>
            <Badge variant="outline" className="text-[10px] capitalize">{task.type}</Badge>
            {task.branch_name && <Badge variant="outline" className="text-[10px] font-mono">{task.branch_name}</Badge>}
            {task.pr_url && (
              <a href={task.pr_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 underline">
                Pull request ↗
              </a>
            )}
            {task.deploy_url && (
              <a href={task.deploy_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-emerald-600 underline">
                Live ↗
              </a>
            )}
          </div>
          <div className="mt-2">
            <TagPicker
              selected={task.tags ?? []}
              onChange={(tagIds) => setTaskTags.mutate({ taskId: task.id, tagIds })}
            />
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Action banner */}
      {needsAction && latestRun && (
        <div className="mx-4 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-xs font-semibold text-amber-800 mb-1">
            {isGate
              ? `Approval gate: ${latestRun.phase.replace("_", " ")} phase finished`
              : "Needs your review"}
          </p>
          {latestRun.blocking_reason && (
            <p className="text-xs text-amber-700 mb-2">{latestRun.blocking_reason}</p>
          )}
          {latestRun.summary && (
            <p className="text-xs text-amber-900/80 mb-2 line-clamp-4">{latestRun.summary}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
              onClick={() => approve.mutate({ runId: latestRun.id })}
              disabled={approve.isPending}
            >
              <CheckCircle className="w-3 h-3" /> Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs"
              onClick={() => reject.mutate({ runId: latestRun.id })}
              disabled={reject.isPending}
            >
              <XCircle className="w-3 h-3" /> Reject
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Description */}
        {task.description && (
          <div className="px-4 py-3 border-b">
            <p className="text-xs text-muted-foreground mb-1 font-medium">Description</p>
            <p className="text-sm">{task.description}</p>
          </div>
        )}

        {/* Run timeline */}
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground font-medium">Run history</p>
            {tokenSummary && tokenSummary.calls > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {formatTokens(tokenSummary.tokens_in)} in / {formatTokens(tokenSummary.tokens_out)} out · ${tokenSummary.cost_usd.toFixed(2)}
              </p>
            )}
          </div>
          {runs && runs.length > 0 ? (
            <div className="space-y-2">
              {runs.map((run) => <RunRow key={run.id} run={run} />)}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No runs yet.</p>
          )}
        </div>

        {/* Artifact upload */}
        {latestRun && (
          <div className="px-4 py-3 border-b">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Upload evidence</p>
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-muted cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>Drop screenshot, log, or test result</span>
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file && latestRun) {
                    const artifactType = file.type.startsWith("image/")
                      ? "screenshot"
                      : /test|junit|report/i.test(file.name) ? "test_result" : "log"
                    uploadArtifact.mutate({ runId: latestRun.id, file, artifactType })
                  }
                }}
              />
            </label>
          </div>
        )}

        {/* Comments */}
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground mb-3 font-medium">Comments</p>
          {comments && comments.length > 0 ? (
            <div className="space-y-3">
              {comments.map((c) => <CommentItem key={c.id} comment={c} taskId={task.id} />)}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No comments yet.</p>
          )}
        </div>
      </div>

      {/* Comment input */}
      <div className="border-t px-4 py-3 flex gap-2">
        <input
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendComment()}
          placeholder="Add a comment..."
          className="flex-1 text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button size="sm" onClick={handleSendComment} disabled={!commentBody.trim() || addComment.isPending} className="h-9">
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}
