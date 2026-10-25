import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { apiFetch } from "./api"
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
})
