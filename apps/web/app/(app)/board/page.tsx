"use client"

import { useMemo, useState } from "react"
import { Kanban } from "lucide-react"
import { useBoard } from "@/hooks/useBoard"
import { useAttentionTasks } from "@/hooks/useBoard"
import { useProjects } from "@/hooks/useProjects"
import { useTags } from "@/hooks/useTags"
import KanbanBoard from "@/components/KanbanBoard"
import { cn } from "@/lib/utils"

export default function BoardPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [tagFilter, setTagFilter] = useState<string>("")
  const { data: board, isLoading } = useBoard(selectedProjectId || undefined)
  const { data: attentionTasks } = useAttentionTasks()
  const { data: projects } = useProjects()
  const { data: tags } = useTags()

  // Client-side tag filter — the board payload already carries each task's tags
  const columns = useMemo(() => {
    if (!board) return []
    if (!tagFilter) return board.columns
    return board.columns.map((c) => ({
      ...c,
      tasks: c.tasks.filter((t) => (t.tags ?? []).some((tag) => tag.id === tagFilter)),
    }))
  }, [board, tagFilter])

  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Kanban className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Board</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(tags ?? []).length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {(tags ?? []).map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => setTagFilter(tagFilter === tag.id ? "" : tag.id)}
                  className={cn(
                    "text-[10px] px-2 py-1 rounded-full font-medium transition-all",
                    tagFilter === tag.id ? "ring-2 ring-offset-1" : "opacity-70 hover:opacity-100"
                  )}
                  style={{ backgroundColor: `${tag.color}22`, color: tag.color }}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All projects</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading board…</div>
      ) : board ? (
        <div className="flex-1 overflow-hidden">
          <KanbanBoard columns={columns} attentionTasks={attentionTasks} />
        </div>
      ) : null}
    </div>
  )
}
