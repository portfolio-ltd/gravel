"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { User, UserRole, ApiKeysMasked } from "@/types"

export function useUsers() {
  return useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch("/api/users"),
  })
}

export function useCurrentUser() {
  return useQuery<User>({
    queryKey: ["me"],
    queryFn: () => apiFetch("/api/auth/me"),
  })
}

export function useInviteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; email: string; role: UserRole }) =>
      apiFetch<User>("/api/users/invite", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; role?: UserRole }) =>
      apiFetch<User>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      qc.invalidateQueries({ queryKey: ["me"] })
    },
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/users/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  })
}

export function useApiKeys(userId: string | undefined) {
  return useQuery<ApiKeysMasked>({
    queryKey: ["api-keys", userId],
    queryFn: () => apiFetch(`/api/users/${userId}/api-keys`),
    enabled: !!userId,
  })
}

export function useSaveApiKeys() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, keys }: { userId: string; keys: ApiKeysMasked }) =>
      apiFetch(`/api/users/${userId}/api-keys`, { method: "PUT", body: JSON.stringify(keys) }),
    onSuccess: (_: unknown, { userId }: { userId: string }) =>
      qc.invalidateQueries({ queryKey: ["api-keys", userId] }),
  })
}
