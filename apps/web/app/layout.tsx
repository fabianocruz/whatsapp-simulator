import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'WhatsApp Messaging Simulator · Dyvit',
  description:
    'Simulador open source de mensageria WhatsApp Business Platform: monte a conversa e veja o custo por mensagem nas regras da Meta, com dicas de otimizacao.',
  applicationName: 'Dyvit WhatsApp Messaging Simulator',
  openGraph: {
    title: 'WhatsApp Messaging Simulator · Dyvit',
    description: 'Monte a conversa. Veja o custo. Pague menos.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@300;400;500;600;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[color:var(--color-paper)] text-[color:var(--color-ink)] antialiased">{children}</body>
    </html>
  );
}
