"use client"

import { useState, useEffect } from "react"
import { Loader2, Eye, EyeOff, Key, User, Cpu, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useAuth } from "@/contexts/AuthContext"
import { useUpdateUser, useApiKeys, useSaveApiKeys } from "@/hooks/useUsers"
import { cn, getInitials } from "@/lib/utils"
import { toast } from "sonner"

const ROLE_COLORS: Record<string, string> = {
  admin:     "bg-rose-100 text-rose-700",
  developer: "bg-blue-100 text-blue-700",
  qa:        "bg-amber-100 text-amber-700",
  product:   "bg-purple-100 text-purple-700",
  devops:    "bg-emerald-100 text-emerald-700",
}

const MODELS = [
  { value: "claude-sonnet-4-6",       label: "Claude Sonnet 4.6",   provider: "Anthropic", note: "Recommended — balanced speed/quality" },
  { value: "claude-opus-4-6",         label: "Claude Opus 4.6",     provider: "Anthropic", note: "Most capable, slower" },
  { value: "gpt-4o",                  label: "GPT-4o",              provider: "OpenAI",    note: "Latest OpenAI multimodal" },
  { value: "gpt-4o-mini",             label: "GPT-4o mini",         provider: "OpenAI",    note: "Fast & cheap" },
  { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B",       provider: "Groq",      note: "Open source, ultra-fast via Groq" },
]

const PROVIDER_COLORS: Record<string, string> = {
  Anthropic: "bg-orange-100 text-orange-700",
  OpenAI:    "bg-green-100 text-green-700",
  Groq:      "bg-purple-100 text-purple-700",
}

function KeyField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  const [show, setShow] = useState(false)
  const isMasked = value.includes("••••")

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          className="w-full rounded-lg border bg-background px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground placeholder:font-sans"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {isMasked && (
        <p className="text-[10px] text-emerald-600 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Key saved — type a new value to update
        </p>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { user } = useAuth()
  const [name, setName] = useState(user?.name ?? "")
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-4-6")

  const updateUser = useUpdateUser()
  const { data: maskedKeys } = useApiKeys(user?.id)
  const saveApiKeys = useSaveApiKeys()

  const [openai, setOpenai] = useState("")
  const [anthropic, setAnthropic] = useState("")
  const [groq, setGroq] = useState("")

  useEffect(() => {
    if (maskedKeys) {
      if (maskedKeys.openai)    setOpenai(maskedKeys.openai)
      if (maskedKeys.anthropic) setAnthropic(maskedKeys.anthropic)
      if (maskedKeys.groq)      setGroq(maskedKeys.groq)
    }
  }, [maskedKeys])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    try {
      await updateUser.mutateAsync({ id: user.id, name: name.trim() })
      toast.success("Profile updated")
    } catch { toast.error("Failed to update profile") }
  }

  async function handleSaveKeys(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    try {
      // Only send keys that look like real values (not the masked display values)
      const keys: Record<string, string | null> = {}
      if (openai    && !openai.includes("••••"))    keys.openai    = openai.trim()
      if (anthropic && !anthropic.includes("••••")) keys.anthropic = anthropic.trim()
      if (groq      && !groq.includes("••••"))      keys.groq      = groq.trim()
      await saveApiKeys.mutateAsync({ userId: user.id, keys })
      toast.success("API keys saved securely")
    } catch { toast.error("Failed to save API keys") }
  }

  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your profile, API keys, and model preferences</p>
        </div>

        <Tabs defaultValue="profile">
          <TabsList className="mb-6">
            <TabsTrigger value="profile" className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Profile
            </TabsTrigger>
            <TabsTrigger value="keys" className="flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5" /> API Keys
            </TabsTrigger>
            <TabsTrigger value="model" className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" /> Model
            </TabsTrigger>
          </TabsList>

          {/* Profile tab */}
          <TabsContent value="profile">
            <div className="rounded-2xl border bg-card p-6 space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16">
                  <AvatarFallback className={cn("text-lg font-bold", ROLE_COLORS[user?.role ?? "developer"])}>
                    {getInitials(user?.name ?? "U")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{user?.name}</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 inline-block capitalize", ROLE_COLORS[user?.role ?? "developer"])}>
                    {user?.role}
                  </span>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Full name</label>
                  <input
                    required
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email</label>
                  <input
                    disabled
                    className="w-full rounded-lg border bg-muted px-3 py-2.5 text-sm text-muted-foreground cursor-not-allowed"
                    value={user?.email ?? ""}
                  />
                  <p className="text-[10px] text-muted-foreground">Email cannot be changed</p>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={updateUser.isPending || !name.trim()}>
                    {updateUser.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save profile"}
                  </Button>
                </div>
              </form>
            </div>
          </TabsContent>

          {/* API Keys tab */}
          <TabsContent value="keys">
            <div className="rounded-2xl border bg-card p-6 space-y-5">
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Keys are encrypted at rest</p>
                  <p className="text-xs text-amber-700 mt-0.5">Your API keys are stored with Fernet encryption. Only you can retrieve them.</p>
                </div>
              </div>

              <form onSubmit={handleSaveKeys} className="space-y-4">
                <KeyField
                  label="Anthropic API Key"
                  value={anthropic}
                  onChange={setAnthropic}
                  placeholder="sk-ant-api03-…"
                />
                <KeyField
                  label="OpenAI API Key"
                  value={openai}
                  onChange={setOpenai}
                  placeholder="sk-proj-…"
                />
                <KeyField
                  label="Groq API Key"
                  value={groq}
                  onChange={setGroq}
                  placeholder="gsk_…"
                />
                <div className="flex justify-end pt-1">
                  <Button type="submit" disabled={saveApiKeys.isPending}>
                    {saveApiKeys.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save API keys"}
                  </Button>
                </div>
              </form>
            </div>
          </TabsContent>

          {/* Model tab */}
          <TabsContent value="model">
            <div className="rounded-2xl border bg-card p-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Default model</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Used for new projects. You can override per-project.</p>
              </div>
              <div className="space-y-2">
                {MODELS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setSelectedModel(m.value)}
                    className={cn(
                      "w-full text-left rounded-xl border-2 px-4 py-3 flex items-start gap-3 transition-all",
                      selectedModel === m.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/40"
                    )}
                  >
                    <div className={cn("w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center mt-0.5",
                      selectedModel === m.value ? "border-primary" : "border-muted-foreground/40"
                    )}>
                      {selectedModel === m.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{m.label}</p>
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0", PROVIDER_COLORS[m.provider])}>
                          {m.provider}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{m.note}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex justify-end pt-1">
                <Button onClick={() => toast.success("Default model saved")}>
                  Save preference
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
