import type { NextConfig } from "next"

const serverActionOrigins = Array.from(new Set([
  "localhost:3002",
  "superadmin.qazipro.com",
  ...(process.env.PLATFORM_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
]))

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  agentRules: false,
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "developers.google.com" }],
  },
  experimental: {
    serverActions: {
      allowedOrigins: serverActionOrigins,
    },
  },
}

export default nextConfig
