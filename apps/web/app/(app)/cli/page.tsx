"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Loader2, Terminal, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/form"
import { Page, PageHeader, SectionCard } from "@/components/ui/page"
import { useDecideDeviceLogin, useDeviceLogin } from "@/hooks/useApiTokens"
import { useAuth } from "@/contexts/AuthContext"

/** Approve a device login started by `gravel login` or the VS Code extension. */
function DeviceApproval() {
  const params = useSearchParams()
  const { user } = useAuth()
  const [typed, setTyped] = useState(params.get("code") ?? "")
  const [code, setCode] = useState<string | null>(params.get("code"))
  const { data: login, isLoading, error } = useDeviceLogin(code)
  const decide = useDecideDeviceLogin()
  const [result, setResult] = useState<"approved" | "denied" | null>(null)

  async function handle(approve: boolean) {
    if (!login) return
    await decide.mutateAsync({ user_code: login.user_code, approve })
    setResult(approve ? "approved" : "denied")
  }

  return (
    <Page>
      <PageHeader icon={<Terminal className="h-4 w-4" />} title="Sign in a device"
        description="Approve a sign-in from the gravel CLI or the VS Code extension." />
      <SectionCard className="max-w-lg">
        {result === "approved" ? (
          <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-success" /> Approved — you can go back to your terminal or editor.</p>
        ) : result === "denied" ? (
          <p className="flex items-center gap-2 text-sm"><XCircle className="h-4 w-4 text-destructive" /> Denied — nothing was signed in.</p>
        ) : !code ? (
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); setCode(typed.trim()) }}>
            <Field label="Code shown by the client" className="flex-1">
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="ABCD-EFGH" className="font-mono uppercase" autoFocus />
            </Field>
            <Button type="submit" size="sm" className="h-9" disabled={!typed.trim()}>Continue</Button>
          </form>
        ) : isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" />
        ) : error || !login ? (
          <div className="space-y-3 text-sm">
            <p>{error instanceof Error ? error.message : "This code is unknown or has expired."}</p>
            <Button size="sm" variant="outline" onClick={() => { setCode(null); setTyped("") }}>Enter another code</Button>
          </div>
        ) : login.status !== "pending" ? (
          <p className="text-sm">This sign-in was already {login.status}.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm">
              <b>{login.client_name}</b> wants to act as <b>{user?.email}</b> on Gravel.
              Approve only if you just started this sign-in and the code below matches the one it shows.
            </p>
            <p className="rounded-lg bg-muted py-3 text-center font-mono text-2xl font-semibold tracking-widest">{login.user_code}</p>
            <div className="flex gap-2">
              <Button onClick={() => handle(true)} disabled={decide.isPending}>
                {decide.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Approve
              </Button>
              <Button variant="outline" onClick={() => handle(false)} disabled={decide.isPending}>Deny</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">It gets an API token you can revoke any time under Settings → CLI &amp; tokens.</p>
          </div>
        )}
      </SectionCard>
    </Page>
  )
}

export default function CliPage() {
  return (
    <Suspense fallback={null}>
      <DeviceApproval />
    </Suspense>
  )
}
