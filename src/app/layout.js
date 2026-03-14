import './globals.css';

export const metadata = {
  title: 'Zap2 | Conectar WhatsApp',
  description: 'Painel Next.js com QR code do WhatsApp via Baileys',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
