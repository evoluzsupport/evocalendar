import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'EvoCalendar', description: 'All your meetings from every email account, in one calendar' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
