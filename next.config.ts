import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "snaptrade-typescript-sdk"],
};

export default nextConfig;
