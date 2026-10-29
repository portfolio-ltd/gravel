"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { ExternalLinkItem, LinkEntityType, LinkKind } from "@/types"

export function useLinks(entityType: LinkEntityType, entityId: string | null | undefined) {
  return useQuery<ExternalLinkItem[]>({
    queryKey: ["links", entityType, entityId],
    queryFn: () => apiFetch(`/api/links?entity_type=${entityType}&entity_id=${entityId}`),
    enabled: !!entityId,
  })
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["links"] })
  qc.invalidateQueries({ queryKey: ["knowledge-map"] })
}

export function useCreateLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { entity_type: LinkEntityType; entity_id: string; url: string; title?: string; kind?: LinkKind; description?: string | null }) =>
      apiFetch<ExternalLinkItem>("/api/links", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => invalidate(qc),
  })
}

export function useUpdateLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; url?: string; title?: string; kind?: LinkKind; description?: string | null }) =>
      apiFetch<ExternalLinkItem>(`/api/links/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => invalidate(qc),
  })
}

export function useDeleteLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/links/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidate(qc),
  })
}
