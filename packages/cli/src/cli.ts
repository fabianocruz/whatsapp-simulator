import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { listScenarios, runPrice } from './commands/price.js';
import { runServe } from './commands/serve.js';
import type { Locale } from './format.js';
import type { Currency } from '@dyvit/whatsapp-pricing';

const HELP = `dyvit-wa-sim · WhatsApp Business Platform cost simulator

Usage
  dyvit-wa-sim price [options]      price a conversation scenario
  dyvit-wa-sim serve [options]      run a local Cloud API emulator with live pricing
  dyvit-wa-sim scenarios            list the bundled scenarios

price options
  --scenario <slug>                 bundled scenario to price (default: worked-example-spec)
  --file <path>                     scenario JSON file: { "messages": [...] }
  --as-of <YYYY-MM-DD>              ruleset to price under (default: the scenario's, else today)
  --market <XX>                     recipient market (default: BR)
  --currency <BRL|USD>              currency (default: BRL)
  --per-month <n>                   projected conversations per month, enables the monthly projection
  --numbers <n>                     phone numbers the volume is spread across (default: 1)
  --compare                         also price the same timeline under the 2026-10-01 ruleset
  --csv <path>                      write the per-message breakdown to a CSV file
  --json                            print machine-readable output instead of the table
  --locale <pt|en>                  output language (default: pt)

serve options
  --port <n>                        port to listen on (default: 4190)
  --host <addr>                     address to bind (default: 127.0.0.1)
  --webhook <url>                   POST status and inbound webhooks here
  --app-secret <secret>             sign webhooks with X-Hub-Signature-256
  --as-of <YYYY-MM-DD>              ruleset to price under (default: today)
  --market <XX> --currency <C>      market and currency for pricing
  --default-category <cat>          template category assumed when a send omits it (default: utility)

Educational simulation. No real messages are sent and the official bill is Meta's.
`;

function fail(message: string): never {
  process.stderr.write(`dyvit-wa-sim: ${message}\n\nRun "dyvit-wa-sim --help" for usage.\n`);
  process.exit(2);
}

function parseCount(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) fail(`${flag} must be a non-negative number, got "${value}"`);
  return Math.floor(parsed);
}

function parseLocale(value: string | undefined): Locale {
  if (value === undefined) return 'pt';
  if (value !== 'pt' && value !== 'en') fail(`--locale must be pt or en, got "${value}"`);
  return value;
}

function parseCurrency(value: string | undefined): Currency | undefined {
  if (value === undefined) return undefined;
  const upper = value.toUpperCase();
  if (upper !== 'BRL' && upper !== 'USD') fail(`--currency must be BRL or USD, got "${value}"`);
  return upper;
}

export async function main(argv: readonly string[]): Promise<number> {
  const [command = 'price', ...rest] = argv;

  if (command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(HELP);
    return 0;
  }
  if (command === 'scenarios') {
    process.stdout.write(`${listScenarios()}\n`);
    return 0;
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: [...rest],
      allowPositionals: false,
      options: {
        help: { type: 'boolean', short: 'h' },
        scenario: { type: 'string' },
        file: { type: 'string' },
        'as-of': { type: 'string' },
        market: { type: 'string' },
        currency: { type: 'string' },
        'per-month': { type: 'string' },
        numbers: { type: 'string' },
        compare: { type: 'boolean' },
        csv: { type: 'string' },
        json: { type: 'boolean' },
        locale: { type: 'string' },
        port: { type: 'string' },
        host: { type: 'string' },
        webhook: { type: 'string' },
        'app-secret': { type: 'string' },
        'default-category': { type: 'string' },
      },
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const values = parsed.values;
  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }

  if (command === 'serve') {
    return runServe({
      port: parseCount(values.port, '--port') ?? 4190,
      ...(values.host ? { host: values.host } : {}),
      ...(values.webhook ? { webhookUrl: values.webhook } : {}),
      ...(values['app-secret'] ? { appSecret: values['app-secret'] } : {}),
      ...(values['as-of'] ? { asOf: values['as-of'] } : {}),
      ...(values.market ? { market: values.market } : {}),
      ...(parseCurrency(values.currency) ? { currency: parseCurrency(values.currency)! } : {}),
      ...(values['default-category'] ? { defaultTemplateCategory: values['default-category'] } : {}),
    });
  }

  if (command !== 'price') fail(`unknown command "${command}"`);

  return runPrice({
    ...(values.scenario ? { scenario: values.scenario } : {}),
    ...(values.file ? { file: values.file } : {}),
    ...(values['as-of'] ? { asOf: values['as-of'] } : {}),
    ...(values.market ? { market: values.market } : {}),
    ...(parseCurrency(values.currency) ? { currency: parseCurrency(values.currency)! } : {}),
    ...(parseCount(values['per-month'], '--per-month') === undefined
      ? {}
      : { conversationsPerMonth: parseCount(values['per-month'], '--per-month')! }),
    ...(parseCount(values.numbers, '--numbers') === undefined
      ? {}
      : { phoneNumbers: parseCount(values.numbers, '--numbers')! }),
    ...(values.csv ? { csv: values.csv } : {}),
    locale: parseLocale(values.locale),
    json: values.json === true,
    compare: values.compare === true,
  });
}

// Only run when this file IS the entrypoint, so tests can import `main` freely. Comparing
// module URLs is the check that survives bundling, symlinked bins and tsx.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`dyvit-wa-sim: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
