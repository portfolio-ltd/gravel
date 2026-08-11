"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiUpload, apiFetch } from "@/lib/api"
import type { EvidenceArtifact, ArtifactType } from "@/types"

export function useArtifacts(runId: string) {
  return useQuery<EvidenceArtifact[]>({
    queryKey: ["artifacts", runId],
    queryFn: () => apiFetch(`/api/task-runs/${runId}/artifacts`),
    enabled: !!runId,
  })
}

export function useUploadArtifact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ runId, file, artifactType }: { runId: string; file: File; artifactType: ArtifactType }) => {
      const fd = new FormData()
      fd.append("task_run_id", runId)
      fd.append("artifact_type", artifactType)
      fd.append("file", file)
      return apiUpload<EvidenceArtifact>("/api/artifacts/upload", fd)
    },
    onSuccess: (_, { runId }) => qc.invalidateQueries({ queryKey: ["artifacts", runId] }),
  })
}

export function useDeleteArtifact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ artifactId, runId }: { artifactId: string; runId: string }) =>
      apiFetch(`/api/artifacts/${artifactId}`, { method: "DELETE" }),
    onSuccess: (_, { runId }) => qc.invalidateQueries({ queryKey: ["artifacts", runId] }),
  })
}
