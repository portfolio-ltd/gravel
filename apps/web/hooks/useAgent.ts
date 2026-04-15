"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch, apiUpload } from "@/lib/api"

export function useParseAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { project_id: string; model?: string }) =>
      apiFetch<{ tasks: Array<{ title: string; description: string; priority: string; type: string }> }>(
        "/api/agent/parse",
        { method: "POST", body: JSON.stringify(data) }
      ),
    onSuccess: (_: unknown, { project_id }: { project_id: string }) => {
      qc.invalidateQueries({ queryKey: ["tasks", project_id] })
      qc.invalidateQueries({ queryKey: ["project", project_id] })
    },
  })
}

export function useRunAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) =>
      apiFetch(`/api/agent/run/${projectId}`, { method: "POST" }),
    onSuccess: (_: unknown, projectId: string) => {
      qc.invalidateQueries({ queryKey: ["project", projectId] })
      qc.invalidateQueries({ queryKey: ["projects"] })
    },
  })
}

export function useUploadFile() {
  return useMutation({
    mutationFn: ({ projectId, file, fileType }: { projectId: string; file: File; fileType: "prd" | "design" }) => {
      const fd = new FormData()
      fd.append("project_id", projectId)
      fd.append("file_type", fileType)
      fd.append("file", file)
      return apiUpload<{ file_path: string; filename: string }>("/api/files/upload", fd)
    },
  })
}
