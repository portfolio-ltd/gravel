"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { CodeGraph } from "@/types"

/** The project's code graph (null until first built). Polls while a build runs. */
export function useCodeGraph(projectId: string | null) {
  return useQuery<CodeGraph | null>({
    queryKey: ["code-graph", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/code-graph`),
    enabled: !!projectId,
    refetchInterval: (q) => (q.state.data?.status === "pending" || q.state.data?.status === "building" ? 3000 : false),
  })
}

export function useBuildCodeGraph(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<CodeGraph>(`/api/projects/${projectId}/code-graph/build`, { method: "POST" }),
    onSuccess: (data) => qc.setQueryData(["code-graph", projectId], data),
  })
}
