import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // A service worker in `next dev` caches stale bundles between edits. Build
  // and `next start` to test offline behaviour.
  disable: process.env.NODE_ENV === 'development',
  reloadOnOnline: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @juma/shared ships compiled CommonJS from the workspace; let Next bundle it.
  transpilePackages: ['@juma/shared'],
  eslint: { ignoreDuringBuilds: true },
  // In production the browser calls `/api/v1` on this site and Vercel forwards it
  // to the API host, so the refresh cookie is first-party and no CORS is needed.
  // Set API_PROXY_URL (e.g. https://juma-api.onrender.com) to turn it on.
  async rewrites() {
    const target = process.env.API_PROXY_URL?.replace(/\/+$/, '');
    return target ? [{ source: '/api/v1/:path*', destination: `${target}/api/v1/:path*` }] : [];
  },
};

export default withSerwist(nextConfig);
