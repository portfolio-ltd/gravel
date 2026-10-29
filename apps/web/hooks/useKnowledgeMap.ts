"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, apiUpload } from "@/lib/api"
import { getAccessToken } from "@/lib/auth"
import { getActiveOrgId } from "@/lib/orgStore"
import type { KnowledgeEntry, KnowledgeImportResult, KnowledgeLinks, KnowledgeMap } from "@/types"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

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

/** Downloads the Obsidian vault zip through an authenticated fetch (no <a href> — the API needs headers). */
export async function downloadVault(projectId?: string): Promise<void> {
  const token = getAccessToken()
  const orgId = getActiveOrgId()
  const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""
  const res = await fetch(`${BASE}/api/knowledge/export/obsidian${qs}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(orgId ? { "X-Org-Id": orgId } : {}) },
  })
  if (!res.ok) throw new Error(res.status === 401 ? "Session expired — reload and try again" : `Export failed (${res.status})`)
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "gravel-vault.zip"
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
