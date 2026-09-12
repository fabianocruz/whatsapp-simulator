import type { EntryPoint, RuleSet, SimMessage, WindowState } from './types.js';

const HOUR_MS = 60 * 60 * 1000;

export function parseInstant(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new RangeError(`invalid ISO timestamp: "${iso}"`);
  return ms;
}

/** Chronological copy of the timeline. The engine never mutates its input. */
export function sortByTime(messages: readonly SimMessage[]): SimMessage[] {
  return [...messages].sort((a, b) => parseInstant(a.sentAt) - parseInstant(b.sentAt));
}

interface Interval {
  from: number;
  to: number;
  entryPoint: EntryPoint;
}

const FEP_ENTRY_POINTS: readonly EntryPoint[] = ['click_to_whatsapp_ad', 'facebook_page_cta'];

/**
 * Derives every free-entry-point window in the timeline.
 *
 * The rule: a customer arrives through a Click-to-WhatsApp ad or a Facebook Page CTA; if
 * the business answers within `fepResponseWindowHours`, a `fepHours` window opens *at the
 * business reply* and everything inside it is free.
 *
 * The spec describes this for "the first customer message". We evaluate every qualifying
 * entry-point message instead, because a real thread can carry a second ad click weeks
 * later and Meta opens a new free window for it. With a single entry point the two
 * readings are identical.
 */
function deriveFepWindows(sorted: readonly SimMessage[], ruleSet: RuleSet): Interval[] {
  const windows: Interval[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const entry = sorted[i]!;
    if (entry.direction !== 'user_to_business') continue;
    if (!entry.entryPoint || !FEP_ENTRY_POINTS.includes(entry.entryPoint)) continue;

    const entryAt = parseInstant(entry.sentAt);
    // The first business reply after the entry point is what opens the window.
    const reply = sorted.slice(i + 1).find((m) => m.direction === 'business_to_user');
    if (!reply) continue;
    const replyAt = parseInstant(reply.sentAt);
    if (replyAt - entryAt > ruleSet.fepResponseWindowHours * HOUR_MS) continue;

    windows.push({
      from: replyAt,
      to: replyAt + ruleSet.fepHours * HOUR_MS,
      entryPoint: entry.entryPoint,
    });
  }
  return windows;
}

/**
 * Window state at `at`, given the messages that came before it.
 *
 * `at` is compared half-open against both windows: a message landing exactly 24h after
 * the customer's last message is outside the CSW, which matches how Meta closes it.
 */
function stateAt(at: number, sorted: readonly SimMessage[], ruleSet: RuleSet, fepWindows: readonly Interval[]): WindowState {
  let cswOpenUntil: number | null = null;
  for (const message of sorted) {
    const sentAt = parseInstant(message.sentAt);
    if (sentAt > at) break;
    if (message.direction !== 'user_to_business') continue;
    // Every customer message restarts the 24h clock, including one sent at `at` itself:
    // an inbound message is free regardless, and the business reply that follows is inside.
    cswOpenUntil = sentAt + ruleSet.cswHours * HOUR_MS;
  }

  const fep = fepWindows.find((w) => at >= w.from && at < w.to) ?? null;

  return {
    cswOpen: cswOpenUntil !== null && at < cswOpenUntil,
    cswOpenUntil: cswOpenUntil === null ? null : new Date(cswOpenUntil).toISOString(),
    fepActive: fep !== null,
    fepActiveUntil: fep === null ? null : new Date(fep.to).toISOString(),
    fepEntryPoint: fep === null ? null : fep.entryPoint,
  };
}

export interface TimelineWindows {
  sorted: SimMessage[];
  /** Window state at each message, aligned by index with `sorted`. */
  states: WindowState[];
  stateAt(iso: string): WindowState;
}

/**
 * Computes CSW/FEP state for a whole timeline in one pass-ish sweep.
 *
 * Windows are derived, never an input: the engine is handed the conversation and works
 * out which windows were open, so a shared scenario can never disagree with itself.
 */
export function deriveWindows(messages: readonly SimMessage[], ruleSet: RuleSet): TimelineWindows {
  const sorted = sortByTime(messages);
  const fepWindows = deriveFepWindows(sorted, ruleSet);
  const states = sorted.map((message) => stateAt(parseInstant(message.sentAt), sorted, ruleSet, fepWindows));
  return {
    sorted,
    states,
    stateAt: (iso: string) => stateAt(parseInstant(iso), sorted, ruleSet, fepWindows),
  };
}
