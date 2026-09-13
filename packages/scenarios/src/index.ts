import type { Currency, SimMessage } from '@dyvit/whatsapp-pricing';

// The scenario files live at the repo root under examples/ so contributors can find and
// add them without reading the package layout. This module is the single place that
// knows that path; every consumer imports from here.
import fepClickToWhatsapp from '../../../examples/fep-click-to-whatsapp.json';
import otpAuthentication from '../../../examples/otp-authentication.json';
import suporteLongo from '../../../examples/suporte-longo.json';
import negociacaoRica from '../../../examples/negociacao-rica.json';
import workedExample from '../../../examples/worked-example-spec.json';

export interface Scenario {
  /** Slug used in URLs and CLI arguments. */
  slug: string;
  name: string;
  description: string;
  market: string;
  currency: Currency;
  /** Default "rules as of" date for this scenario. */
  asOf: string;
  messages: SimMessage[];
}

function scenario(slug: string, raw: unknown): Scenario {
  const data = raw as Omit<Scenario, 'slug'>;
  return { slug, ...data };
}

export const SCENARIOS: readonly Scenario[] = Object.freeze([
  scenario('worked-example-spec', workedExample),
  scenario('fep-click-to-whatsapp', fepClickToWhatsapp),
  scenario('suporte-longo', suporteLongo),
  scenario('otp-authentication', otpAuthentication),
  scenario('negociacao-rica', negociacaoRica),
]);

export function getScenario(slug: string): Scenario {
  const found = SCENARIOS.find((s) => s.slug === slug);
  if (!found) {
    throw new Error(`unknown scenario "${slug}"; available: ${SCENARIOS.map((s) => s.slug).join(', ')}`);
  }
  return found;
}
