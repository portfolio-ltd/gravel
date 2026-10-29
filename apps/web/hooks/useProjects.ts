"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type { Project, ProjectDetail } from "@/types"

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => apiFetch("/api/projects"),
  })
}

export function useProject(id: string | null) {
  return useQuery<ProjectDetail>({
    queryKey: ["project", id],
    queryFn: () => apiFetch(`/api/projects/${id}`),
    enabled: !!id,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      name: string
      default_model?: string
      workflow_id?: string
      workflow_template?: string
      repo_url?: string
      issues_repo?: string
      post_issue_comments?: boolean
    }) =>
      apiFetch<Project>("/api/projects", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  })
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      name?: string
      default_model?: string
      repo_url?: string | null
      default_branch?: string
      workflow_id?: string | null
      issues_repo?: string | null
      post_issue_comments?: boolean
    }) =>
      apiFetch<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.invalidateQueries({ queryKey: ["project", id] })
    },
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  })
}

export function useAdvanceProject(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch<Project>(`/api/projects/${id}/advance`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.invalidateQueries({ queryKey: ["project", id] })
    },
  })
}
