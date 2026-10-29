"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { AgentHarness, HarnessInput, HarnessPreview, HarnessTemplate } from "@/types"

export function useHarnesses() {
  return useQuery<AgentHarness[]>({ queryKey: ["harnesses"], queryFn: () => apiFetch("/api/harnesses") })
}

export function useHarnessTemplates() {
  return useQuery<HarnessTemplate[]>({
    queryKey: ["harness-templates"],
    queryFn: () => apiFetch("/api/harnesses/templates"),
    staleTime: 10 * 60 * 1000,
  })
}

export function useHarnessPreview(harnessId: string | null, role: string) {
  return useQuery<HarnessPreview>({
    queryKey: ["harness-preview", harnessId ?? "builtin", role],
    queryFn: () => apiFetch(harnessId
      ? `/api/harnesses/${harnessId}/preview?role=${encodeURIComponent(role)}`
      : `/api/harnesses/builtin-preview?role=${encodeURIComponent(role)}`),
  })
}

export function useCreateHarness() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<HarnessInput> & { name: string }) =>
      apiFetch<AgentHarness>("/api/harnesses", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["harnesses"] }),
  })
}

export function useCreateHarnessFromTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { template_key: string; name?: string; make_default?: boolean }) =>
      apiFetch<AgentHarness>("/api/harnesses/from-template", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["harnesses"] }),
  })
}

export function useUpdateHarness() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<HarnessInput>) =>
      apiFetch<AgentHarness>(`/api/harnesses/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["harnesses"] })
      qc.invalidateQueries({ queryKey: ["harness-preview"] })
    },
  })
}

export function useDeleteHarness() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/harnesses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["harnesses"] }),
  })
}
