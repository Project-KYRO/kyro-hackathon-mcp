import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'KYRO Hackathon API',
  description: 'Read-only data API for the 2026-05-10 KYRO hackathon.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Pretendard", system-ui, sans-serif',
          margin: 0,
          background: '#0a0a0a',
          color: '#f5f5f5',
        }}
      >
        {children}
      </body>
    </html>
  );
}
