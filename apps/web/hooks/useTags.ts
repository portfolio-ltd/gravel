"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { Tag, Task } from "@/types"

export function useTags() {
  return useQuery<Tag[]>({
    queryKey: ["tags"],
    queryFn: () => apiFetch("/api/tags"),
  })
}

export function useCreateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; color?: string }) =>
      apiFetch<Tag>("/api/tags", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  })
}

export function useUpdateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; color?: string }) =>
      apiFetch<Tag>(`/api/tags/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/tags/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] })
      qc.invalidateQueries({ queryKey: ["board"] })
      qc.invalidateQueries({ queryKey: ["prds"] })
    },
  })
}

export function useSetTaskTags() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, tagIds }: { taskId: string; tagIds: string[] }) =>
      apiFetch<Task>(`/api/tasks/${taskId}/tags`, { method: "PATCH", body: JSON.stringify({ tag_ids: tagIds }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
      qc.invalidateQueries({ queryKey: ["project"] })
    },
  })
}

export function useSetPRDTags() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ prdId, tagIds }: { prdId: string; tagIds: string[] }) =>
      apiFetch<Tag[]>(`/api/prds/${prdId}/tags`, { method: "PATCH", body: JSON.stringify({ tag_ids: tagIds }) }),
    onSuccess: (_, { prdId }) => {
      qc.invalidateQueries({ queryKey: ["prds"] })
      qc.invalidateQueries({ queryKey: ["prds", prdId] })
    },
  })
}
