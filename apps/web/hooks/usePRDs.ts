"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { PRD, PRDChatResponse, PRDComment, PRDListItem, PRDStatus } from "@/types"

export function usePRDs(status?: PRDStatus | "") {
  return useQuery<PRDListItem[]>({
    queryKey: ["prds", status || "all"],
    queryFn: () => apiFetch(`/api/prds${status ? `?status=${status}` : ""}`),
  })
}

export function usePRD(id: string | null | undefined) {
  return useQuery<PRD>({
    queryKey: ["prds", id],
    queryFn: () => apiFetch(`/api/prds/${id}`),
    enabled: !!id,
  })
}

function useInvalidatePRDs() {
  const qc = useQueryClient()
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: ["prds"] })
    if (id) qc.invalidateQueries({ queryKey: ["prds", id] })
  }
}

export function useCreatePRD() {
  const invalidate = useInvalidatePRDs()
  return useMutation({
    mutationFn: (data: { title: string; summary?: string; body_markdown?: string }) =>
      apiFetch<PRD>("/api/prds", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => invalidate(),
  })
}

export function useUpdatePRD() {
  const invalidate = useInvalidatePRDs()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; title?: string; summary?: string; body_markdown?: string; status?: PRDStatus }) =>
      apiFetch<PRD>(`/api/prds/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: (_, { id }) => invalidate(id),
  })
}

export function useDeletePRD() {
  const invalidate = useInvalidatePRDs()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/prds/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidate(),
  })
}

export function usePRDChat() {
  const invalidate = useInvalidatePRDs()
  return useMutation({
    mutationFn: ({ prdId, message, model }: { prdId: string; message: string; model?: string }) =>
      apiFetch<PRDChatResponse>(`/api/prds/${prdId}/chat`, { method: "POST", body: JSON.stringify({ message, model }) }),
    onSuccess: (_, { prdId }) => invalidate(prdId),
  })
}

export function useAddPRDComment() {
  const invalidate = useInvalidatePRDs()
  return useMutation({
    mutationFn: ({ prdId, body }: { prdId: string; body: string }) =>
      apiFetch<PRDComment>(`/api/prds/${prdId}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
    onSuccess: (_, { prdId }) => invalidate(prdId),
  })
}

export function usePRDSplit() {
  return useMutation({
    mutationFn: (prdId: string) =>
      apiFetch<{ task_titles: string[] }>(`/api/prds/${prdId}/split`, { method: "POST" }),
  })
}

export function useConvertPRD() {
  const qc = useQueryClient()
  const invalidate = useInvalidatePRDs()
  return useMutation({
    mutationFn: ({ prdId, projectIds, taskTitles }: { prdId: string; projectIds: string[]; taskTitles: string[] }) =>
      apiFetch<{ created_count: number }>(`/api/prds/${prdId}/convert`, {
        method: "POST",
        body: JSON.stringify({ project_ids: projectIds, task_titles: taskTitles }),
      }),
    onSuccess: (_, { prdId }) => {
      invalidate(prdId)
      qc.invalidateQueries({ queryKey: ["board"] })
      qc.invalidateQueries({ queryKey: ["projects"] })
    },
  })
}
