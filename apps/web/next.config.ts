import type { NextConfig } from "next"

const API_URL = process.env.API_URL?.replace(/\/$/, "")

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them with the app.
  transpilePackages: ["@greencircuits/market", "@greencircuits/contracts"],
  // Client components fetch bars from /api/v1/*, proxied to the API so the browser stays same-origin.
  async rewrites() {
    return API_URL ? [{ source: "/api/v1/:path*", destination: `${API_URL}/v1/:path*` }] : []
  },
}

export default nextConfig
