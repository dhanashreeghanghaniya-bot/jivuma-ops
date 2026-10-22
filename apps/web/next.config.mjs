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
};

export default withSerwist(nextConfig);
