"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { Task, TaskStatus, TaskPriority, TaskType } from "@/types"

export function useTasks(projectId: string | null) {
  return useQuery<Task[]>({
    queryKey: ["tasks", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/tasks`),
    enabled: !!projectId,
  })
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { title: string; description?: string; priority?: TaskPriority; type?: TaskType }) =>
      apiFetch<Task>(`/api/projects/${projectId}/tasks`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", projectId] }),
  })
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, ...data }: { taskId: string; title?: string; description?: string; status?: TaskStatus; priority?: TaskPriority; type?: TaskType }) =>
      apiFetch<Task>(`/api/projects/${projectId}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", projectId] })
      qc.invalidateQueries({ queryKey: ["project", projectId] })
    },
  })
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => apiFetch(`/api/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", projectId] }),
  })
}
