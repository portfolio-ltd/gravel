"use client"

import { useRouter } from "next/navigation"
import { Building2, Check, ChevronsUpDown, Settings2 } from "lucide-react"
import { useOrg } from "@/contexts/OrgContext"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown"
import { cn } from "@/lib/utils"

export default function OrgSwitcher() {
  const router = useRouter()
  const { orgs, activeOrg, setActiveOrg } = useOrg()

  if (!activeOrg) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-lg border bg-background/60 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
          <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="flex-1 truncate text-left">{activeOrg.name}</span>
          <ChevronsUpDown className="w-3 h-3 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Organizations
        </DropdownMenuLabel>
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => org.id !== activeOrg.id && setActiveOrg(org.id)}
            className={cn(org.id === activeOrg.id && "font-semibold")}
          >
            <Check className={cn("w-3.5 h-3.5", org.id === activeOrg.id ? "opacity-100" : "opacity-0")} />
            <span className="truncate">{org.name}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">{org.role}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/organizations")}>
          <Settings2 className="w-3.5 h-3.5" /> Manage organizations
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
