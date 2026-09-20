import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
}

export default nextConfig
