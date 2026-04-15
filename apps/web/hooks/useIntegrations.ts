"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { GitIntegration, GitIntegrationCreate, DeployEnvironment, DeployEnvCreate } from "@/types"

// ── Git integrations ──────────────────────────────────────────────────────────

export function useGitIntegrations() {
  return useQuery<GitIntegration[]>({
    queryKey: ["integrations", "git"],
    queryFn: () => apiFetch("/api/integrations/git"),
  })
}

export function useCreateGitIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: GitIntegrationCreate) =>
      apiFetch<GitIntegration>("/api/integrations/git", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", "git"] }),
  })
}

export function useUpdateGitIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; access_token?: string; is_active?: boolean }) =>
      apiFetch<GitIntegration>(`/api/integrations/git/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", "git"] }),
  })
}

export function useDeleteGitIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/integrations/git/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", "git"] }),
  })
}

// ── Deploy environments ────────────────────────────────────────────────────────

export function useDeployEnvironments() {
  return useQuery<DeployEnvironment[]>({
    queryKey: ["integrations", "deploy"],
    queryFn: () => apiFetch("/api/integrations/deploy"),
  })
}

export function useCreateDeployEnvironment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: DeployEnvCreate) =>
      apiFetch<DeployEnvironment>("/api/integrations/deploy", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", "deploy"] }),
  })
}

export function useUpdateDeployEnvironment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; region?: string; config?: Record<string, string>; is_active?: boolean }) =>
      apiFetch<DeployEnvironment>(`/api/integrations/deploy/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", "deploy"] }),
  })
}

export function useDeleteDeployEnvironment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/integrations/deploy/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", "deploy"] }),
  })
}
