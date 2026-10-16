/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @juma/shared ships compiled CommonJS from the workspace; let Next bundle it.
  transpilePackages: ['@juma/shared'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
