import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { apiFetch, apiFetchLong } from "./api"
import { ApiError } from "@/types"
import { setTokens, clearTokens } from "./auth"

const realFetch = global.fetch

describe("apiFetch", () => {
  beforeEach(() => setTokens("test-token", "test-refresh"))
  afterEach(() => {
    global.fetch = realFetch
    clearTokens()
  })

  it("attaches the bearer token and parses JSON", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })
    )
    global.fetch = mock as unknown as typeof fetch
    const result = await apiFetch<{ ok: boolean }>("/api/health-ish")
    expect(result.ok).toBe(true)
    const [, init] = mock.mock.calls[0]
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token")
  })

  it("throws ApiError with the server detail on non-retryable errors", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Nope" }), { status: 403, headers: { "content-type": "application/json" } })
    ) as unknown as typeof fetch
    await expect(apiFetch("/api/forbidden")).rejects.toMatchObject({ status: 403, detail: "Nope" })
    await expect(apiFetch("/api/forbidden")).rejects.toBeInstanceOf(ApiError)
  })

  it("surfaces the server detail on a 401 when no token was sent", async () => {
    clearTokens()
    const mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Invalid email or password." }), { status: 401, headers: { "content-type": "application/json" } })
    )
    global.fetch = mock as unknown as typeof fetch
    await expect(apiFetch("/api/auth/login", { method: "POST" })).rejects.toMatchObject({ status: 401, detail: "Invalid email or password." })
    // No refresh attempt — only the original request went out
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it("does not refresh a 401 when retry is disabled", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Invalid email or password." }), { status: 401, headers: { "content-type": "application/json" } })
    )
    global.fetch = mock as unknown as typeof fetch
    await expect(apiFetch("/api/auth/login", { method: "POST" }, false)).rejects.toMatchObject({ status: 401, detail: "Invalid email or password." })
    expect(mock).toHaveBeenCalledTimes(1)
  })
})

describe("apiFetchLong", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

  beforeEach(() => {
    setTokens("test-token", "test-refresh")
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    global.fetch = realFetch
    clearTokens()
  })

  it("asks for an async answer, then polls until the real response is ready", async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(json({ operation_id: "op1", status: "running", poll: "/api/operations/op1" }, 202))
      .mockResolvedValueOnce(json({ id: "op1", status: "running", http_status: null, body: null }))
      .mockResolvedValueOnce(json({ id: "op1", status: "done", http_status: 200, body: { task_titles: ["A"] } }))
    global.fetch = mock as unknown as typeof fetch
    const pending = apiFetchLong<{ task_titles: string[] }>("/api/prds/p/split", { method: "POST" })
    await vi.runAllTimersAsync()
    expect(await pending).toEqual({ task_titles: ["A"] })
    expect((mock.mock.calls[0][1].headers as Record<string, string>).Prefer).toBe("respond-async")
    expect(mock.mock.calls[2][0]).toMatch(/\/api\/operations\/op1$/)
  })

  it("turns a failed operation into the same ApiError a direct call would throw", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(json({ operation_id: "op2", status: "running", poll: "/api/operations/op2" }, 202))
      .mockResolvedValueOnce(json({ id: "op2", status: "done", http_status: 404, body: { detail: "PRD not found" } })) as unknown as typeof fetch
    const pending = apiFetchLong("/api/prds/x/chat", { method: "POST" })
    const assertion = expect(pending).rejects.toMatchObject({ status: 404, detail: "PRD not found" })
    await vi.runAllTimersAsync()
    await assertion
  })

  it("passes a direct answer straight through", async () => {
    global.fetch = vi.fn().mockResolvedValue(json({ task_titles: ["B"] })) as unknown as typeof fetch
    expect(await apiFetchLong("/api/prds/p/split", { method: "POST" })).toEqual({ task_titles: ["B"] })
  })
})
