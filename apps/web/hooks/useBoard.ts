"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { BoardData, AttentionTask, RunningRun, WorkspaceMetrics } from "@/types"

export function useBoard(projectId?: string) {
  return useQuery<BoardData>({
    queryKey: ["board", projectId ?? "all"],
    queryFn: () => apiFetch(projectId ? `/api/projects/${projectId}/board` : "/api/board"),
    refetchInterval: 15_000,
  })
}

export function useAttentionTasks() {
  return useQuery<AttentionTask[]>({
    queryKey: ["attention-tasks"],
    queryFn: () => apiFetch("/api/overview/attention-tasks"),
    refetchInterval: 10_000,
  })
}

export function useWorkspaceMetrics() {
  return useQuery<WorkspaceMetrics>({
    queryKey: ["metrics"],
    queryFn: () => apiFetch("/api/overview/metrics"),
    refetchInterval: 30_000,
  })
}

/** Runs in flight across the workspace — polled often so the Home list stays live. */
export function useRunningRuns() {
  return useQuery<RunningRun[]>({
    queryKey: ["running"],
    queryFn: () => apiFetch("/api/overview/running"),
    refetchInterval: 10_000,
  })
}
