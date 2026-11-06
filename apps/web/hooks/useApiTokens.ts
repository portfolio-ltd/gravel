"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { ApiToken, ApiTokenCreated, DeviceLogin } from "@/types"

export function useApiTokens() {
  return useQuery<ApiToken[]>({ queryKey: ["api-tokens"], queryFn: () => apiFetch("/api/users/me/tokens") })
}

export function useCreateApiToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; expires_in_days?: number | null }) =>
      apiFetch<ApiTokenCreated>("/api/users/me/tokens", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-tokens"] }),
  })
}

export function useRevokeApiToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/users/me/tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-tokens"] }),
  })
}

export function useDeviceLogin(userCode: string | null) {
  return useQuery<DeviceLogin>({
    queryKey: ["device-login", userCode],
    queryFn: () => apiFetch(`/api/auth/device/${encodeURIComponent(userCode ?? "")}`),
    enabled: !!userCode,
    retry: false,
  })
}

export function useDecideDeviceLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { user_code: string; approve: boolean }) =>
      apiFetch<DeviceLogin>("/api/auth/device/decision", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["device-login"] })
      qc.invalidateQueries({ queryKey: ["api-tokens"] })
    },
  })
}
