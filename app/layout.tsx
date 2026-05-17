import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'KYRO Hackathon API',
  description: 'Read-only data API for KYRO hackathon participants.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Inter", "Pretendard", system-ui, sans-serif',
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
