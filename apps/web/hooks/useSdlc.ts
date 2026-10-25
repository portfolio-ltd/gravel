"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import type {
  AcceptanceCriterion,
  DocumentKind,
  IssueImportResult,
  KnowledgeEntry,
  KnowledgeKind,
  KnowledgeStatus,
  Meta,
  OpenQuestion,
  QuestionStatus,
  Task,
  TaskDocument,
} from "@/types"

// ── Meta (models, stage roles, workflow templates) ───────────────────────────

export function useMeta() {
  return useQuery<Meta>({
    queryKey: ["meta"],
    queryFn: () => apiFetch("/api/meta"),
    staleTime: 10 * 60 * 1000,
  })
}

// ── Task documents ───────────────────────────────────────────────────────────

export function useTaskDocuments(taskId: string | undefined) {
  return useQuery<TaskDocument[]>({
    queryKey: ["task-documents", taskId],
    queryFn: () => apiFetch(`/api/tasks/${taskId}/documents`),
    enabled: !!taskId,
  })
}

export function useDocumentHistory(taskId: string | undefined, enabled = true) {
  return useQuery<TaskDocument[]>({
    queryKey: ["task-documents", taskId, "history"],
    queryFn: () => apiFetch(`/api/tasks/${taskId}/documents?history=true`),
    enabled: !!taskId && enabled,
  })
}

export function useSaveDocument(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (doc: { kind: DocumentKind; title: string; body_markdown: string }) =>
      apiFetch<TaskDocument>(`/api/tasks/${taskId}/documents`, { method: "POST", body: JSON.stringify(doc) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-documents", taskId] }),
  })
}

// ── Acceptance criteria ──────────────────────────────────────────────────────

export function useSetCriteria(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (items: Array<Pick<AcceptanceCriterion, "text" | "done"> & { id?: string }>) =>
      apiFetch<Task>(`/api/tasks/${taskId}/acceptance-criteria`, { method: "PUT", body: JSON.stringify({ items }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] })
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.invalidateQueries({ queryKey: ["project"] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
  })
}

// ── Open questions ───────────────────────────────────────────────────────────

export function useTaskQuestions(taskId: string | undefined) {
  return useQuery<OpenQuestion[]>({
    queryKey: ["task-questions", taskId],
    queryFn: () => apiFetch(`/api/tasks/${taskId}/questions`),
    enabled: !!taskId,
  })
}

export function useAddQuestion(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (q: { question: string; owner?: string | null; blocking?: boolean }) =>
      apiFetch<OpenQuestion>(`/api/tasks/${taskId}/questions`, { method: "POST", body: JSON.stringify(q) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-questions", taskId] }),
  })
}

export function useUpdateQuestion(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: {
      id: string; answer?: string | null; status?: QuestionStatus; owner?: string | null; blocking?: boolean; question?: string
    }) => apiFetch<OpenQuestion>(`/api/questions/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-questions", taskId] })
      qc.invalidateQueries({ queryKey: ["attention-tasks"] })
    },
  })
}

export function useDeleteQuestion(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/questions/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-questions", taskId] }),
  })
}

// ── Knowledge base ───────────────────────────────────────────────────────────

export function useKnowledge(filters: { kind?: KnowledgeKind; status?: KnowledgeStatus; project_id?: string } = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => !!v) as [string, string][])
  return useQuery<KnowledgeEntry[]>({
    queryKey: ["knowledge", filters],
    queryFn: () => apiFetch(`/api/knowledge${params.size ? `?${params}` : ""}`),
  })
}

export function useCreateKnowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entry: { kind: KnowledgeKind; title: string; body_markdown: string; project_id?: string | null; status?: KnowledgeStatus }) =>
      apiFetch<KnowledgeEntry>("/api/knowledge", { method: "POST", body: JSON.stringify(entry) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge"] }),
  })
}

export function useUpdateKnowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; title?: string; body_markdown?: string; status?: KnowledgeStatus; project_id?: string | null }) =>
      apiFetch<KnowledgeEntry>(`/api/knowledge/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge"] }),
  })
}

export function useDeleteKnowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/knowledge/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge"] }),
  })
}

// ── GitHub issue import ──────────────────────────────────────────────────────

export function useImportIssues(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (opts: { state?: "open" | "closed" | "all"; labels?: string; limit?: number } = {}) =>
      apiFetch<IssueImportResult>(`/api/projects/${projectId}/issues/import`, { method: "POST", body: JSON.stringify(opts) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.invalidateQueries({ queryKey: ["project"] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
      qc.invalidateQueries({ queryKey: ["board"] })
    },
  })
}
