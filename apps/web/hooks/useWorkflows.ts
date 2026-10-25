"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { Workflow, WorkflowCreate, WorkflowStage, WorkflowStageCreate } from "@/types"

export function useWorkflows() {
  return useQuery<Workflow[]>({
    queryKey: ["workflows"],
    queryFn: () => apiFetch("/api/workflows"),
  })
}

export function useWorkflow(id: string | null | undefined) {
  return useQuery<Workflow>({
    queryKey: ["workflows", id],
    queryFn: () => apiFetch(`/api/workflows/${id}`),
    enabled: !!id,
  })
}

function useInvalidateWorkflows() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ["workflows"] })
}

export function useCreateWorkflow() {
  const invalidate = useInvalidateWorkflows()
  return useMutation({
    mutationFn: (data: WorkflowCreate) =>
      apiFetch<Workflow>("/api/workflows", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
}

export function useUpdateWorkflow() {
  const invalidate = useInvalidateWorkflows()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string }) =>
      apiFetch<Workflow>(`/api/workflows/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
}

export function useDeleteWorkflow() {
  const invalidate = useInvalidateWorkflows()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/workflows/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  })
}

export function useAddStage() {
  const invalidate = useInvalidateWorkflows()
  return useMutation({
    mutationFn: ({ workflowId, ...data }: WorkflowStageCreate & { workflowId: string }) =>
      apiFetch<WorkflowStage>(`/api/workflows/${workflowId}/stages`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
}

export function useUpdateStage() {
  const invalidate = useInvalidateWorkflows()
  return useMutation({
    mutationFn: ({ workflowId, stageId, ...data }: Partial<WorkflowStageCreate> & { workflowId: string; stageId: string }) =>
      apiFetch<WorkflowStage>(`/api/workflows/${workflowId}/stages/${stageId}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
}

export function useDeleteStage() {
  const invalidate = useInvalidateWorkflows()
  return useMutation({
    mutationFn: ({ workflowId, stageId }: { workflowId: string; stageId: string }) =>
      apiFetch(`/api/workflows/${workflowId}/stages/${stageId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  })
}

export function useReorderStages() {
  const invalidate = useInvalidateWorkflows()
  return useMutation({
    mutationFn: ({ workflowId, stages }: { workflowId: string; stages: { id: string; stage_order: number }[] }) =>
      apiFetch<Workflow>(`/api/workflows/${workflowId}/stages/reorder`, { method: "PATCH", body: JSON.stringify({ stages }) }),
    onSuccess: invalidate,
  })
}

export function useCreateWorkflowFromTemplate() {
  const invalidate = useInvalidateWorkflows()
  return useMutation({
    mutationFn: (data: { template_key: string; name?: string }) =>
      apiFetch<Workflow>("/api/workflows/from-template", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
}
