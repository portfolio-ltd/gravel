import AppShell from "@/components/AppShell"
import { OrgProvider } from "@/contexts/OrgContext"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <OrgProvider>
      <AppShell>{children}</AppShell>
    </OrgProvider>
  )
}
