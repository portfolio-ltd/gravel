"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { GitBranch, Plus, Trash2, Pencil, LayoutTemplate } from "lucide-react"
import { useWorkflows, useDeleteWorkflow, useCreateWorkflowFromTemplate } from "@/hooks/useWorkflows"
import { useMeta } from "@/hooks/useSdlc"
import { Button } from "@/components/ui/button"
import { EmptyState, Page, PageHeader } from "@/components/ui/page"
import { Pipeline, PipelineLegend, TemplateCard, stagesFromWorkflow } from "@/components/workflow/Pipeline"
import { toast } from "sonner"
import { formatRelativeTime } from "@/lib/utils"

export default function WorkflowsPage() {
  const router = useRouter()
  const { data: workflows, isLoading } = useWorkflows()
  const { data: meta } = useMeta()
  const deleteWorkflow = useDeleteWorkflow()
  const fromTemplate = useCreateWorkflowFromTemplate()
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  async function handleUseTemplate(key: string) {
    setPendingKey(key)
    try {
      const wf = await fromTemplate.mutateAsync({ template_key: key })
      toast.success(`Created “${wf.name}”`)
      router.push(`/workflows/${wf.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create workflow")
    } finally {
      setPendingKey(null)
    }
  }

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
    <Page>
      <PageHeader
        icon={<GitBranch className="h-4 w-4" />}
        title="Workflows"
        description="The stages a task moves through, who runs them, and where humans sign off."
        actions={
          <Button size="sm" variant="outline" onClick={() => router.push("/workflows/new")}>
            <Plus className="h-3.5 w-3.5" /> Blank workflow
          </Button>
        }
      />

      <section className="mb-10">
        <div className="mb-3 flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Start from a template</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(meta?.workflow_templates ?? []).map((tpl) => (
            <TemplateCard
              key={tpl.key}
              template={tpl}
              pending={pendingKey === tpl.key}
              onUse={() => handleUseTemplate(tpl.key)}
            />
          ))}
          {!meta && [0, 1, 2].map((i) => <div key={i} className="surface h-40 animate-pulse bg-muted/40" />)}
        </div>
        <div className="mt-3"><PipelineLegend /></div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Your workflows</h2>
        {isLoading ? (
          <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="surface h-20 animate-pulse bg-muted/40" />)}</div>
        ) : workflows && workflows.length > 0 ? (
          <div className="space-y-3">
            {workflows.map((wf) => (
              <div key={wf.id} className="surface group flex items-start gap-4 p-4 transition-shadow hover:shadow-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/workflows/${wf.id}`} className="text-sm font-semibold hover:underline">{wf.name}</Link>
                    {wf.template_key && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">from template</span>
                    )}
                  </div>
                  {wf.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{wf.description}</p>}
                  <Pipeline stages={stagesFromWorkflow(wf.stages)} size="sm" className="mt-2.5" />
                </div>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{formatRelativeTime(wf.created_at)}</span>
                <div className="flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                  <button
                    onClick={() => router.push(`/workflows/${wf.id}`)}
                    className="rounded-lg p-1.5 hover:bg-muted"
                    aria-label={`Edit ${wf.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(wf.id, wf.name)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Delete ${wf.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<GitBranch className="h-5 w-5" />}
            title="No workflows yet"
            description="Pick a template above, or design your own pipeline. Projects without a workflow use the default groom → build → test → deploy flow."
          />
        )}
      </section>
    </Page>
  )
}
