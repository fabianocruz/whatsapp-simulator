/** Status ticks and small glyphs. All decorative: the text label carries the meaning. */

export function TickIcon({ status }: { status: 'sent' | 'delivered' | 'read' | 'failed' }) {
  if (status === 'failed') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="inline-block">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="#9a3412" strokeWidth="1.4" />
        <path d="M8 4.6v4.2M8 11.1v.6" stroke="#9a3412" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  const color = status === 'read' ? '#2f86d6' : 'rgba(17,17,16,0.4)';
  return (
    <svg width="16" height="12" viewBox="0 0 18 12" aria-hidden="true" className="inline-block">
      <path d="M1 6.6 4.2 9.8 10.6 2.4" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {status !== 'sent' && (
        <path d="M7.2 6.6 10.4 9.8 16.8 2.4" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

export function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" className="inline-block">
      <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.2v4M8 4.6v.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
