import Link from "next/link"
import { cn } from "@/lib/utils"

export const GITHUB_URL = "https://github.com/portfolio-ltd/gravel"

/** Gravel's mark: three stacked stones, drawn in the current accent. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/30", className)}>
      <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" fill="currentColor" aria-hidden>
        <ellipse cx="12" cy="17.5" rx="8.5" ry="3.5" opacity="0.55" />
        <ellipse cx="11" cy="11.5" rx="6.5" ry="3" opacity="0.8" />
        <ellipse cx="12.5" cy="6" rx="4" ry="2.2" />
      </svg>
    </span>
  )
}

export function Logo({ href = "/", className, size = "md" }: { href?: string; className?: string; size?: "sm" | "md" }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={size === "sm" ? "h-7 w-7" : "h-8 w-8"} />
      <span className={cn("font-semibold tracking-tight", size === "sm" ? "text-sm" : "text-base")}>Gravel</span>
    </Link>
  )
}

export function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  )
}
