import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Use standalone output for Docker
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
  experimental: {
    typedRoutes: false,
  },
}

export default nextConfig
