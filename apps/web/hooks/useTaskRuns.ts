"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { TaskRun, TaskComment } from "@/types"

export function useTaskRuns(taskId: string) {
  return useQuery<TaskRun[]>({
    queryKey: ["task-runs", taskId],
    queryFn: () => apiFetch(`/api/tasks/${taskId}/runs`),
    enabled: !!taskId,
  })
}

export function useTaskRun(runId: string) {
  return useQuery<TaskRun>({
    queryKey: ["task-run", runId],
    queryFn: () => apiFetch(`/api/task-runs/${runId}`),
    enabled: !!runId,
  })
}

export function useApproveRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ runId, note }: { runId: string; note?: string }) =>
      apiFetch<TaskRun>(`/api/task-runs/${runId}/approve`, { method: "POST", body: JSON.stringify({ note }) }),
    onSuccess: (_, { runId }) => {
      qc.invalidateQueries({ queryKey: ["task-run", runId] })
      qc.invalidateQueries({ queryKey: ["attention-tasks"] })
      qc.invalidateQueries({ queryKey: ["board"] })
      qc.invalidateQueries({ queryKey: ["metrics"] })
    },
  })
}

export function useRejectRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ runId, note }: { runId: string; note?: string }) =>
      apiFetch<TaskRun>(`/api/task-runs/${runId}/reject`, { method: "POST", body: JSON.stringify({ note }) }),
    onSuccess: (_, { runId }) => {
      qc.invalidateQueries({ queryKey: ["task-run", runId] })
      qc.invalidateQueries({ queryKey: ["attention-tasks"] })
      qc.invalidateQueries({ queryKey: ["board"] })
      qc.invalidateQueries({ queryKey: ["metrics"] })
    },
  })
}

export function useRetryTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) =>
      apiFetch(`/api/tasks/${taskId}/retry`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] })
      qc.invalidateQueries({ queryKey: ["attention-tasks"] })
    },
  })
}

export function useTaskComments(taskId: string) {
  return useQuery<TaskComment[]>({
    queryKey: ["comments", taskId],
    queryFn: () => apiFetch(`/api/tasks/${taskId}/comments`),
    enabled: !!taskId,
  })
}

export function useAddComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, body, taskRunId }: { taskId: string; body: string; taskRunId?: string }) =>
      apiFetch<TaskComment>(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body, task_run_id: taskRunId }),
      }),
    onSuccess: (_, { taskId }) => qc.invalidateQueries({ queryKey: ["comments", taskId] }),
  })
}

export function useDeleteComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, commentId }: { taskId: string; commentId: string }) =>
      apiFetch(`/api/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: (_, { taskId }) => qc.invalidateQueries({ queryKey: ["comments", taskId] }),
  })
}
