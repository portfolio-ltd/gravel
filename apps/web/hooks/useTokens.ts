"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { TokenSummary } from "@/types"

export function useTaskTokenSummary(taskId: string | null | undefined) {
  return useQuery<TokenSummary>({
    queryKey: ["token-summary", "task", taskId],
    queryFn: () => apiFetch(`/api/tasks/${taskId}/token-summary`),
    enabled: !!taskId,
  })
}

export function useProjectTokenSummary(projectId: string | null | undefined) {
  return useQuery<TokenSummary>({
    queryKey: ["token-summary", "project", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/token-summary`),
    enabled: !!projectId,
  })
}

export function usePRDTokenSummary(prdId: string | null | undefined) {
  return useQuery<TokenSummary>({
    queryKey: ["token-summary", "prd", prdId],
    queryFn: () => apiFetch(`/api/prds/${prdId}/token-summary`),
    enabled: !!prdId,
  })
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}
