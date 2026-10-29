"use client"

import { CircleHelp, ExternalLink, GitPullRequest, Hourglass, ListChecks, Workflow } from "lucide-react"
import type { BoardCardFields } from "@/lib/theme"
import TagChip from "@/components/TagChip"
import { cn } from "@/lib/utils"
import { type BoardTask, issueRef } from "./meta"

/** The chip row on task cards; which chips show is a per-user board preference. */
export default function CardMeta({ task, fields, showStage = true }: {
  task: BoardTask
  fields: BoardCardFields
  /** Stage lanes already name the stage — no need to repeat it on the card */
  showStage?: boolean
}) {
  const criteria = task.acceptance_criteria ?? []
  const met = criteria.filter((c) => c.done).length
  const issue = issueRef(task)
  const questions = task.open_question_count ?? 0
  const waiting = task.status === "done" ? 0 : task.waiting_on_count ?? 0

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
      {waiting > 0 && (
        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground"
          title={`Starts when ${waiting} task${waiting === 1 ? "" : "s"} it depends on ${waiting === 1 ? "is" : "are"} done`}>
          <Hourglass className="h-2.5 w-2.5" /> Waiting on {waiting}
        </span>
      )}
      {fields.type && (
        <span className="rounded bg-muted px-1.5 py-0.5 font-medium capitalize text-muted-foreground">{task.type}</span>
      )}
      {fields.stage && showStage && task.stage_name && (
        <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
          <Workflow className="h-2.5 w-2.5" /> {task.stage_name}
        </span>
      )}
      {fields.criteria && criteria.length > 0 && (
        <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium",
          met === criteria.length ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}
          title={`${met} of ${criteria.length} acceptance criteria met`}>
          <ListChecks className="h-2.5 w-2.5" /> {met}/{criteria.length}
        </span>
      )}
      {fields.questions && questions > 0 && (
        <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 font-medium text-warning"
          title={`${questions} blocking question${questions === 1 ? "" : "s"} open`}>
          <CircleHelp className="h-2.5 w-2.5" /> {questions}
        </span>
      )}
      {fields.links && task.pr_url && (
        <a href={task.pr_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded bg-info/10 px-1.5 py-0.5 font-medium text-info hover:underline" title="Pull request">
          <GitPullRequest className="h-2.5 w-2.5" /> PR
        </a>
      )}
      {fields.links && issue && task.external_url && (
        <a href={task.external_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium text-muted-foreground hover:text-foreground"
          title="Source issue">
          <ExternalLink className="h-2.5 w-2.5" /> {issue}
        </a>
      )}
      {fields.tags && (task.tags ?? []).map((t) => <TagChip key={t.id} tag={t} size="xs" />)}
    </div>
  )
}
