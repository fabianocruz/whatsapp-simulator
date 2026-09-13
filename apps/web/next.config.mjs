import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The simulator lives inside the dyvit.ai repo, which carries its own package-lock.json.
  // Without this, Next picks that as the workspace root and traces files from the parent
  // Astro project into this build.
  outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), '..', '..'),
  // Fully static: no backend in v1. The scenario lives in the URL hash and the rate cards
  // are bundled JSON, so the whole simulator runs in the browser.
  output: 'export',
  // `next dev` e `next build` escreviam no mesmo .next, e alternar entre os dois corrompe
  // o cache: o dev quebra com "Expected clientReferenceManifest to be defined", que o
  // proprio Next reporta como bug dele. Este projeto alterna o tempo todo, porque o build
  // estatico alimenta a captura do GIF e o CI.
  //
  // So o dev muda de pasta. Producao fica no padrao de proposito: com `output: 'export'`,
  // o distDir tambem move a saida do export, e apontar producao para outro lugar levaria
  // o site exportado para dentro da pasta de build em vez de `out/`.
  ...(process.env.NODE_ENV === 'production' ? {} : { distDir: '.next-dev' }),
  reactStrictMode: true,
  // Workspace packages ship TypeScript source rather than a build step.
  transpilePackages: ['@dyvit/whatsapp-pricing', '@dyvit/whatsapp-pricing-data', '@dyvit/whatsapp-tips', '@dyvit/whatsapp-scenarios'],
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
