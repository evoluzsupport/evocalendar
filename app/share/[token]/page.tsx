import SharedCalendar from '@/components/SharedCalendar';
import { readShareToken } from '@/lib/share';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shared calendar · OneCalendar', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = readShareToken(token);
  if (!share) {
    return (
      <main style={{ maxWidth: 480, margin: '15vh auto', padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h1>Link unavailable</h1>
        <p>This shared calendar link is invalid or has expired. Ask its owner for a new one.</p>
      </main>
    );
  }
  return <SharedCalendar token={token} owner={share.owner} expires={share.exp} accounts={share.accounts.map(a => ({ id: a.id, provider: a.provider, email: a.email }))} />;
}
