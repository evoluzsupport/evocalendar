'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import CalendarView from './CalendarView';
import { COLORS, LABELS, api, evColor, fmtTime, setPalette, startOfDay, sameDay, useEvents } from './shared';

type Provider = { id: string; name: string; letter: string; desc: string; kind: 'oauth' | 'caldav'; caldavUrl?: string };
type Account = { id: string; provider: string; email: string };
type Page = 'dashboard' | 'calendar' | 'settings' | 'integration';
type Modal = null | { kind: 'manage'; p: Provider } | { kind: 'connecting'; p: Provider; step: number } | { kind: 'done'; p: Provider; email: string } | { kind: 'caldav'; preset: 'yahoo' | 'other' }
  | { kind: 'where'; p: Provider; err?: string } | { kind: 'link'; p: Provider; url: string; count: number; paste: boolean };

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
  { id: 'calendar', label: 'My Calendar', icon: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18' },
  { id: 'settings', label: 'Setting', icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3' },
  { id: 'integration', label: 'Integration', icon: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7' },
];

export default function EvoCalendar({ user }: { user: { name: string; email: string } }) {
  const [page, setPage] = useState<Page>('dashboard');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [toastMsg, setToastMsg] = useState('');

  setPalette(accounts); // per-account colours
  const toast = useCallback((m: string) => { setToastMsg(m); setTimeout(() => setToastMsg(''), 3200); }, []);
  const load = useCallback(async () => {
    const [p, a, s] = await Promise.all([api('/providers'), api('/accounts'), api('/settings')]);
    setProviders(p); setAccounts(a); setSettings(s); setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch(e => toast(e.message));
    const q = new URLSearchParams(location.search);
    if (q.get('connected')) { toast('Connected: ' + q.get('connected') + '. Syncing meetings…'); setPage('calendar'); }
    if (q.get('error')) { toast('Connection failed: ' + q.get('error')); setPage('integration'); }
    if (q.size) history.replaceState(null, '', '/app');
  }, [load, toast]);

  // Poll while the "other browser" link is open; close as soon as a new account of that provider shows up.
  const linkP = modal?.kind === 'link' ? modal.p.id : '', linkCount = modal?.kind === 'link' ? modal.count : 0;
  useEffect(() => {
    if (!linkP) return;
    const t = setInterval(async () => {
      try {
        const a = await api<Account[]>('/accounts');
        if (a.filter(x => x.provider === linkP).length > linkCount) { setAccounts(a); setModal(null); setPage('calendar'); toast('Account connected from the other browser. Syncing meetings…'); }
      } catch {}
    }, 3000);
    return () => clearInterval(t);
  }, [linkP, linkCount, toast]);

  async function connect(p: Provider, other = false) {
    if (p.kind === 'caldav') return setModal({ kind: 'caldav', preset: 'yahoo' });
    let start: any;
    try { start = await api('/connect/' + p.id, 'POST', { other }); } catch (e: any) { if (other) return setModal({ kind: 'where', p, err: e.message }); return toast(e.message); }
    if (start.redirect && other) { setModal({ kind: 'link', p, url: start.redirect, count: accounts.filter(a => a.provider === p.id).length, paste: !!start.paste }); return; }
    if (start.redirect) { window.location.href = start.redirect; return; }
    for (let step = 0; step < 4; step++) { setModal({ kind: 'connecting', p, step }); await new Promise(r => setTimeout(r, 600)); }
    const acct = await api<{ email: string }>('/connect/' + p.id + '/demo', 'POST');
    setModal({ kind: 'done', p, email: acct.email });
    setTimeout(async () => { setModal(null); await load(); toast(`${p.name} connected: ${acct.email}`); }, 900);
  }

  async function updateSetting(key: string, value: string) {
    setSettings(await api('/settings', 'PUT', { [key]: value }));
    toast('Settings saved');
  }
  async function logout() { await api('/auth/logout', 'POST').catch(() => {}); window.location.href = '/'; }

  return (
    <div className="app">
      <aside>
        <div className="brand"><div className="logo">EC</div>EvoCalendar</div>
        {NAV.map(n => (
          <div key={n.id} className={'nav' + (page === n.id ? ' active' : '')} onClick={() => setPage(n.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={n.icon} /></svg>{n.label}
          </div>
        ))}
        <div className="usercard">
          <div className="avatar">{(user.name || '?')[0].toUpperCase()}</div>
          <div className="who"><b>{user.name}</b><small>{user.email}</small></div>
          <button className="btn" onClick={logout}>Sign out</button>
        </div>
      </aside>

      <main>
        {page === 'dashboard' && <Dashboard count={accounts.length} enabled={loaded} onGo={setPage} />}
        {page === 'calendar' && <CalendarView initialView={settings.defaultView} enabled={loaded} accounts={accounts} onToast={toast} />}
        {page === 'settings' && (
          <section>
            <div className="ph"><div><h1>Setting</h1><p>General preferences</p></div></div>
            <div className="card">
              <Row title="Time zone" sub="Used to display all meetings" value={settings.timezone} onChange={v => updateSetting('timezone', v)} opts={['Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York']} />
              <Row title="Default calendar view" sub="Opens this view in My Calendar" value={settings.defaultView} onChange={v => updateSetting('defaultView', v)} opts={['Week', 'Day', 'Month', 'Agenda']} />
              <Row title="Sync frequency" sub="Meetings also refresh automatically every 30 seconds while the calendar is open" value={settings.syncFrequency} onChange={v => updateSetting('syncFrequency', v)} opts={['Every 5 minutes', 'Every 15 minutes', 'Every 30 minutes']} />
            </div>
          </section>
        )}
        {page === 'integration' && (
          <section>
            <div className="ph"><div><h1>Integration</h1><p>Connect your email accounts. Their meetings sync into your calendar automatically.</p></div></div>
            <div className="cards">
              {providers.map(p => {
                const accts = accounts.filter(a => a.provider === p.id);
                const on = accts.length > 0;
                return (
                  <div key={p.id} className="icard" onClick={() => on ? setModal({ kind: 'manage', p }) : setModal({ kind: 'where', p })}>
                    <div className="ilogo" style={{ background: COLORS[p.id] }}>{p.letter}</div>
                    <h3>{p.name} Connect</h3><p>{p.desc}</p>
                    {accts.map(a => <div key={a.id} className="connected-acct"><i className="cdot" style={{ background: evColor({ provider: a.provider, accountEmail: a.email }) }} />{a.email}</div>)}
                    <span className={'status' + (on ? ' on' : '')}>{on ? `Connected (${accts.length})` : 'Not connected'}</span>
                  </div>
                );
              })}
              <div className="icard add" onClick={() => setModal({ kind: 'caldav', preset: 'other' })}>
                <div className="plus">+</div><h3>Add another email platform</h3>
                <p>Hostinger, custom domain or any other CalDAV mailbox.</p>
                {accounts.filter(a => a.provider === 'other').map(a => <div key={a.id} className="connected-acct"><i className="cdot" style={{ background: evColor({ provider: a.provider, accountEmail: a.email }) }} />{a.email}</div>)}
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
                    <button className="btn danger" onClick={async () => { await api('/accounts/' + a.id, 'DELETE'); setModal(null); load(); toast('Disconnected ' + a.email); }}>Disconnect</button>
                  </div>
                ))}
              </div>
              <div className="actions"><button className="btn" onClick={() => setModal(null)}>Close</button>
                <button className="btn primary" onClick={() => setModal({ kind: 'where', p: modal.p })}>Add another account</button></div>
            </>
          )}
          {modal?.kind === 'where' && (
            <>
              <Head color={COLORS[modal.p.id]} letter={modal.p.letter} title={`Connect ${modal.p.name}`} />
              <p className="sub">Which browser is the {modal.p.name} account signed in on?</p>
              <div className="actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <button className="btn primary" onClick={() => connect(modal.p)}>This browser</button>
                <button className="btn" onClick={() => connect(modal.p, true)}>Another browser or Chrome profile</button>
                <button className="btn" onClick={() => setModal(null)}>Cancel</button>
              </div>
              {modal.err && <p className="err">{modal.err}</p>}
              <p className="hint">Choosing another browser gives you a link to open there, so you can authorize that account without signing out here.</p>
            </>
          )}
          {modal?.kind === 'link' && (
            <>
              <Head color={COLORS[modal.p.id]} letter={modal.p.letter} title={`Connect ${modal.p.name} from another browser`} />
              <p className="sub">Copy this link and open it in the other Chrome profile or browser. Sign in and allow access there. {modal.paste ? 'That page will then show a connection code: paste it below.' : 'This page updates by itself when it is done.'}</p>
              <div className="field"><input readOnly value={modal.url} onFocus={e => e.currentTarget.select()} /></div>
              {modal.paste && <PasteCode onDone={async email => { setModal(null); await load(); setPage('calendar'); toast('Connected: ' + email + '. Syncing meetings…'); }} />}
              <p className="hint">The link is valid for 10 minutes. Only share it with yourself: whoever opens it can add their account to your calendar.</p>
              <div className="actions"><button className="btn" onClick={() => setModal(null)}>Cancel</button>
                <button className="btn primary" onClick={() => navigator.clipboard.writeText(modal.url).then(() => toast('Link copied'), () => toast('Copy failed: select the link and copy it'))}>Copy link</button></div>
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
          {modal?.kind === 'caldav' && (
            <CaldavForm preset={modal.preset} yahooUrl={providers.find(p => p.id === 'yahoo')?.caldavUrl || ''} onCancel={() => setModal(null)}
              onDone={async email => { setModal(null); await load(); toast('Connected: ' + email + '. Syncing meetings…'); }} />
          )}
        </div>
      </div>
      <div className={'toast' + (toastMsg ? ' show' : '')}>{toastMsg}</div>
    </div>
  );
}

function PasteCode({ onDone }: { onDone: (email: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="field"><label>Connection code</label>
      <textarea rows={3} value={code} onChange={e => setCode(e.target.value)} placeholder="Paste the code from the other browser" style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12 }} />
      {err && <p className="err">{err}</p>}
      <button className="btn primary" disabled={busy || !code.trim()} onClick={async () => {
        setBusy(true); setErr('');
        try { onDone((await api<{ email: string }>('/accounts/import', 'POST', { code })).email); } catch (e: any) { setErr(e.message); setBusy(false); }
      }}>{busy ? 'Adding…' : 'Add account'}</button></div>
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

function Dashboard({ count, enabled, onGo }: { count: number; enabled: boolean; onGo: (p: Page) => void }) {
  const now = new Date();
  const [from, to] = useMemo(() => {
    const s = startOfDay(new Date()); s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
    const e = new Date(s); e.setDate(e.getDate() + 7); return [s, e];
  }, []);
  const { events } = useEvents(from, to, enabled);
  const evs = events.map(e => ({ ...e, s: new Date(e.start), e2: new Date(e.end) }));
  const today = evs.filter(e => sameDay(e.s, now) || (e.allDay && e.s <= now && e.e2 > now)).sort((a, b) => +a.s - +b.s);
  return (
    <section>
      <div className="ph"><div><h1>Dashboard</h1><p>Your meetings from every connected account</p></div></div>
      <div className="stats">
        <div className="card stat"><div className="l">Meetings today</div><div className="n">{today.length}</div></div>
        <div className="card stat"><div className="l">This week</div><div className="n">{evs.length}</div></div>
        <div className="card stat"><div className="l">Connected accounts</div><div className="n">{count}</div></div>
      </div>
      <div className="card list">
        <h3 style={{ margin: '0 0 6px' }}>Today</h3>
        {today.length ? today.map(e => (
          <div className="row" key={e.id}><span className="bar" style={{ background: evColor(e) }} />
            <span className="time">{e.allDay ? 'All day' : `${fmtTime(e.s)} - ${fmtTime(e.e2)}`}</span><b>{e.title}</b><span className="src">{LABELS[e.provider]} · {e.accountEmail}</span></div>
        )) : (
          <p className="hint" style={{ padding: '12px 0' }}>
            {count ? 'No meetings today.' : <>No accounts connected yet. <a href="#" onClick={ev => { ev.preventDefault(); onGo('integration'); }}>Connect an account</a> to sync meetings.</>}
          </p>
        )}
      </div>
    </section>
  );
}

function CaldavForm({ preset, yahooUrl, onCancel, onDone }: { preset: 'yahoo' | 'other'; yahooUrl: string; onCancel: () => void; onDone: (email: string) => void }) {
  const yahoo = preset === 'yahoo';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [caldav, setCaldav] = useState(yahoo ? yahooUrl : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <>
      <Head color={yahoo ? COLORS.yahoo : COLORS.other} letter={yahoo ? 'Y' : '+'} title={yahoo ? 'Connect Yahoo' : 'Connect another email platform'} />
      <p className="sub">{yahoo ? 'Yahoo needs an app password. Create one in Yahoo Account Security, then paste it here.' : 'Enter your mailbox details. Hostinger, custom domains and any CalDAV server are supported.'}</p>
      <div className="field"><label>Email address</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus /></div>
      <div className="field"><label>{yahoo ? 'App password' : 'Mailbox password'}</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
      {!yahoo && <div className="field"><label>CalDAV URL</label><input value={caldav} onChange={e => setCaldav(e.target.value)} placeholder="https://caldav.your-provider.com" /></div>}
      <p className="hint">The password is encrypted before it is stored, and is only used to read your calendar.</p>
      {err && <p className="err">{err}</p>}
      <div className="actions"><button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={async () => {
          setBusy(true); setErr('');
          try { await api('/accounts', 'POST', { provider: preset, email: email.trim(), password, caldav }); onDone(email.trim()); }
          catch (e: any) { setErr(e.message); setBusy(false); }
        }}>{busy ? 'Checking…' : 'Connect'}</button></div>
    </>
  );
}
