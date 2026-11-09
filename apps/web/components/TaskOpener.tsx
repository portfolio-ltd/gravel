"use client"

import { Loader2 } from "lucide-react"
import { useProject } from "@/hooks/useProjects"
import TaskDetailPanel from "@/components/TaskDetailPanel"

/** Overview items only carry ids — load the project to hand the panel a full task. */
export default function TaskOpener({ projectId, taskId, onClose }: { projectId: string; taskId: string; onClose: () => void }) {
  const { data: project, isLoading } = useProject(projectId)
  const task = project?.tasks.find((t) => t.id === taskId)
  if (isLoading || !task) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose} role="presentation">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  return <TaskDetailPanel task={task} onClose={onClose} />
}
