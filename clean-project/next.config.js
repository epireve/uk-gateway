/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  trailingSlash: false,
  // Enable source maps in production for better error tracking
  productionBrowserSourceMaps: true,
  // Make sure the app works correctly on Vercel
  swcMinify: true
};

module.exports = nextConfig; 