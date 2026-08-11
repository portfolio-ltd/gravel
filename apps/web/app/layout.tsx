import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/contexts/AuthContext"
import { QueryProvider } from "@/contexts/QueryProvider"
import { Toaster } from "sonner"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Gravel — AI-powered engineering",
  description: "Upload a PRD. Get a working product. AI engineers groom, build, test, and ship behind human approval gates.",
  openGraph: {
    title: "Gravel — AI-powered engineering",
    description: "Upload a PRD. Get a working product. AI engineers groom, build, test, and ship behind human approval gates.",
    type: "website",
    siteName: "Gravel",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gravel — AI-powered engineering",
    description: "Upload a PRD. Get a working product. AI engineers groom, build, test, and ship behind human approval gates.",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <QueryProvider>
          <AuthProvider>
            {children}
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
