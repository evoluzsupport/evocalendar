'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Provider = { id: string; name: string; letter: string; desc: string };
type Account = { id: string; provider: string; email: string };
type Ev = { provider: string; title: string; start: string; end: string };
type Page = 'dashboard' | 'calendar' | 'settings' | 'integration';

const COLORS: Record<string, string> = { google: 'var(--google)', microsoft: 'var(--ms)', zoho: 'var(--zoho)', yahoo: 'var(--yahoo)', other: 'var(--other)' };
const LABELS: Record<string, string> = { google: 'Google', microsoft: 'Microsoft', zoho: 'Zoho', yahoo: 'Yahoo', other: 'Other' };
const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
  { id: 'calendar', label: 'My Calendar', icon: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18' },
  { id: 'settings', label: 'Setting', icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3' },
  { id: 'integration', label: 'Integration', icon: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7' },
];

async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const weekStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

type Modal = null | { kind: 'manage'; p: Provider } | { kind: 'connecting'; p: Provider; step: number } | { kind: 'done'; p: Provider; email: string } | { kind: 'other' };

export default function EvoCalendar() {
  const [page, setPage] = useState<Page>('dashboard');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<Ev[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [toastMsg, setToastMsg] = useState('');

  const toast = useCallback((m: string) => { setToastMsg(m); setTimeout(() => setToastMsg(''), 2600); }, []);
  const load = useCallback(async () => {
    const [p, a, s, e] = await Promise.all([api('/providers'), api('/accounts'), api('/settings'), api('/events')]);
    setProviders(p); setAccounts(a); setSettings(s); setEvents(e);
  }, []);

  useEffect(() => {
    load().catch(e => toast(e.message));
    const q = new URLSearchParams(location.search);
    if (q.get('connected')) toast('Connected: ' + q.get('connected'));
    if (q.get('error')) toast('Connection failed: ' + q.get('error'));
    if (q.size) history.replaceState(null, '', '/');
  }, [load, toast]);

  const evs = useMemo(() => events.map(e => ({ ...e, s: new Date(e.start), e2: new Date(e.end) })), [events]);

  async function connect(p: Provider) {
    let start: any;
    try { start = await api('/connect/' + p.id, 'POST'); } catch (e: any) { return toast(e.message); }
    if (start.redirect) { window.location.href = start.redirect; return; }
    for (let step = 0; step < 4; step++) { setModal({ kind: 'connecting', p, step }); await new Promise(r => setTimeout(r, 700)); }
    const acct = await api<Account>('/connect/' + p.id + '/demo', 'POST');
    setModal({ kind: 'done', p, email: acct.email });
    setTimeout(async () => { setModal(null); await load(); toast(`${p.name} connected: ${acct.email}`); }, 900);
  }

  async function updateSetting(key: string, value: string) {
    setSettings(await api('/settings', 'PUT', { [key]: value }));
    toast('Settings saved');
  }

  return (
    <div className="app">
      <aside>
        <div className="brand"><div className="logo">EC</div>EvoCalendar</div>
        {NAV.map(n => (
          <div key={n.id} className={'nav' + (page === n.id ? ' active' : '')} onClick={() => setPage(n.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={n.icon} /></svg>{n.label}
          </div>
        ))}
      </aside>

      <main>
        {page === 'dashboard' && <Dashboard evs={evs} count={accounts.length} />}
        {page === 'calendar' && <Calendar evs={evs} />}
        {page === 'settings' && (
          <section>
            <div className="ph"><div><h1>Setting</h1><p>General preferences</p></div></div>
            <div className="card">
              <Row title="Time zone" sub="Used to display all meetings" value={settings.timezone} onChange={v => updateSetting('timezone', v)} opts={['Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York']} />
              <Row title="Default calendar view" value={settings.defaultView} onChange={v => updateSetting('defaultView', v)} opts={['Week', 'Day', 'Month', 'Agenda']} />
              <Row title="Sync frequency" sub="For accounts that do not support instant updates" value={settings.syncFrequency} onChange={v => updateSetting('syncFrequency', v)} opts={['Every 5 minutes', 'Every 15 minutes', 'Every 30 minutes']} />
            </div>
          </section>
        )}
        {page === 'integration' && (
          <section>
            <div className="ph"><div><h1>Integration</h1><p>Connect your email accounts to sync their meetings into EvoCalendar</p></div></div>
            <div className="cards">
              {providers.map(p => {
                const accts = accounts.filter(a => a.provider === p.id);
                const on = accts.length > 0;
                return (
                  <div key={p.id} className="icard" onClick={() => on ? setModal({ kind: 'manage', p }) : connect(p)}>
                    <div className="ilogo" style={{ background: COLORS[p.id] }}>{p.letter}</div>
                    <h3>{p.name} Connect</h3><p>{p.desc}</p>
                    {accts.map(a => <div key={a.id} className="connected-acct">{a.email}</div>)}
                    <span className={'status' + (on ? ' on' : '')}>{on ? 'Connected' : 'Not connected'}</span>
                  </div>
                );
              })}
              <div className="icard add" onClick={() => setModal({ kind: 'other' })}>
                <div className="plus">+</div><h3>Add another email platform</h3>
                <p>Hostinger, custom domain or any other IMAP / CalDAV email.</p>
                {accounts.filter(a => a.provider === 'other').map(a => <div key={a.id} className="connected-acct">{a.email}</div>)}
              </div>
            </div>
          </section>
        )}
      </main>

      <div className={'overlay' + (modal ? ' show' : '')} onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
        <div className="modal">
          {modal?.kind === 'manage' && (
            <>
              <Head color={COLORS[modal.p.id]} letter={modal.p.letter} title={modal.p.name} />
              <p className="sub">Connected accounts</p>
              <div className="perm">
                {accounts.filter(a => a.provider === modal.p.id).map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0' }}>{a.email}
                    <button className="btn danger" onClick={async () => { await api('/accounts/' + a.id, 'DELETE'); setModal(null); load(); }}>Disconnect</button>
                  </div>
                ))}
              </div>
              <div className="actions"><button className="btn" onClick={() => setModal(null)}>Close</button>
                <button className="btn primary" onClick={() => connect(modal.p)}>Add another account</button></div>
            </>
          )}
          {modal?.kind === 'connecting' && (
            <div className="auth">
              <div className="ilogo" style={{ background: COLORS[modal.p.id] }}>{modal.p.letter}</div>
              <h2 style={{ justifyContent: 'center', marginBottom: 4 }}>Connecting {modal.p.name}</h2>
              <p className="sub" style={{ margin: 0 }}>Please wait, this takes a few seconds</p>
              <ul className="steps">
                {[`Signing in to ${modal.p.name}`, 'Authorizing EvoCalendar', 'Connecting your calendars', 'Syncing meetings'].map((t, i) => (
                  <li key={t} className={i < modal.step ? 'done' : i === modal.step ? 'doing' : ''}><span className="ic">{i < modal.step ? '✓' : ''}</span>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {modal?.kind === 'done' && (
            <div className="auth"><div className="success">{'✓'}</div>
              <h2 style={{ justifyContent: 'center', marginBottom: 4 }}>{modal.p.name} connected</h2><p className="sub">{modal.email}</p></div>
          )}
          {modal?.kind === 'other' && <OtherForm onCancel={() => setModal(null)} onDone={async email => { setModal(null); await load(); toast('Connected: ' + email); }} onError={toast} />}
        </div>
      </div>
      <div className={'toast' + (toastMsg ? ' show' : '')}>{toastMsg}</div>
    </div>
  );
}

function Head({ color, letter, title }: { color: string; letter: string; title: string }) {
  return <h2><span className="ilogo" style={{ background: color, width: 32, height: 32, fontSize: 15 }}>{letter}</span>{title}</h2>;
}

function Row({ title, sub, value, onChange, opts }: { title: string; sub?: string; value?: string; onChange: (v: string) => void; opts: string[] }) {
  return (
    <div className="form-row"><div><b>{title}</b>{sub && <small>{sub}</small>}</div>
      <select value={value || opts[0]} onChange={e => onChange(e.target.value)}>{opts.map(o => <option key={o}>{o}</option>)}</select></div>
  );
}

function Dashboard({ evs, count }: { evs: (Ev & { s: Date; e2: Date })[]; count: number }) {
  const now = new Date();
  const today = evs.filter(e => sameDay(e.s, now)).sort((a, b) => +a.s - +b.s);
  const ws = weekStart(now), we = new Date(ws); we.setDate(we.getDate() + 7);
  return (
    <section>
      <div className="ph"><div><h1>Dashboard</h1><p>Your meetings from every connected account</p></div></div>
      <div className="stats">
        <div className="card stat"><div className="l">Meetings today</div><div className="n">{today.length}</div></div>
        <div className="card stat"><div className="l">This week</div><div className="n">{evs.filter(e => e.s >= ws && e.s < we).length}</div></div>
        <div className="card stat"><div className="l">Connected accounts</div><div className="n">{count}</div></div>
      </div>
      <div className="card list">
        <h3 style={{ margin: '0 0 6px' }}>Today</h3>
        {today.length ? today.map((e, i) => (
          <div className="row" key={i}><span className="bar" style={{ background: COLORS[e.provider] }} />
            <span className="time">{fmtTime(e.s)} - {fmtTime(e.e2)}</span><b>{e.title}</b><span className="src">{LABELS[e.provider]}</span></div>
        )) : <p className="hint" style={{ padding: '12px 0' }}>No meetings today. Connect an account under Integration to sync meetings.</p>}
      </div>
    </section>
  );
}

function Calendar({ evs }: { evs: (Ev & { s: Date })[] }) {
  const ws = weekStart(new Date());
  const days = [...Array(5)].map((_, i) => { const d = new Date(ws); d.setDate(d.getDate() + i); return d; });
  const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17];
  return (
    <section>
      <div className="ph"><div><h1>My Calendar</h1><p>Week of {ws.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</p></div></div>
      <div className="week">
        <div className="hd" />
        {days.map(d => <div className="hd" key={+d}>{d.toLocaleDateString([], { weekday: 'short' })} {d.getDate()}</div>)}
        {hours.map(h => (
          <Fragment2 key={h}>
            <div className="t">{h > 12 ? h - 12 : h} {h >= 12 ? 'PM' : 'AM'}</div>
            {days.map(d => {
              const e = evs.find(x => sameDay(x.s, d) && x.s.getHours() === h);
              return <div className="cell" key={+d}>{e && <div className="ev" style={{ background: COLORS[e.provider] }}>{e.title}</div>}</div>;
            })}
          </Fragment2>
        ))}
      </div>
    </section>
  );
}
const Fragment2 = ({ children }: { children: React.ReactNode }) => <>{children}</>;

function OtherForm({ onCancel, onDone, onError }: { onCancel: () => void; onDone: (email: string) => void; onError: (m: string) => void }) {
  const [plat, setPlat] = useState('hostinger');
  const [email, setEmail] = useState('');
  const [imap, setImap] = useState('imap.hostinger.com');
  const [caldav, setCaldav] = useState('');
  return (
    <>
      <Head color="var(--other)" letter="+" title="Connect another email platform" />
      <p className="sub">Enter your mailbox details. Meetings are read from calendar invites in this inbox.</p>
      <div className="field"><label>Platform</label>
        <select value={plat} onChange={e => { setPlat(e.target.value); setImap(e.target.value === 'hostinger' ? 'imap.hostinger.com' : ''); }}>
          <option value="hostinger">Hostinger</option><option value="custom">Custom domain</option><option value="other">Other</option></select></div>
      <div className="field"><label>Email address</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></div>
      <div className="field"><label>Password</label><input type="password" placeholder="Mailbox password" /></div>
      <div className="field"><label>IMAP server</label><input value={imap} onChange={e => setImap(e.target.value)} /></div>
      <div className="field"><label>CalDAV URL (optional)</label><input value={caldav} onChange={e => setCaldav(e.target.value)} placeholder="https://mail.example.com/caldav" /></div>
      <p className="hint">If your provider offers CalDAV, add it for full calendar sync. Otherwise only email invites are synced.</p>
      <div className="actions"><button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={async () => {
          try { await api('/accounts', 'POST', { provider: 'other', email: email.trim(), imap, caldav }); onDone(email.trim()); }
          catch (e: any) { onError(e.message); }
        }}>Connect</button></div>
    </>
  );
}
