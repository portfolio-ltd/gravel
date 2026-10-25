"use client"

import { Suspense, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CheckCircle2, Cpu, Eye, EyeOff, Loader2, Lock, Palette, Settings, User } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
import { usePreferences } from "@/contexts/PreferencesContext"
import { useApiKeys, useSaveApiKeys, useUpdateUser } from "@/hooks/useUsers"
import { useMeta } from "@/hooks/useSdlc"
import AppearanceSettings from "@/components/settings/AppearanceSettings"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/form"
import { Page, PageHeader, SectionCard } from "@/components/ui/page"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ModelOption } from "@/types"
import { cn, getInitials } from "@/lib/utils"

const TABS = ["appearance", "models", "profile"] as const
type Tab = (typeof TABS)[number]

const PROVIDERS: { key: ModelOption["provider"]; label: string; placeholder: string; url: string }[] = [
  { key: "anthropic", label: "Anthropic", placeholder: "sk-ant-api03-…", url: "https://console.anthropic.com/settings/keys" },
  { key: "openai", label: "OpenAI", placeholder: "sk-proj-…", url: "https://platform.openai.com/api-keys" },
  { key: "groq", label: "Groq", placeholder: "gsk_…", url: "https://console.groq.com/keys" },
]

function KeyField({ label, value, onChange, placeholder, url }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; url: string
}) {
  const [show, setShow] = useState(false)
  const saved = value.includes("••••")
  return (
    <Field
      label={`${label} API key`}
      hint={saved
        ? <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-3 w-3" /> Saved — type a new value to replace it</span>
        : <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">Get a key from {label} ↗</a>}
    >
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          className="pr-10 font-mono"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide key" : "Show key"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </Field>
  )
}

function ModelsTab() {
  const { user } = useAuth()
  const { prefs, update } = usePreferences()
  const { data: meta } = useMeta()
  const { data: masked } = useApiKeys(user?.id)
  const saveKeys = useSaveApiKeys()
  const [keys, setKeys] = useState<Record<string, string>>({ anthropic: "", openai: "", groq: "" })

  useEffect(() => {
    if (masked) setKeys({ anthropic: masked.anthropic ?? "", openai: masked.openai ?? "", groq: masked.groq ?? "" })
  }, [masked])

  const configured = new Set(PROVIDERS.filter((p) => masked?.[p.key]).map((p) => p.key))
  const selected = prefs.defaultModel ?? meta?.default_model

  async function handleSaveKeys(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    const changed = Object.fromEntries(
      Object.entries(keys).filter(([, v]) => v && !v.includes("••••")).map(([k, v]) => [k, v.trim()]),
    )
    if (!Object.keys(changed).length) { toast.info("No new keys to save"); return }
    try {
      await saveKeys.mutateAsync({ userId: user.id, keys: changed })
      toast.success("API keys saved")
    } catch {
      toast.error("Failed to save API keys")
    }
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="API keys"
        description="Bring your own keys. Engineers and AI features run on them; without any key Gravel runs in simulated mode."
      >
        <div className="mb-4 flex items-start gap-3 rounded-lg border bg-muted/40 px-3.5 py-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Keys are encrypted at rest (Fernet) and only ever shown masked. They&apos;re used for your projects&apos; in-process
            runs and passed to engineer runtimes you launch.
          </p>
        </div>
        <form onSubmit={handleSaveKeys} className="space-y-4">
          {PROVIDERS.map((p) => (
            <KeyField
              key={p.key}
              label={p.label}
              placeholder={p.placeholder}
              url={p.url}
              value={keys[p.key]}
              onChange={(v) => setKeys((k) => ({ ...k, [p.key]: v }))}
            />
          ))}
          <div className="flex justify-end">
            <Button type="submit" disabled={saveKeys.isPending}>
              {saveKeys.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save keys
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Default model" description="Preselected when you create a project. Each project can override it.">
        <div className="grid gap-2 sm:grid-cols-2">
          {(meta?.models ?? []).map((m) => {
            const active = selected === m.id
            const ready = configured.has(m.provider)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => update({ defaultModel: m.id === meta?.default_model ? null : m.id })}
                aria-pressed={active}
                className={cn(
                  "flex items-start gap-3 rounded-xl border-2 px-3.5 py-3 text-left transition-all",
                  active ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40",
                )}
              >
                <span className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                  active ? "border-primary" : "border-muted-foreground/40",
                )}>
                  {active && <span className="h-2 w-2 rounded-full bg-primary" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold">{m.label}</span>
                    {m.id === meta?.default_model && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Server default</span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{m.note}</span>
                  <span className={cn("mt-1 block text-[11px] capitalize", ready ? "text-success" : "text-muted-foreground")}>
                    {m.provider} · {ready ? "key configured" : "no key yet"}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </SectionCard>
    </div>
  )
}

function ProfileTab() {
  const { user } = useAuth()
  const updateUser = useUpdateUser()
  const [name, setName] = useState(user?.name ?? "")
  useEffect(() => { setName(user?.name ?? "") }, [user])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    try {
      await updateUser.mutateAsync({ id: user.id, name: name.trim() })
      toast.success("Profile updated")
    } catch {
      toast.error("Failed to update profile")
    }
  }

  return (
    <SectionCard title="Profile">
      <div className="mb-6 flex items-center gap-4">
        <Avatar className="h-14 w-14">
          <AvatarFallback className="bg-primary/15 text-lg font-semibold text-primary">{getInitials(user?.name ?? "U")}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold">{user?.name}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-primary">
            {user?.role}
          </span>
        </div>
      </div>
      <form onSubmit={save} className="max-w-md space-y-4">
        <Field label="Full name">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" hint="Email can't be changed.">
          <Input disabled value={user?.email ?? ""} />
        </Field>
        <Button type="submit" disabled={updateUser.isPending || !name.trim()}>
          {updateUser.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save profile
        </Button>
      </form>
    </SectionCard>
  )
}

function SettingsContent() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const requested = params.get("tab") as Tab | null
  const tab: Tab = requested && TABS.includes(requested) ? requested : "appearance"

  return (
    <Page>
      <PageHeader icon={<Settings className="h-4 w-4" />} title="Settings" description="Make Gravel yours — appearance, models and your profile." />
      <Tabs value={tab} onValueChange={(v) => router.replace(`${pathname}?tab=${v}`, { scroll: false })}>
        <TabsList className="mb-5">
          <TabsTrigger value="appearance" className="gap-1.5"><Palette className="h-3.5 w-3.5" /> Appearance</TabsTrigger>
          <TabsTrigger value="models" className="gap-1.5"><Cpu className="h-3.5 w-3.5" /> Models & keys</TabsTrigger>
          <TabsTrigger value="profile" className="gap-1.5"><User className="h-3.5 w-3.5" /> Profile</TabsTrigger>
        </TabsList>
        <TabsContent value="appearance"><AppearanceSettings /></TabsContent>
        <TabsContent value="models"><ModelsTab /></TabsContent>
        <TabsContent value="profile"><ProfileTab /></TabsContent>
      </Tabs>
    </Page>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  )
}
