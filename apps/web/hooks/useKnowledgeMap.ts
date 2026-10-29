"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiDownload, apiFetch, apiUpload } from "@/lib/api"
import type { KnowledgeEntry, KnowledgeImportResult, KnowledgeLinks, KnowledgeMap } from "@/types"

export function useKnowledgeMap(opts: { projectId?: string; tasks?: boolean; code?: boolean } = {}) {
  const params = new URLSearchParams()
  if (opts.projectId) params.set("project_id", opts.projectId)
  if (opts.tasks === false) params.set("tasks", "false")
  if (opts.code === false) params.set("code", "false")
  return useQuery<KnowledgeMap>({
    queryKey: ["knowledge-map", opts.projectId ?? "", opts.tasks !== false, opts.code !== false],
    queryFn: () => apiFetch(`/api/map${params.size ? `?${params}` : ""}`),
  })
}

export function useKnowledgeEntry(id: string | null | undefined) {
  return useQuery<KnowledgeEntry>({
    queryKey: ["knowledge-entry", id],
    queryFn: () => apiFetch(`/api/knowledge/${id}`),
    enabled: !!id,
  })
}

export function useKnowledgeLinks(id: string | null | undefined) {
  return useQuery<KnowledgeLinks>({
    queryKey: ["knowledge-links", id],
    queryFn: () => apiFetch(`/api/knowledge/${id}/links`),
    enabled: !!id,
  })
}

export function useImportNotes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ files, projectId }: { files: File[]; projectId?: string }) => {
      const form = new FormData()
      for (const f of files) form.append("files", f, f.webkitRelativePath || f.name)
      const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""
      return apiUpload<KnowledgeImportResult>(`/api/knowledge/import${qs}`, form)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge"] })
      qc.invalidateQueries({ queryKey: ["knowledge-map"] })
      qc.invalidateQueries({ queryKey: ["knowledge-links"] })
    },
  })
}

/** Downloads the Obsidian vault zip (authenticated, so not a plain link). */
export function downloadVault(projectId?: string): Promise<void> {
  const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""
  return apiDownload(`/api/knowledge/export/obsidian${qs}`, "gravel-vault.zip")
}
