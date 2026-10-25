"use client"

import { createContext, useCallback, useContext, useEffect, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useOrganizations } from "@/hooks/useOrganizations"
import { getActiveOrgId, setActiveOrgId } from "@/lib/orgStore"
import type { Organization } from "@/types"

interface OrgContextValue {
  orgs: Organization[]
  activeOrg: Organization | null
  setActiveOrg: (orgId: string) => void
  isLoading: boolean
}

const OrgContext = createContext<OrgContextValue>({
  orgs: [],
  activeOrg: null,
  setActiveOrg: () => {},
  isLoading: true,
})

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const { data: orgs, isLoading } = useOrganizations()

  const activeOrg = useMemo(() => {
    if (!orgs || orgs.length === 0) return null
    const stored = getActiveOrgId()
    return orgs.find((o) => o.id === stored) ?? orgs[0]
  }, [orgs])

  // Heal a stale stored id (deleted org / removed membership)
  useEffect(() => {
    if (activeOrg && getActiveOrgId() !== activeOrg.id) {
      setActiveOrgId(activeOrg.id)
    }
  }, [activeOrg])

  const setActiveOrg = useCallback((orgId: string) => {
    setActiveOrgId(orgId)
    // Drop every cached query from the previous org's view
    qc.clear()
  }, [qc])

  return (
    <OrgContext.Provider value={{ orgs: orgs ?? [], activeOrg, setActiveOrg, isLoading }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  return useContext(OrgContext)
}
