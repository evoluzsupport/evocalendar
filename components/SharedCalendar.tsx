'use client';
import CalendarView from './CalendarView';
import { Acct, setPalette } from './shared';

export default function SharedCalendar({ token, owner, expires, accounts }: { token: string; owner: string; expires: number; accounts: Acct[] }) {
  setPalette(accounts);
  return (
    <div className="app" style={{ display: 'block' }}>
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
        <p className="hint" style={{ margin: '0 0 8px' }}>
          Read-only view shared by <b>{owner || 'an EvoCalendar user'}</b> · link expires {new Date(expires).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
        <CalendarView title={owner ? `${owner}'s Calendar` : 'Shared Calendar'} initialView="Week" enabled accounts={accounts} eventsPath={`/share/${token}/events`} onToast={() => {}} />
      </main>
    </div>
  );
}
