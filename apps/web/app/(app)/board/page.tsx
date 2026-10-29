"use client"

import { Suspense, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Kanban, Loader2 } from "lucide-react"
import { useBoard, useAttentionTasks } from "@/hooks/useBoard"
import { useProjects } from "@/hooks/useProjects"
import { useTags } from "@/hooks/useTags"
import { useProjectSocket } from "@/hooks/useProjectSocket"
import KanbanBoard from "@/components/KanbanBoard"
import BoardCustomize from "@/components/sdlc/BoardCustomize"
import { PageHeader } from "@/components/ui/page"
import { Select } from "@/components/ui/form"
import { cn } from "@/lib/utils"

export default function BoardPage() {
  return (
    <Suspense fallback={null}>
      <Board />
    </Suspense>
  )
}

function Board() {
  // ?project=<id> preselects a project (linked from the projects page) and stays in sync
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const selectedProjectId = searchParams.get("project") ?? ""
  function setSelectedProjectId(id: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set("project", id)
    else params.delete("project")
    router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false })
  }
  const [tagFilter, setTagFilter] = useState<string>("")
  const { data: board, isLoading } = useBoard(selectedProjectId || undefined)
  // Live updates: stage changes, gate outcomes and new documents refresh the
  // board and any open task panel without waiting for the next poll
  useProjectSocket(selectedProjectId || null)
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

  const total = columns.reduce((n, c) => n + c.tasks.length, 0)
  const waiting = attentionTasks?.length ?? 0

  return (
    <div className="flex h-full flex-col px-4 pt-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={<Kanban className="h-4 w-4" />}
        title="Board"
        description={
          selectedProjectId
            ? "Lanes follow the project's workflow stages. Tasks move as stages complete and gates are approved."
            : `${total} task${total === 1 ? "" : "s"} across all projects${waiting ? ` · ${waiting} waiting for a decision` : ""}`
        }
        actions={
          <>
            <label className="sr-only" htmlFor="board-project">Project</label>
            <Select id="board-project" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}
              className="h-8 w-48 text-xs">
              <option value="">All projects</option>
              {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <BoardCustomize columns={board?.columns ?? []} />
          </>
        }
        className="mb-4"
      />

      {(tags ?? []).length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by tag">
          {(tags ?? []).map((tag) => (
            <button
              key={tag.id}
              onClick={() => setTagFilter(tagFilter === tag.id ? "" : tag.id)}
              aria-pressed={tagFilter === tag.id}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
                tagFilter === tag.id ? "ring-2 ring-offset-1 ring-offset-background" : "opacity-70 hover:opacity-100",
              )}
              style={{ backgroundColor: `${tag.color}22`, color: tag.color, ...(tagFilter === tag.id ? { ["--tw-ring-color" as string]: tag.color } : {}) }}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading board…
        </div>
      ) : board ? (
        <div className="min-h-0 flex-1">
          <KanbanBoard columns={columns} attentionTasks={attentionTasks} />
        </div>
      ) : null}
    </div>
  )
}
