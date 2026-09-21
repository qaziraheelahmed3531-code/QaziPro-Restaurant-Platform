import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "developers.google.com" }],
  },
  experimental: {
    serverActions: {
      allowedOrigins: (process.env.PLATFORM_ALLOWED_ORIGINS ?? "localhost:3002")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    },
  },
}

export default nextConfig
