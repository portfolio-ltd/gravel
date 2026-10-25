"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { Organization, OrganizationDetail, OrgAppearanceSettings, OrgRole } from "@/types"

export function useOrganizations() {
  return useQuery<Organization[]>({
    queryKey: ["organizations"],
    queryFn: () => apiFetch("/api/organizations"),
  })
}

export function useOrganization(id: string | null | undefined) {
  return useQuery<OrganizationDetail>({
    queryKey: ["organizations", id],
    queryFn: () => apiFetch(`/api/organizations/${id}`),
    enabled: !!id,
  })
}

function useInvalidateOrgs() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ["organizations"] })
}

export function useCreateOrg() {
  const invalidate = useInvalidateOrgs()
  return useMutation({
    mutationFn: (data: { name: string }) =>
      apiFetch<Organization>("/api/organizations", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
}

export function useUpdateOrg() {
  const invalidate = useInvalidateOrgs()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; appearance?: OrgAppearanceSettings | null }) =>
      apiFetch<OrganizationDetail>(`/api/organizations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
}

export function useDeleteOrg() {
  const invalidate = useInvalidateOrgs()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/organizations/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  })
}

export function useAddMember() {
  const invalidate = useInvalidateOrgs()
  return useMutation({
    mutationFn: ({ orgId, ...data }: { orgId: string; email: string; name?: string; role?: OrgRole }) =>
      apiFetch<OrganizationDetail>(`/api/organizations/${orgId}/members`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
}

export function useUpdateMemberRole() {
  const invalidate = useInvalidateOrgs()
  return useMutation({
    mutationFn: ({ orgId, userId, role }: { orgId: string; userId: string; role: OrgRole }) =>
      apiFetch<OrganizationDetail>(`/api/organizations/${orgId}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) }),
    onSuccess: invalidate,
  })
}

export function useRemoveMember() {
  const invalidate = useInvalidateOrgs()
  return useMutation({
    mutationFn: ({ orgId, userId }: { orgId: string; userId: string }) =>
      apiFetch(`/api/organizations/${orgId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  })
}
