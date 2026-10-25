"use client"

import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ProjectSocket } from "@/lib/ws"
import type { WsMessage } from "@/lib/ws"

export function useProjectSocket(projectId: string | null) {
  const qc = useQueryClient()
  const socketRef = useRef<ProjectSocket | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!projectId) return

    const socket = new ProjectSocket(projectId)
    socketRef.current = socket

    const unsub = socket.on((msg: WsMessage) => {
      switch (msg.type) {
        case "task.updated":
        case "task.created":
          qc.invalidateQueries({ queryKey: ["tasks", projectId] })
          qc.invalidateQueries({ queryKey: ["project", projectId] })
          qc.invalidateQueries({ queryKey: ["board"] })
          if (typeof (msg.task as { id?: string } | undefined)?.id === "string") {
            qc.invalidateQueries({ queryKey: ["task-runs", (msg.task as { id: string }).id] })
          }
          break
        case "task.artifacts":
          // A stage produced documents / criteria / questions, or a human edited them
          if (typeof msg.task_id === "string") {
            qc.invalidateQueries({ queryKey: ["task-documents", msg.task_id] })
            qc.invalidateQueries({ queryKey: ["task-questions", msg.task_id] })
          }
          qc.invalidateQueries({ queryKey: ["tasks", projectId] })
          qc.invalidateQueries({ queryKey: ["project", projectId] })
          qc.invalidateQueries({ queryKey: ["knowledge"] })
          break
        case "tasks.imported":
          qc.invalidateQueries({ queryKey: ["tasks", projectId] })
          qc.invalidateQueries({ queryKey: ["project", projectId] })
          qc.invalidateQueries({ queryKey: ["board"] })
          break
        case "project.status_changed":
          qc.invalidateQueries({ queryKey: ["projects"] })
          qc.invalidateQueries({ queryKey: ["project", projectId] })
          break
        case "changelog.added":
          qc.invalidateQueries({ queryKey: ["changelog", projectId] })
          qc.invalidateQueries({ queryKey: ["project", projectId] })
          break
        case "agent.progress":
          qc.invalidateQueries({ queryKey: ["project", projectId] })
          break
        case "task_run.outcome":
          // A run hit an approval gate or got blocked — refresh attention surfaces
          qc.invalidateQueries({ queryKey: ["attention-tasks"] })
          qc.invalidateQueries({ queryKey: ["metrics"] })
          qc.invalidateQueries({ queryKey: ["board"] })
          if (typeof msg.task_id === "string") {
            qc.invalidateQueries({ queryKey: ["task-runs", msg.task_id] })
          }
          break
        case "engineer.heartbeat":
          qc.invalidateQueries({ queryKey: ["engineers"] })
          break
      }
    })

    socket.connect()

    // Poll connection state
    const interval = setInterval(() => {
      setConnected(socket.readyState === WebSocket.OPEN)
    }, 2000)

    return () => {
      unsub()
      socket.disconnect()
      clearInterval(interval)
    }
  }, [projectId, qc])

  return { connected }
}
