import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PROTECTED = ["/home", "/knowledge", "/projects", "/users", "/settings", "/board", "/engineers", "/attention", "/integrations", "/workflows", "/organizations", "/prds"]
const PUBLIC_ONLY = ["/login", "/signup"]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasRefreshToken = request.cookies.has("gravel_refresh")

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p))
  const isPublicOnly = PUBLIC_ONLY.some((p) => pathname.startsWith(p))

  if (isProtected && !hasRefreshToken) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (isPublicOnly && hasRefreshToken) {
    return NextResponse.redirect(new URL("/home", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
