/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static: no backend in v1. The scenario lives in the URL hash and the rate cards
  // are bundled JSON, so the whole simulator runs in the browser.
  output: 'export',
  reactStrictMode: true,
  // Workspace packages ship TypeScript source rather than a build step.
  transpilePackages: ['@dyvit/whatsapp-pricing', '@dyvit/whatsapp-pricing-data', '@dyvit/whatsapp-tips', '@dyvit/whatsapp-scenarios'],
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
