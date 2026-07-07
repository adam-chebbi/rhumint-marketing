/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    CENTRAL_API_URL: process.env.CENTRAL_API_URL ?? "",
    CENTRAL_API_KEY: process.env.CENTRAL_API_KEY ?? "",
  },
};

module.exports = nextConfig;
