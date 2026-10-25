"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import { getAccessToken } from "@/lib/auth"
import { getActiveOrgId } from "@/lib/orgStore"
import { ApiError, type TaskRun } from "@/types"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

function useInvalidateGates() {
  const qc = useQueryClient()
  return (taskId?: string) => {
    qc.invalidateQueries({ queryKey: ["attention-tasks"] })
    qc.invalidateQueries({ queryKey: ["board"] })
    qc.invalidateQueries({ queryKey: ["metrics"] })
    qc.invalidateQueries({ queryKey: ["project"] })
    if (taskId) {
      qc.invalidateQueries({ queryKey: ["task-runs", taskId] })
      qc.invalidateQueries({ queryKey: ["comments", taskId] })
      qc.invalidateQueries({ queryKey: ["task-questions", taskId] })
    }
  }
}

/** Approve a gated run. 409 means something (e.g. open questions) still blocks it. */
export function useApproveGate() {
  const invalidate = useInvalidateGates()
  return useMutation({
    mutationFn: ({ runId, note }: { runId: string; taskId?: string; note?: string }) =>
      apiFetch<TaskRun>(`/api/task-runs/${runId}/approve`, { method: "POST", body: JSON.stringify({ note }) }),
    onSuccess: (_, { taskId }) => invalidate(taskId),
  })
}

/**
 * Reject a gated run. rework=true ("request changes") sends the task back for
 * another pass with the note as feedback; rework=false stops it at pending.
 */
export function useRejectGate() {
  const invalidate = useInvalidateGates()
  return useMutation({
    mutationFn: ({ runId, note, rework }: { runId: string; taskId?: string; note?: string; rework: boolean }) =>
      apiFetch<TaskRun>(`/api/task-runs/${runId}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: note || undefined, rework }),
      }),
    onSuccess: (_, { taskId }) => invalidate(taskId),
  })
}

export function errorDetail(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof ApiError ? err.detail : err instanceof Error ? err.message : fallback
}

/**
 * Evidence files are only served to authenticated org members, so links can't
 * be plain hrefs: fetch with the bearer token and open the blob.
 */
export async function openArtifact(artifactId: string): Promise<void> {
  // Open the tab synchronously so popup blockers allow it, then fill it in
  const win = window.open("", "_blank")
  const token = getAccessToken()
  const orgId = getActiveOrgId()
  try {
    const res = await fetch(`${BASE}/api/artifacts/${artifactId}/download`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(orgId ? { "X-Org-Id": orgId } : {}),
      },
    })
    if (!res.ok) throw new ApiError(res.status, res.status === 404 ? "File not found" : res.statusText)
    const url = URL.createObjectURL(await res.blob())
    if (win) win.location.href = url
    else window.location.assign(url)
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    win?.close()
    throw err
  }
}
