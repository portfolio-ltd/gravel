"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { GitBranch, Plus, Trash2, Pencil } from "lucide-react"
import { useWorkflows, useDeleteWorkflow } from "@/hooks/useWorkflows"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { formatRelativeTime } from "@/lib/utils"

export default function WorkflowsPage() {
  const router = useRouter()
  const { data: workflows, isLoading } = useWorkflows()
  const deleteWorkflow = useDeleteWorkflow()

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete workflow "${name}"?`)) return
    try {
      await deleteWorkflow.mutateAsync(id)
      toast.success("Workflow deleted")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete workflow")
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">Workflows</h1>
          </div>
          <Button size="sm" onClick={() => router.push("/workflows/new")}>
            <Plus className="w-3.5 h-3.5" /> New workflow
          </Button>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          Custom pipelines for your projects: ordered stages with assigned engineers,
          approval gates, and rework loops. Projects without a workflow use the default
          grooming → build → testing → deployment flow.
        </p>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading workflows…</div>
        ) : workflows && workflows.length > 0 ? (
          <div className="space-y-3">
            {workflows.map((wf) => (
              <div key={wf.id} className="bg-background rounded-xl border p-4 flex items-center gap-4 hover:shadow-sm transition-all group">
                <div className="flex-1 min-w-0">
                  <Link href={`/workflows/${wf.id}`} className="font-semibold text-sm hover:underline">
                    {wf.name}
                  </Link>
                  {wf.description && (
                    <p className="text-xs text-muted-foreground truncate">{wf.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {wf.stages.map((s, i) => (
                      <span key={s.id} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {i + 1}. {s.name}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                  {formatRelativeTime(wf.created_at)}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => router.push(`/workflows/${wf.id}`)}
                    className="p-1.5 rounded-lg hover:bg-muted"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(wf.id, wf.name)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <GitBranch className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="font-semibold mb-1">No workflows yet</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Design a custom stage pipeline and attach it to your projects.
            </p>
            <Button size="sm" onClick={() => router.push("/workflows/new")}>
              <Plus className="w-3.5 h-3.5" /> Create workflow
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
