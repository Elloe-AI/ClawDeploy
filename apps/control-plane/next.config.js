/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    serverActions: { allowedOrigins: ["clawdeploy.co", "localhost"] }
  }
};

module.exports = nextConfig;
