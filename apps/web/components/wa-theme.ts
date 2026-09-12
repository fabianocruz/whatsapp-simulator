/**
 * WhatsApp dark-mode palette, as rendered by the app itself.
 *
 * Ported from the Dyvit dashboard's simulator (same owner, relicensed MIT here) so the
 * company has one WhatsApp rendering rather than two that drift apart. These are WhatsApp's
 * colors, deliberately outside the Dyvit design tokens: the phone frame is a reproduction
 * of someone else's product, and the Dyvit palette lives everywhere around it.
 */
export const WA = {
  chatBg: '#0B141A',
  header: '#1F2C34',
  inputBar: '#1F2C34',
  inputField: '#2A3942',
  separator: 'rgba(255,255,255,0.06)',
  inbound: '#202C33',
  outbound: '#005C4B',
  system: '#1A2B32',
  check: '#53BDEB',
  checkPlain: 'rgba(255,255,255,0.45)',
  timestamp: 'rgba(255,255,255,0.45)',
  failed: '#F15C6D',
} as const;
