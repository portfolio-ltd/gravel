"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2, Play, Plus } from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api"
import { useProjects } from "@/hooks/useProjects"
import { errorDetail } from "@/hooks/useTaskExtras"
import DictationButton from "@/components/ui/dictation-button"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/form"
import { splitRequest } from "@/lib/askBox"
import { appendTranscript } from "@/lib/dictation"
import { orderRecent, readRecentIds, rememberProject } from "@/lib/recentProjects"
import { cn } from "@/lib/utils"
import type { Task } from "@/types"

/**
 * "Ask your engineers…": type or dictate a request, pick a project, and it
 * becomes a task. "Add & start" also queues that one task on its first stage
 * (POST /tasks/{id}/start) — the rest of the project is left alone.
 */
export default function AskBox({ onOpenTask, className }: {
  onOpenTask: (projectId: string, taskId: string) => void
  className?: string
}) {
  const qc = useQueryClient()
  const { data: projects } = useProjects()
  const [text, setText] = useState("")
  const [projectId, setProjectId] = useState("")
  const ordered = useMemo(() => orderRecent(projects ?? [], readRecentIds(), 50), [projects])

  // Default to the most recently opened project once projects load
  useEffect(() => {
    if (!projectId && ordered.length) setProjectId(ordered[0].id)
  }, [ordered, projectId])

  const submit = useMutation({
    mutationFn: async ({ start }: { start: boolean }) => {
      const { title, description } = splitRequest(text)
      const task = await apiFetch<Task>(`/api/projects/${projectId}/tasks`, {
        method: "POST", body: JSON.stringify({ title, description }),
      })
      let startError: string | null = null
      let waitingFor: string | null = null
      if (start) {
        try {
          const res = await apiFetch<{ executor: string; account?: string; account_online?: boolean }>(
            `/api/projects/${projectId}/tasks/${task.id}/start`, { method: "POST" })
          if (res.executor === "account" && !res.account_online) {
            waitingFor = res.account ?? null
          }
        } catch (e) {
          startError = errorDetail(e, "Could not start it")
        }
      }
      return { task, start, startError, waitingFor }
    },
    onSuccess: ({ task, start, startError, waitingFor }) => {
      setText("")
      rememberProject(projectId)
      for (const key of ["tasks", "project", "projects", "board", "running", "metrics"]) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      const open = { label: "Open", onClick: () => onOpenTask(task.project_id, task.id) }
      if (waitingFor) toast.info(`Queued for the '${waitingFor}' account. Start: gravel work --account ${waitingFor}`, { action: open })
      else if (startError) toast.warning(`Task added, but not started: ${startError}`, { action: open })
      else toast.success(start ? "Task added and queued" : "Task added to the backlog", { action: open })
    },
    onError: (e) => toast.error(errorDetail(e, "Could not add the task")),
  })

  const ready = splitRequest(text).title.length > 0 && !!projectId && !submit.isPending

  if (projects && projects.length === 0) {
    return (
      <div className={cn("surface flex items-center justify-between gap-3 p-4 text-sm text-muted-foreground", className)}>
        <span>Create a project, then ask your engineers for work here.</span>
        <Link href="/projects?new=1"><Button size="sm"><Plus className="h-3.5 w-3.5" /> New project</Button></Link>
      </div>
    )
  }

  return (
    <form
      className={cn("surface flex flex-col gap-2 p-3 focus-within:ring-2 focus-within:ring-primary/30", className)}
      onSubmit={(e) => { e.preventDefault(); if (ready) submit.mutate({ start: false }) }}
    >
      <label htmlFor="ask-box" className="sr-only">What should your engineers do?</label>
      <textarea
        id="ask-box"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready) {
            e.preventDefault()
            submit.mutate({ start: e.shiftKey })
          }
        }}
        placeholder="Ask your engineers to research, write or build something…"
        className="w-full resize-none bg-transparent px-1 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="ask-project" className="sr-only">Project</label>
        <Select id="ask-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}
          className="h-7 w-auto max-w-[12rem] text-xs">
          {ordered.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <DictationButton size="sm" onText={(t) => setText((v) => appendTranscript(v, t))} />
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-muted-foreground lg:inline">⌘↵ add · ⇧⌘↵ start</span>
          <Button type="submit" size="sm" variant="outline" className="h-7 text-xs" disabled={!ready}>
            {submit.isPending && !submit.variables?.start ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Add task
          </Button>
          <Button type="button" size="sm" className="h-7 text-xs" disabled={!ready}
            onClick={() => submit.mutate({ start: true })}
            title="Add the task and queue it on its first stage now">
            {submit.isPending && submit.variables?.start ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Add &amp; start
          </Button>
        </div>
      </div>
    </form>
  )
}
