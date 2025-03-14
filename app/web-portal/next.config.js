/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  trailingSlash: false,
  // Enable source maps in production for better error tracking
  productionBrowserSourceMaps: true
};

module.exports = nextConfig; 