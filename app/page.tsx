import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import './landing.css';

const PROVIDERS = [
  { n: 'Google', c: '#1a73e8', l: 'G' }, { n: 'Outlook', c: '#0f6cbd', l: 'O' }, { n: 'Hotmail', c: '#0b57d0', l: 'H' },
  { n: 'Zoho', c: '#e42527', l: 'Z' }, { n: 'Yahoo', c: '#6001d2', l: 'Y' }, { n: 'Hostinger', c: '#0b8a6a', l: 'H' },
];
const FEATURES = [
  { t: 'Every inbox, one calendar', d: 'Connect Google, Outlook, Hotmail, Zoho, Yahoo, Hostinger or any CalDAV mailbox. Add as many accounts as you have.', i: '🔗' },
  { t: 'Automatic sync', d: 'Connect once and meetings flow in on their own. The calendar refreshes in the background, so you never click refresh.', i: '⚡' },
  { t: 'Colour by account', d: 'Each platform has its own colour, so you see at a glance which inbox a meeting came from. Filter any of them on or off.', i: '🎨' },
  { t: 'Day, week, month, agenda', d: 'Switch views, jump through dates and click any meeting for details, time and location.', i: '🗓️' },
  { t: 'Secure by design', d: 'Sign in with your Zoho account. Mailbox access is read-only and tokens are stored server-side only.', i: '🔒' },
  { t: 'Detect clashes early', d: 'Overlapping meetings from different accounts sit side by side, so double-bookings are obvious.', i: '👀' },
];

export default async function Landing({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect('/app');
  const { error } = await searchParams;
  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-brand" href="/"><span className="lp-logo">EC</span>EvoCalendar</a>
        <nav><a href="#features">Features</a><a href="#how">How it works</a><a href="#providers">Integrations</a></nav>
        <a className="lp-btn ghost" href="/api/auth/zoho">Sign in</a>
      </header>

      {error && <div className="lp-error">{error}</div>}

      <section className="lp-hero">
        <div className="lp-glow" />
        <span className="lp-pill">One calendar for every email account</span>
        <h1>All your meetings.<br /><span>One beautiful calendar.</span></h1>
        <p>EvoCalendar pulls meetings from Google, Outlook, Zoho, Yahoo and Hostinger into a single, colour-coded, always-up-to-date view.</p>
        <div className="lp-cta">
          <a className="lp-btn primary big" href="/api/auth/zoho"><span className="lp-z">Z</span>Sign in with Zoho</a>
          <a className="lp-btn ghost big" href="#how">See how it works</a>
        </div>

        <div className="lp-mock">
          <div className="lp-mock-bar"><i /><i /><i /><b>EvoCalendar · Week</b></div>
          <div className="lp-mock-grid">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => <div key={d} className="hd">{d}</div>)}
            <div className="col"><div className="ev g" style={{ top: 14, height: 44 }}>Team stand-up</div><div className="ev z" style={{ top: 78, height: 70 }}>Project kickoff</div><div className="ev m" style={{ top: 180, height: 56 }}>Client review</div></div>
            <div className="col"><div className="ev o" style={{ top: 50, height: 60 }}>Board prep</div><div className="ev g" style={{ top: 150, height: 46 }}>1:1 Sam</div></div>
            <div className="col"><div className="ev m" style={{ top: 14, height: 60 }}>Client review</div><div className="ev z" style={{ top: 112, height: 56 }}>Demo</div><div className="ev y" style={{ top: 196, height: 40 }}>Vendor sync</div></div>
            <div className="col"><div className="ev y" style={{ top: 70, height: 44 }}>Vendor call</div><div className="ev g" style={{ top: 140, height: 70 }}>Planning</div></div>
            <div className="col"><div className="ev g" style={{ top: 14, height: 44 }}>Team stand-up</div><div className="ev o" style={{ top: 100, height: 50 }}>Review</div><div className="ev g" style={{ top: 184, height: 52 }}>Weekly wrap-up</div></div>
          </div>
        </div>
      </section>

      <section id="providers" className="lp-strip">
        <p>Works with the mailboxes you already use</p>
        <div>{PROVIDERS.map(p => <span key={p.n}><i style={{ background: p.c }}>{p.l}</i>{p.n}</span>)}</div>
      </section>

      <section id="features" className="lp-sec">
        <h2>Everything your schedule needs</h2>
        <p className="lp-sub">Stop switching tabs between inboxes. See the whole picture.</p>
        <div className="lp-feats">
          {FEATURES.map(f => <div key={f.t} className="lp-feat"><span>{f.i}</span><h3>{f.t}</h3><p>{f.d}</p></div>)}
        </div>
      </section>

      <section id="how" className="lp-sec alt">
        <h2>Up and running in three steps</h2>
        <div className="lp-steps">
          <div><b>1</b><h3>Sign in with Zoho</h3><p>One click. No new password to remember.</p></div>
          <div><b>2</b><h3>Connect your mailboxes</h3><p>Open Integration and pick Google, Microsoft, Zoho, Yahoo or your own domain.</p></div>
          <div><b>3</b><h3>Meetings sync automatically</h3><p>They appear in your calendar, colour-coded, and stay up to date.</p></div>
        </div>
      </section>

      <section className="lp-final">
        <h2>Ready to see your whole week?</h2>
        <a className="lp-btn primary big" href="/api/auth/zoho"><span className="lp-z">Z</span>Sign in with Zoho</a>
      </section>

      <footer className="lp-foot"><span>© {new Date().getFullYear()} EvoCalendar</span><span>Read-only access to your calendars. Disconnect any time.</span></footer>
    </div>
  );
}
