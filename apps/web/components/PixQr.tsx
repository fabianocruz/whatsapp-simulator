'use client';

import type React from 'react';
import QRCode from 'qrcode';

/**
 * Draws the QR of a Pix "copia e cola" (BR Code) the agent sent as text.
 * The QR encodes exactly the string that arrived — nothing is invented — and the
 * code itself stays visible, shortened, under the image.
 */
export function isPixBrCode(text: string): boolean {
  const t = text.trim();
  return /^000201/.test(t) && t.includes('br.gov.bcb.pix');
}

export function PixQr({ code }: { code: string }) {
  const qr = QRCode.create(code.trim(), { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const cells: React.ReactElement[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr.modules.get(x, y)) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
    }
  }
  const short = code.trim().length > 34 ? `${code.trim().slice(0, 22)}…${code.trim().slice(-8)}` : code.trim();
  return (
    <div className="flex flex-col items-center gap-2 py-1">
      <div className="rounded-[8px] bg-white p-2">
        <svg width="184" height="184" viewBox={`-1 -1 ${size + 2} ${size + 2}`} shapeRendering="crispEdges" aria-label="QR Pix">
          <rect x="-1" y="-1" width={size + 2} height={size + 2} fill="#fff" />
          <g fill="#111">{cells}</g>
        </svg>
      </div>
      <span className="text-[12px] text-white/80">Pix · copia e cola</span>
      <span className="mono text-[10px] text-white/55 [overflow-wrap:anywhere]">{short}</span>
    </div>
  );
}
