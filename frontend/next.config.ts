import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/oauth/:path*", destination: `${apiUrl}/oauth/:path*` },
    ];
  },
};

export default nextConfig;
