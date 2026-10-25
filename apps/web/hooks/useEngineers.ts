"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { Engineer, EngineerCreate, EngineerRuntime } from "@/types"

export function useEngineers() {
  return useQuery<Engineer[]>({
    queryKey: ["engineers"],
    queryFn: () => apiFetch("/api/engineers"),
  })
}

export function useCreateEngineer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: EngineerCreate) =>
      apiFetch<Engineer>("/api/engineers", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engineers"] }),
  })
}

export function useUpdateEngineer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<EngineerCreate> & { id: string }) =>
      apiFetch<Engineer>(`/api/engineers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engineers"] }),
  })
}

export function useDeleteEngineer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/engineers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engineers"] }),
  })
}

export function useLaunchEngineer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<EngineerRuntime>(`/api/engineers/${id}/launch`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engineers"] }),
  })
}

export function useStopEngineer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/engineers/${id}/stop`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engineers"] }),
  })
}

export function useStopRuntime() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runtimeId: string) =>
      apiFetch<EngineerRuntime>(`/api/engineers/runtimes/${runtimeId}/stop`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engineers"] }),
  })
}

export function useRestartRuntime() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runtimeId: string) =>
      apiFetch<EngineerRuntime>(`/api/engineers/runtimes/${runtimeId}/restart`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engineers"] }),
  })
}
