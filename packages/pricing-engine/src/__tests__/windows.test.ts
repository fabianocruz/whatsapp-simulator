import { describe, expect, it } from 'vitest';
import { selectRuleSet } from '@dyvit/whatsapp-pricing-data';
import type { SimMessage } from '../types';
import { deriveWindows } from '../windows';

const RULES = selectRuleSet('2026-09-01');
const BASE = Date.UTC(2026, 8, 1, 9, 0, 0);

function at(hours: number): string {
  return new Date(BASE + hours * 3_600_000).toISOString();
}

let seq = 0;
function inbound(hours: number, entryPoint?: SimMessage['entryPoint']): SimMessage {
  seq += 1;
  return {
    id: `u${seq}`,
    direction: 'user_to_business',
    kind: 'non_template',
    category: 'service',
    sentAt: at(hours),
    status: 'delivered',
    ...(entryPoint ? { entryPoint } : {}),
  };
}
function outbound(hours: number): SimMessage {
  seq += 1;
  return {
    id: `b${seq}`,
    direction: 'business_to_user',
    kind: 'non_template',
    category: 'service',
    sentAt: at(hours),
    status: 'delivered',
  };
}

describe('customer service window', () => {
  it('opens on a customer message and closes exactly 24h later', () => {
    const { stateAt } = deriveWindows([inbound(0)], RULES);
    expect(stateAt(at(23.99)).cswOpen).toBe(true);
    // Half-open: the instant 24h after the customer message is already outside.
    expect(stateAt(at(24)).cswOpen).toBe(false);
    expect(stateAt(at(24.01)).cswOpen).toBe(false);
  });

  it('is closed before any customer message arrives', () => {
    const { stateAt } = deriveWindows([inbound(10)], RULES);
    const state = stateAt(at(5));
    expect(state.cswOpen).toBe(false);
    expect(state.cswOpenUntil).toBeNull();
  });

  it('restarts on every new customer message', () => {
    const { stateAt } = deriveWindows([inbound(0), inbound(20)], RULES);
    expect(stateAt(at(30)).cswOpen).toBe(true);
    expect(stateAt(at(44.01)).cswOpen).toBe(false);
  });

  it('is not reopened by business messages', () => {
    const { stateAt } = deriveWindows([inbound(0), outbound(20)], RULES);
    expect(stateAt(at(25)).cswOpen).toBe(false);
  });

  it('prices an unsorted timeline the same as a sorted one', () => {
    const sorted = deriveWindows([inbound(0), outbound(1)], RULES);
    const shuffled = deriveWindows([outbound(1), inbound(0)], RULES);
    expect(shuffled.sorted.map((m) => m.sentAt)).toEqual(sorted.sorted.map((m) => m.sentAt));
    expect(shuffled.states).toEqual(sorted.states);
  });
});

describe('free entry point window', () => {
  it('opens at the business reply and lasts 72h', () => {
    const { stateAt } = deriveWindows([inbound(0, 'click_to_whatsapp_ad'), outbound(2)], RULES);
    expect(stateAt(at(1)).fepActive).toBe(false);
    expect(stateAt(at(2)).fepActive).toBe(true);
    expect(stateAt(at(73.99)).fepActive).toBe(true);
    expect(stateAt(at(74)).fepActive).toBe(false);
  });

  it('does not open when the business replies later than 24h', () => {
    const { stateAt } = deriveWindows([inbound(0, 'click_to_whatsapp_ad'), outbound(25)], RULES);
    expect(stateAt(at(26)).fepActive).toBe(false);
  });

  it('does not open for an organic entry point', () => {
    const { stateAt } = deriveWindows([inbound(0, 'organic'), outbound(1)], RULES);
    expect(stateAt(at(2)).fepActive).toBe(false);
  });

  it('opens for a Facebook Page CTA too', () => {
    const { stateAt } = deriveWindows([inbound(0, 'facebook_page_cta'), outbound(1)], RULES);
    expect(stateAt(at(2)).fepEntryPoint).toBe('facebook_page_cta');
  });

  it('opens a second window for a later ad click', () => {
    const { stateAt } = deriveWindows(
      [inbound(0, 'click_to_whatsapp_ad'), outbound(1), inbound(200, 'click_to_whatsapp_ad'), outbound(201)],
      RULES,
    );
    expect(stateAt(at(100)).fepActive).toBe(false);
    expect(stateAt(at(210)).fepActive).toBe(true);
  });

  it('is independent of the customer service window', () => {
    // Business answers the ad, then goes quiet past the 24h CSW but inside the 72h FEP.
    const { stateAt } = deriveWindows([inbound(0, 'click_to_whatsapp_ad'), outbound(1)], RULES);
    const state = stateAt(at(40));
    expect(state.cswOpen).toBe(false);
    expect(state.fepActive).toBe(true);
  });
});
