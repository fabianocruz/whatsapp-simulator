#!/usr/bin/env node
/**
 * Regenerates the README GIF by driving the real app in the installed Chrome.
 *
 * Frames are built by encoding simulator state into the URL hash rather than by clicking
 * through the UI, so a run is deterministic: the same commit always produces the same
 * frames, and a maintainer can regenerate after a UI change with one command instead of
 * re-recording a screencast.
 *
 * By default it serves the static export itself, so the whole thing is one command and the
 * frames carry no dev-mode overlay:
 *
 *   pnpm build:web && node scripts/capture-readme-gif.mjs
 *
 * Pass --url to shoot against an already-running server instead.
 */

import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
// gifenc ships CommonJS, so its exports arrive on the default object.
import gifenc from 'gifenc';

const { GIFEncoder, quantize, applyPalette } = gifenc;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    serve: { type: 'string', default: 'apps/web/out' },
    out: { type: 'string', default: 'docs/simulator.gif' },
    width: { type: 'string', default: '1400' },
    height: { type: 'string', default: '1220' },
    'frame-ms': { type: 'string', default: '1600' },
  },
});

const VIEWPORT = { width: Number(values.width), height: Number(values.height) };

/** Mirrors apps/web/lib/url-hash.ts. Kept tiny on purpose; the format is one JSON blob. */
function encodeState(state) {
  const wire = {
    v: 1,
    m: state.messages,
    mk: state.market,
    c: state.currency,
    a: state.asOf,
    cpm: state.conversationsPerMonth ?? 0,
    pn: state.phoneNumbers ?? 1,
    cmp: state.compare ? 1 : 0,
    l: state.locale ?? 'pt',
  };
  return Buffer.from(JSON.stringify(wire), 'utf8').toString('base64url');
}

// Read the scenario file directly rather than importing the TypeScript package: this is a
// plain Node script, and the JSON is the same file the package ships.
const scenario = JSON.parse(readFileSync(join(REPO_ROOT, 'examples/worked-example-spec.json'), 'utf8'));
const base = { market: 'BR', currency: 'BRL', asOf: '2026-09-01', locale: 'pt' };

/**
 * The worked example, revealed one message at a time: a marketing template that costs,
 * a customer reply that opens the window, two free replies inside it, and one utility
 * template after it closes. Then the October comparison, which is the teaching moment.
 */
const FRAMES = [
  { label: 'template de marketing', state: { ...base, messages: scenario.messages.slice(0, 1) } },
  { label: 'cliente responde, CSW abre', state: { ...base, messages: scenario.messages.slice(0, 2) } },
  { label: 'resposta livre, gratis na janela', state: { ...base, messages: scenario.messages.slice(0, 3) } },
  { label: 'utility dentro da janela, gratis', state: { ...base, messages: scenario.messages.slice(0, 4) } },
  { label: 'utility fora da janela, cobrado', state: { ...base, messages: scenario.messages } },
  { label: 'comparacao com 01/10/2026', state: { ...base, messages: scenario.messages, compare: true }, hold: 2 },
  { label: 'mesmo fluxo no ruleset de outubro', state: { ...base, messages: scenario.messages, asOf: '2026-10-01' }, hold: 3 },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

/** Serves the exported site. Just enough of a static server to render the app. */
async function serveStatic(root) {
  if (!existsSync(root)) {
    throw new Error(`${root} does not exist — run "pnpm build:web" first, or pass --url`);
  }
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const candidates = [join(root, path), join(root, path, 'index.html'), join(root, `${path}.html`)];
    const file = candidates.find((c) => existsSync(c) && statSync(c).isFile());
    if (!file) {
      response.writeHead(404).end('not found');
      return;
    }
    const ext = file.slice(file.lastIndexOf('.'));
    response.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

function decodePng(buffer) {
  const png = PNG.sync.read(buffer);
  return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
}

async function main() {
  const served = values.url ? null : await serveStatic(join(REPO_ROOT, values.serve));
  const origin = values.url ?? served.origin;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });

  const shots = [];
  for (const frame of FRAMES) {
    await page.goto(`${origin}/#s=${encodeState(frame.state)}`, { waitUntil: 'networkidle' });
    // The app reads the hash in an effect, so a same-document hash change would not
    // re-render on its own; reload keeps every frame on the same code path.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#main', { state: 'visible' });
    await page.waitForTimeout(450);

    // Clip to the app itself: the page header is prose that repeats the README, and the
    // phone frame is 740px tall, so a plain viewport shot cuts its input bar off.
    const buffer = await page.locator('#main').screenshot({ type: 'png' });
    const shot = decodePng(buffer);
    for (let i = 0; i < (frame.hold ?? 1); i += 1) shots.push(shot);
    process.stdout.write(`captured: ${frame.label}\n`);
  }

  await browser.close();
  if (served) await served.close();

  const { width, height } = shots[0];
  const encoder = GIFEncoder();
  for (const shot of shots) {
    const palette = quantize(shot.data, 256);
    const index = applyPalette(shot.data, palette);
    encoder.writeFrame(index, width, height, { palette, delay: Number(values['frame-ms']) });
  }
  encoder.finish();

  const target = join(REPO_ROOT, values.out);
  mkdirSync(dirname(target), { recursive: true });
  const bytes = encoder.bytes();
  writeFileSync(target, bytes);
  process.stdout.write(`wrote ${values.out} — ${shots.length} frames, ${width}x${height}, ${(bytes.length / 1_048_576).toFixed(2)} MB\n`);
}

await main();
