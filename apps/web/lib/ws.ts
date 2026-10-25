"use client"

import { getAccessToken } from "./auth"

const WS_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
  .replace(/^http/, "ws")

export type WsMessage = {
  type: string
  [key: string]: unknown
}

export type WsHandler = (msg: WsMessage) => void

export class ProjectSocket {
  private ws: WebSocket | null = null
  private handlers: WsHandler[] = []
  private retryDelay = 1000
  private maxDelay = 30000
  private stopped = false

  constructor(private projectId: string) {}

  connect() {
    if (this.stopped) return
    const token = getAccessToken()
    if (!token) return

    this.ws = new WebSocket(`${WS_BASE}/ws/${this.projectId}?token=${token}`)

    this.ws.onmessage = (e) => {
      try {
        const msg: WsMessage = JSON.parse(e.data)
        this.handlers.forEach((h) => h(msg))
      } catch {}
    }

    this.ws.onclose = () => {
      if (this.stopped) return
      setTimeout(() => {
        this.retryDelay = Math.min(this.retryDelay * 2, this.maxDelay)
        this.connect()
      }, this.retryDelay)
    }

    this.ws.onopen = () => {
      this.retryDelay = 1000
    }
  }

  on(handler: WsHandler) {
    this.handlers.push(handler)
    return () => { this.handlers = this.handlers.filter((h) => h !== handler) }
  }

  disconnect() {
    this.stopped = true
    this.ws?.close()
    this.ws = null
  }

  get readyState() {
    return this.ws?.readyState ?? WebSocket.CLOSED
  }
}
