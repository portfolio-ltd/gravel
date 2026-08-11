"use client"

import { useState } from "react"
import { X, Plus, Sparkles, Loader2 } from "lucide-react"
import { useProjects } from "@/hooks/useProjects"
import { usePRDSplit, useConvertPRD } from "@/hooks/usePRDs"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { PRD } from "@/types"

export default function PRDConvertDialog({ prd, onClose }: { prd: PRD; onClose: () => void }) {
  const { data: projects } = useProjects()
  const split = usePRDSplit()
  const convert = useConvertPRD()
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
  const [titles, setTitles] = useState<string[]>([""])
  const [aiProposed, setAiProposed] = useState(false)

  function toggleProject(id: string) {
    setSelectedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSplit() {
    try {
      const res = await split.mutateAsync(prd.id)
      if (res.task_titles.length) {
        setTitles(res.task_titles)
        setAiProposed(true)
      } else {
        toast.info("The AI proposed no tasks — write them manually")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI split failed")
    }
  }

  async function handleConvert() {
    const cleanTitles = titles.map((t) => t.trim()).filter(Boolean)
    try {
      const res = await convert.mutateAsync({
        prdId: prd.id,
        projectIds: [...selectedProjects],
        taskTitles: cleanTitles,
      })
      toast.success(`${res.created_count} task(s) created`)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Convert failed")
    }
  }

  const canConvert = selectedProjects.size > 0 && titles.some((t) => t.trim())

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b">
          <h2 className="font-bold text-base">Convert to tasks</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Target project(s)</label>
            <div className="flex flex-wrap gap-2">
              {(projects ?? []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggleProject(p.id)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-lg border transition-colors",
                    selectedProjects.has(p.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted"
                  )}
                >
                  {p.name}
                </button>
              ))}
              {(projects ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No projects in this organization yet.</p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Task titles {aiProposed && <span className="text-primary">(proposed by AI — edit freely)</span>}
              </label>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSplit} disabled={split.isPending}>
                {split.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                AI split
              </Button>
            </div>
            <div className="space-y-2">
              {titles.map((t, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                  <input
                    value={t}
                    onChange={(e) => setTitles((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                    placeholder="Task title…"
                    className="flex-1 text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={() => setTitles((prev) => prev.filter((_, j) => j !== i))}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => setTitles((p) => [...p, ""])}>
              <Plus className="w-3 h-3" /> Add row
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Each selected project receives one task per title, with this PRD's body as the requirements.
            The PRD is then marked <b>converted</b>.
          </p>
        </div>

        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleConvert} disabled={!canConvert || convert.isPending}>
            {convert.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Convert
          </Button>
        </div>
      </div>
    </div>
  )
}
