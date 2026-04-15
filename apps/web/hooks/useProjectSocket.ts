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
