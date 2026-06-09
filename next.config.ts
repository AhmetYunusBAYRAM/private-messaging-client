import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:5032/api/:path*",
      },
      {
        source: "/chat/:path*",
        destination: "http://localhost:5032/chat/:path*",
      },
    ];
  },
};

export default nextConfig;
