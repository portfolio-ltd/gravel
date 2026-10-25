"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FileText, Plus, MessageSquare } from "lucide-react"
import { usePRDs } from "@/hooks/usePRDs"
import TagChip from "@/components/TagChip"
import { Button } from "@/components/ui/button"
import { cn, formatRelativeTime } from "@/lib/utils"
import type { PRDStatus } from "@/types"

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", in_review: "In Review", approved: "Approved",
  converted: "Converted", archived: "Archived",
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  in_review: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  converted: "bg-blue-100 text-blue-700",
  archived: "bg-slate-100 text-slate-400",
}

const FILTERS: (PRDStatus | "")[] = ["", "draft", "in_review", "approved", "converted", "archived"]

export default function PRDsPage() {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<PRDStatus | "">("")
  const { data: prds, isLoading } = usePRDs(statusFilter)

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">PRDs</h1>
          </div>
          <Button size="sm" onClick={() => router.push("/prds/new")}>
            <Plus className="w-3.5 h-3.5" /> New PRD
          </Button>
        </div>

        <div className="flex items-center gap-1.5 mb-5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f || "all"}
              onClick={() => setStatusFilter(f)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-colors",
                statusFilter === f ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
              )}
            >
              {f ? STATUS_LABELS[f] : "All"}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading PRDs…</div>
        ) : prds && prds.length > 0 ? (
          <div className="space-y-3">
            {prds.map((prd) => (
              <Link
                key={prd.id}
                href={`/prds/${prd.id}`}
                className="block bg-background rounded-xl border p-4 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{prd.title}</span>
                  <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", STATUS_COLORS[prd.status])}>
                    {STATUS_LABELS[prd.status]}
                  </span>
                  {prd.tags.map((t) => <TagChip key={t.id} tag={t} size="xs" />)}
                </div>
                {prd.summary && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{prd.summary}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" /> {prd.comment_count}
                  </span>
                  <span>updated {formatRelativeTime(prd.updated_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="font-semibold mb-1">No PRDs yet</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Draft requirements, refine them with AI chat, then convert them into tasks.
            </p>
            <Button size="sm" onClick={() => router.push("/prds/new")}>
              <Plus className="w-3.5 h-3.5" /> Create PRD
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
