"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Coins, FileImage, FileText, Paperclip, RefreshCw, Trash2, Upload } from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import type { ArtifactType, EvidenceArtifact, TaskRun, WorkflowStage } from "@/types"
import { useTaskRuns, useRetryTask } from "@/hooks/useTaskRuns"
import { useDeleteArtifact, useUploadArtifact } from "@/hooks/useArtifacts"
import { useTaskTokenSummary, formatTokens } from "@/hooks/useTokens"
import { useHarnesses } from "@/hooks/useHarnesses"
import { errorDetail, openArtifact } from "@/hooks/useTaskExtras"
import Markdown from "@/components/Markdown"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { duration, OUTCOME_META } from "./meta"

function ArtifactChip({ artifact }: { artifact: EvidenceArtifact }) {
  const del = useDeleteArtifact()
  const Icon = artifact.artifact_type === "screenshot" ? FileImage : FileText
  return (
    <span className="group inline-flex items-center gap-1 rounded-md border bg-background pl-2 text-[11px]">
      <button
        className="inline-flex items-center gap-1 py-1 hover:text-primary"
        onClick={() => openArtifact(artifact.id).catch((e) => toast.error(errorDetail(e, "Could not open file")))}
      >
        <Icon className="h-3 w-3" /> {artifact.filename}
      </button>
      <button
        aria-label={`Delete ${artifact.filename}`}
        className="rounded-r-md px-1.5 py-1 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
        onClick={() => del.mutate({ artifactId: artifact.id, runId: artifact.task_run_id })}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </span>
  )
}

function RunItem({ run, stageName, defaultOpen, harnessName }: { run: TaskRun; stageName: string; defaultOpen: boolean; harnessName?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  const outcome = run.outcome ? OUTCOME_META[run.outcome] : null
  const running = !run.outcome && !!run.claimed_at
  const took = duration(run.claimed_at ?? run.started_at, run.completed_at)

  return (
    <li className="relative pl-6">
      <span className={cn("absolute left-0 top-2.5 h-2.5 w-2.5 rounded-full ring-4 ring-background",
        running ? "animate-pulse bg-info" : !run.outcome ? "bg-muted-foreground/40"
          : run.outcome === "failed" || run.outcome === "blocked" ? "bg-destructive"
            : run.outcome === "needs_human_input" ? "bg-warning" : "bg-success")} />
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/50">
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <span className="font-medium">{stageName}</span>
        {run.attempt_number > 1 && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">attempt {run.attempt_number}</span>
        )}
        {running && <span className="rounded-full bg-info/10 px-1.5 py-0.5 text-[10px] font-semibold text-info">running</span>}
        {!run.outcome && !run.claimed_at && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">queued</span>}
        {outcome && <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", outcome.tone)}>{outcome.label}</span>}
        {run.approved_at && <span className="text-[10px] text-success">approved</span>}
        {harnessName && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title="Agent harness">{harnessName}</span>}
        <span className="ml-auto text-[11px] text-muted-foreground" title={format(new Date(run.started_at), "PPpp")}>
          {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}{took && ` · ${took}`}
        </span>
      </button>
      {open && (
        <div className="mb-2 ml-2 space-y-2 border-l pl-3">
          {run.blocking_reason && (
            <p className="rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning">{run.blocking_reason}</p>
          )}
          {run.summary && <Markdown className="text-xs">{run.summary}</Markdown>}
          {(run.logs ?? []).length > 0 && (
            <pre className="max-h-56 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
              {(run.logs ?? []).map((log) => (
                <div key={log.id} className={cn(log.level === "error" && "text-destructive", log.level === "warn" && "text-warning")}>
                  <span className="text-muted-foreground">{format(new Date(log.created_at), "HH:mm:ss")} </span>
                  {log.message}
                </div>
              ))}
            </pre>
          )}
          {(run.artifacts ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(run.artifacts ?? []).map((a) => <ArtifactChip key={a.id} artifact={a} />)}
            </div>
          )}
          {!run.summary && !run.blocking_reason && (run.logs ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">No output yet.</p>
          )}
        </div>
      )}
    </li>
  )
}

function artifactTypeFor(file: File): ArtifactType {
  if (file.type.startsWith("image/")) return "screenshot"
  return /test|junit|report|coverage/i.test(file.name) ? "test_result" : "log"
}

export default function ActivityPanel({ taskId, stages }: { taskId: string; stages: WorkflowStage[] }) {
  const { data: runs, isLoading } = useTaskRuns(taskId)
  const { data: tokens } = useTaskTokenSummary(taskId)
  const { data: harnesses } = useHarnesses()
  const upload = useUploadArtifact()
  const retry = useRetryTask()
  const stageName = (run: TaskRun) =>
    (run.workflow_stage_id && stages.find((s) => s.id === run.workflow_stage_id)?.name)
    || (run.workflow_stage_id ? "Stage" : `${run.phase[0].toUpperCase()}${run.phase.slice(1)} phase`)
  const latest = runs?.[0]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {tokens && tokens.calls > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] text-muted-foreground">
            <Coins className="h-3 w-3" />
            {formatTokens(tokens.tokens_in)} in · {formatTokens(tokens.tokens_out)} out · ${tokens.cost_usd.toFixed(2)} · {tokens.calls} calls
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {latest && (
            <label className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-muted",
              upload.isPending && "pointer-events-none opacity-50")}>
              <Upload className="h-3.5 w-3.5" /> Attach evidence
              <input type="file" className="sr-only"
                accept="image/*,.log,.txt,.json,.xml,.md,.csv,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  if (!file) return
                  upload.mutate({ runId: latest.id, file, artifactType: artifactTypeFor(file) }, {
                    onSuccess: () => toast.success(`Attached ${file.name}`),
                    onError: (err) => toast.error(errorDetail(err, "Upload failed")),
                  })
                }} />
            </label>
          )}
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={retry.isPending}
            onClick={() => retry.mutate(taskId, {
              onSuccess: () => toast.success("Restarted from the first stage"),
              onError: (e) => toast.error(errorDetail(e, "Could not restart")),
            })}
            title="Start the task over from the first stage">
            <RefreshCw className="h-3.5 w-3.5" /> Restart
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading activity…</p>
      ) : runs && runs.length > 0 ? (
        <ol className="relative space-y-1 before:absolute before:bottom-2 before:left-[4.5px] before:top-2 before:w-px before:bg-border">
          {runs.map((run, i) => (
            <RunItem key={run.id} run={run} stageName={stageName(run)} defaultOpen={i === 0}
              harnessName={run.harness_id ? harnesses?.find((h) => h.id === run.harness_id)?.name : undefined} />
          ))}
        </ol>
      ) : (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5" /> No runs yet — start the project&apos;s engineers to begin.
        </p>
      )}
    </div>
  )
}
