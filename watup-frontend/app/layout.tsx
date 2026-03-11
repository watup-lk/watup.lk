import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar/Navbar';
import { ThemeProvider } from '@/lib/theme-context';

export const metadata: Metadata = {
  title: 'Watup.lk – Sri Lanka Tech Salary Transparency',
  description:
    'Anonymously browse and submit tech salaries in Sri Lanka. Community-driven, Kafka-powered salary transparency platform.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <ThemeProvider>
          <Navbar />
          <main>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
