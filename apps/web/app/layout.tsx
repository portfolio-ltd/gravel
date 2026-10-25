import type { Metadata, Viewport } from "next"
import { Geist, IBM_Plex_Sans, Inter, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/contexts/AuthContext"
import { PreferencesProvider } from "@/contexts/PreferencesContext"
import { QueryProvider } from "@/contexts/QueryProvider"
import ThemedToaster from "@/components/ThemedToaster"
import { THEME_BOOT_SCRIPT } from "@/lib/theme"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" })
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" })
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex", display: "swap" })
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" })

const description =
  "Open-source, spec-driven AI engineering. Turn a PRD or GitHub issues into analyzed specs, " +
  "reviewed plans and verified code — with a human approving every gate."

export const metadata: Metadata = {
  title: { default: "Gravel — spec-driven AI engineering", template: "%s · Gravel" },
  description,
  openGraph: { title: "Gravel — spec-driven AI engineering", description, type: "website", siteName: "Gravel" },
  twitter: { card: "summary_large_image", title: "Gravel — spec-driven AI engineering", description },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1015" },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geist.variable} ${plex.variable} ${jetbrains.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <QueryProvider>
          <AuthProvider>
            <PreferencesProvider>
              {children}
              <ThemedToaster />
            </PreferencesProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
