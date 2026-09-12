'use client';

import type { ReactNode } from 'react';
import { WA } from './wa-theme';

/**
 * The iPhone shell around the conversation: dynamic island, status bar, side buttons and
 * home indicator. Purely decorative and fully aria-hidden — a screen reader should hear the
 * conversation, not a description of a phone.
 *
 * Ported from the Dyvit dashboard simulator, minus the voice recorder: in this product the
 * composer lives in the right-hand panel, so the input bar here is scenery.
 */

function StatusBarIcons() {
  return (
    <div className="flex items-center gap-[5px]">
      <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
        <rect x="0" y="8" width="3" height="4" rx="0.5" fill="white" opacity="0.9" />
        <rect x="4.5" y="5" width="3" height="7" rx="0.5" fill="white" opacity="0.9" />
        <rect x="9" y="2" width="3" height="10" rx="0.5" fill="white" opacity="0.9" />
        <rect x="13.5" y="0" width="3" height="12" rx="0.5" fill="white" opacity="0.3" />
      </svg>
      <svg width="14" height="11" viewBox="0 0 14 11" aria-hidden="true">
        <path d="M7 10.5a1 1 0 100-2 1 1 0 000 2z" fill="white" opacity="0.9" />
        <path d="M4.5 7.5a3.5 3.5 0 015 0" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.9" />
        <path d="M2 5a7 7 0 0110 0" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.9" />
      </svg>
      <svg width="25" height="12" viewBox="0 0 25 12" aria-hidden="true">
        <rect x="0" y="1" width="22" height="10" rx="2" stroke="white" strokeWidth="1" fill="none" opacity="0.4" />
        <rect x="2" y="3" width="16" height="6" rx="1" fill="#5AE4AA" />
        <rect x="23" y="4" width="2" height="4" rx="1" fill="white" opacity="0.3" />
      </svg>
    </div>
  );
}

interface Props {
  /** Contact name in the WhatsApp header. */
  contactName: string;
  /** Small line under the name. */
  subtitle: string;
  /** Clock in the status bar. Passed in so a shared link renders identically for everyone. */
  clock: string;
  /** Placeholder text in the scenery input bar. */
  inputPlaceholder: string;
  children: ReactNode;
}

export function DeviceChrome({ contactName, subtitle, clock, inputPlaceholder, children }: Props) {
  return (
    <div className="flex items-center justify-center">
      <div
        className="relative flex flex-col"
        style={{
          width: 375,
          height: 740,
          borderRadius: 50,
          background: '#1A1A1A',
          padding: 8,
          boxShadow: '0 25px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08)',
        }}
      >
        <div className="absolute -left-[2px] top-[140px] h-[32px] w-[3px] rounded-l-[2px]" style={{ background: '#2A2A2A' }} aria-hidden="true" />
        <div className="absolute -left-[2px] top-[185px] h-[32px] w-[3px] rounded-l-[2px]" style={{ background: '#2A2A2A' }} aria-hidden="true" />
        <div className="absolute -right-[2px] top-[165px] h-[44px] w-[3px] rounded-r-[2px]" style={{ background: '#2A2A2A' }} aria-hidden="true" />

        <div className="relative flex flex-1 flex-col overflow-hidden" style={{ borderRadius: 42, background: WA.chatBg }}>
          <div className="absolute left-1/2 top-[10px] z-20 -translate-x-1/2" aria-hidden="true">
            <div className="rounded-full" style={{ width: 120, height: 34, background: '#000' }} />
          </div>

          <div className="relative z-10 flex items-center justify-between px-8 pb-1 pt-[14px]" style={{ height: 54 }} aria-hidden="true">
            <span className="text-[14px] font-semibold text-white/90">{clock}</span>
            <StatusBarIcons />
          </div>

          <div className="flex items-center gap-2 px-3 py-2" style={{ background: WA.header }} aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white/70">
              <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full" style={{ background: '#0A6E4A' }}>
              <span className="text-[15px] font-bold text-white">D</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium leading-tight text-white/95">{contactName}</div>
              <div className="flex items-center gap-1.5">
                <span className="h-[6px] w-[6px] rounded-full" style={{ background: '#5AE4AA' }} />
                <span className="text-[12px] text-white/50">{subtitle}</span>
              </div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white/50">
              <path d="m23 7-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="ml-1.5 text-white/50">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div style={{ height: 1, background: WA.separator }} aria-hidden="true" />

          {children}

          <div className="flex items-end gap-2 px-2 py-2" style={{ background: WA.inputBar }} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="shrink-0 text-white/40">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <div className="flex-1 rounded-[20px] px-4 py-[9px] text-[14px] text-white/30" style={{ background: WA.inputField }}>
              {inputPlaceholder}
            </div>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="shrink-0 text-white/60">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="flex justify-center py-2" style={{ background: WA.inputBar }} aria-hidden="true">
            <div className="h-[5px] w-[134px] rounded-full bg-white/20" />
          </div>
        </div>
      </div>
    </div>
  );
}
