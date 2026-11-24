'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CalendarView from './CalendarView';
import { COLORS, LABELS, SharedCal, acctKey, api, evColor, fmtTime, hasOverride, loadColorOverrides, subKey, setColorOverride, setPalette, sharedColor, sharedKey, startOfDay, sameDay, useEvents } from './shared';

type Provider = { id: string; name: string; letter: string; desc: string; kind: 'oauth' | 'caldav'; caldavUrl?: string };
type Account = { id: string; provider: string; email: string };
type Page = 'dashboard' | 'calendar' | 'settings' | 'integration';
type Modal = null | { kind: 'manage'; p: Provider } | { kind: 'connecting'; p: Provider; step: number } | { kind: 'done'; p: Provider; email: string } | { kind: 'caldav'; preset: 'yahoo' | 'other' }
  | { kind: 'share' } | { kind: 'where'; p: Provider; err?: string } | { kind: 'link'; p: Provider; url: string; count: number; paste: boolean };

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
  // Calendars teammates shared with me. Ticking a checkbox shows/hides it; the choice is remembered in this browser.
  const [shared, setShared] = useState<SharedCal[]>([]);
  const [off, setOff] = useState<Set<string>>(new Set());   // shared calendars the user has unticked (new ones default to ticked)
  const [showOwn, setShowOwn] = useState(true);
  const seen = useRef<Set<string> | null>(null);

  const [subCals, setSubCals] = useState<{ provider: string; accountEmail: string; id: string; name: string }[]>([]);
  const [, setColorVer] = useState(0); // bumps to re-render when a colour changes
  setPalette(accounts); // per-account colours
  const toast = useCallback((m: string) => { setToastMsg(m); setTimeout(() => setToastMsg(''), 3200); }, []);
  const load = useCallback(async () => {
    const [p, a, s] = await Promise.all([api('/providers'), api('/accounts'), api('/settings')]);
    setProviders(p); setAccounts(a); setSettings(s); setLoaded(true);
  }, []);

  useEffect(() => { if (page === 'settings') api('/calendars').then(setSubCals).catch(() => {}); }, [page, accounts.length]);
  useEffect(() => { loadColorOverrides(); setColorVer(v => v + 1); }, []);
  const pickColor = (key: string, c: string | null) => { setColorOverride(key, c); setColorVer(v => v + 1); };
  useEffect(() => {
    try { setOff(new Set(JSON.parse(localStorage.getItem('evo_shared_off') || '[]'))); setShowOwn(localStorage.getItem('evo_show_own') !== '0'); } catch {}
  }, []);
  const saveOff = (next: Set<string>) => { setOff(next); try { localStorage.setItem('evo_shared_off', JSON.stringify([...next])); } catch {} };
  const toggleShared = (id: string) => { const n = new Set(off); if (n.has(id)) n.delete(id); else n.add(id); saveOff(n); };
  const toggleOwn = () => { setShowOwn(v => { try { localStorage.setItem('evo_show_own', v ? '0' : '1'); } catch {} return !v; }); };

  // New shares appear in the sidebar by themselves: loaded on open, then every 60 s and when the tab regains focus.
  const loadShared = useCallback(async () => {
    try {
      const list = await api<SharedCal[]>('/team/received');
      if (seen.current) for (const c of list) if (!seen.current.has(c.id)) toast(`${c.owner} shared their calendar with you`);
      seen.current = new Set(list.map(c => c.id)); setShared(list);
    } catch { /* keep the last list */ }
  }, [toast]);
  useEffect(() => {
    loadShared();
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadShared(); }, 60000);
    const onVis = () => { if (document.visibilityState === 'visible') loadShared(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [loadShared]);

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
        <div className="brand"><div className="logo">OC</div>OneCalendar</div>
        {NAV.map(n => (
          <div key={n.id} className={'nav' + (page === n.id ? ' active' : '')} onClick={() => setPage(n.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={n.icon} /></svg>{n.label}
          </div>
        ))}
        <div className="side-sec">
          <div className="side-h">Calendars</div>
          <label className="side-cal"><input type="checkbox" checked={showOwn} onChange={toggleOwn} />
            <i style={{ background: 'var(--accent)' }} /><span>My calendar</span></label>
          <div className="side-h">Shared with me</div>
          {shared.length === 0 && <div className="side-empty">Nobody has shared a calendar with you yet. It appears here automatically when they do.</div>}
          {shared.map(c => (
            <label key={c.id} className="side-cal" title={`${c.owner} (${c.email})${c.permission === 'busy' ? ' · busy only' : ''}`}>
              <input type="checkbox" checked={!off.has(c.id)} onChange={() => toggleShared(c.id)} />
              <i style={{ background: sharedColor(c.id) }} /><span>{c.owner}</span>{c.permission === 'busy' && <em>busy only</em>}
            </label>
          ))}
        </div>
        <div className="usercard">
          <div className="avatar">{(user.name || '?')[0].toUpperCase()}</div>
          <div className="who"><b>{user.name}</b><small>{user.email}</small></div>
          <button className="btn" onClick={logout}>Sign out</button>
        </div>
      </aside>

      <main>
        {page === 'dashboard' && <Dashboard count={accounts.length} enabled={loaded} onGo={setPage} />}
        {page === 'calendar' && <CalendarView initialView={settings.defaultView} enabled={loaded} accounts={accounts} shared={shared.filter(c => !off.has(c.id))} showOwn={showOwn} onToast={toast} onShare={() => setModal({ kind: 'share' })} />}
        {page === 'settings' && (
          <section>
            <div className="ph"><div><h1>Setting</h1><p>General preferences</p></div></div>
            <div className="card">
              <div className="form-row"><div><b>Time zone</b><small>Detected automatically from your device; all meetings are shown in it</small></div>
                <span>{(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } })()}</span></div>
              <Row title="Default calendar view" sub="Opens this view in My Calendar" value={settings.defaultView} onChange={v => updateSetting('defaultView', v)} opts={['Week', 'Day', 'Month', 'Agenda']} />
              <Row title="Sync frequency" sub="Meetings also refresh automatically every 30 seconds while the calendar is open" value={settings.syncFrequency} onChange={v => updateSetting('syncFrequency', v)} opts={['Every 5 minutes', 'Every 15 minutes', 'Every 30 minutes']} />
            </div>
            <div className="card" style={{ marginTop: 16 }}>
              <div className="form-row"><div><b>Calendar colours</b><small>Choose the colour used for each calendar's meetings. Saved in this browser.</small></div></div>
              {accounts.length === 0 && shared.length === 0 && <div className="form-row"><small>Connect an account or get a calendar shared with you to pick its colour.</small></div>}
              {accounts.map(a => { const k = acctKey(a.provider, a.email); return (
                <ColorRow key={a.id} label={a.email} sub={LABELS[a.provider] || a.provider} value={evColor({ provider: a.provider, accountEmail: a.email })} custom={hasOverride(k)}
                  onChange={c => pickColor(k, c)} onReset={() => pickColor(k, null)} />); })}
              {subCals.length > 0 && <div className="form-row"><div><b>Individual calendars</b><small>Override the account colour for a single calendar inside an account</small></div></div>}
              {subCals.map(c => { const k = subKey(c.provider, c.accountEmail, c.id); return (
                <ColorRow key={k} label={c.name} sub={`${LABELS[c.provider] || c.provider} · ${c.accountEmail}`} value={evColor({ provider: c.provider, accountEmail: c.accountEmail, subId: c.id })} custom={hasOverride(k)}
                  onChange={v => pickColor(k, v)} onReset={() => pickColor(k, null)} />); })}
              {shared.map(c => { const k = sharedKey(c.id); return (
                <ColorRow key={c.id} label={c.owner} sub="Shared with me" value={sharedColor(c.id)} custom={hasOverride(k)}
                  onChange={v => pickColor(k, v)} onReset={() => pickColor(k, null)} />); })}
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
          {modal?.kind === 'share' && <ShareModal accounts={accounts} onClose={() => setModal(null)} onToast={toast} />}
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
              <ol className="guide">
                <li><div><b>Copy the link</b><span>Use the link below, or press “Copy link”.</span></div></li>
                <li><div><b>Open it in the other browser</b><span>Open that Chrome profile or browser where your {modal.p.name} account is signed in, click the address bar, paste the link and press Enter.</span></div></li>
                <li><div><b>Pick the account and allow access</b><span>Choose the {modal.p.name} account you want, then click Allow.</span></div></li>
                {modal.paste
                  ? <li><div><b>Copy the code it shows</b><span>The page says “Almost done” and shows a long code. Press “Copy code”, come back to this tab and paste it below.</span></div></li>
                  : <li><div><b>Come back here</b><span>This page updates by itself once the account is connected.</span></div></li>}
              </ol>
              <div className="field"><label>Link to open in the other browser</label><input readOnly value={modal.url} onFocus={e => e.currentTarget.select()} /></div>
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
                {[`Signing in to ${modal.p.name}`, 'Authorizing OneCalendar', 'Connecting your calendars', 'Syncing meetings'].map((t, i) => (
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

type Mine = { id: string; recipient: string; permission: 'details' | 'busy'; accounts: { id: string; provider: string; email: string }[] };
const PERMS: [string, string, string][] = [['details', 'Can see details', 'titles, times and locations'], ['busy', 'Busy only', 'no titles or locations']];

function ShareModal({ accounts, onClose, onToast }: { accounts: Account[]; onClose: () => void; onToast: (m: string) => void }) {
  const [tab, setTab] = useState<'people' | 'link'>('people');
  return (
    <div style={{ maxHeight: '80vh', overflowY: 'auto' }}>
      <div className="seg" style={{ marginBottom: 14, display: 'inline-flex' }}>
        <button className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>Share with people</button>
        <button className={tab === 'link' ? 'on' : ''} onClick={() => setTab('link')}>Share a link</button>
      </div>
      {tab === 'people' ? <PeopleForm accounts={accounts} onClose={onClose} onToast={onToast} /> : <LinkForm onClose={onClose} onToast={onToast} />}
    </div>
  );
}

type Person = { email: string; name: string; department: string };
/** Searchable list of everyone in the EvoCore AI user list; clicking a person adds or removes their email in the box above. */
function DirectoryPicker({ emails, setEmails }: { emails: string; setEmails: (v: string) => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { api('/team/directory').then(r => setPeople(r.people || [])).catch(() => {}); }, []);
  if (!people.length) return null;
  const chosen = new Set(emails.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean));
  const toggle = (e: string) => { const n = new Set(chosen); if (n.has(e)) n.delete(e); else n.add(e); setEmails([...n].join(', ')); };
  const t = q.trim().toLowerCase();
  const shown = people.filter(p => !t || p.name.toLowerCase().includes(t) || p.email.includes(t) || p.department.toLowerCase().includes(t));
  return (
    <div className="field"><label>Pick from your team ({people.length})</label>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, email or department" style={{ width: '100%', marginBottom: 6 }} />
      <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: '2px 8px' }}>
        {shown.map(p => (
          <label key={p.email} className="check" style={{ margin: '5px 0' }}>
            <input type="checkbox" checked={chosen.has(p.email)} onChange={() => toggle(p.email)} />
            <span>{p.name} <span className="hint">· {p.email}{p.department ? ` · ${p.department}` : ''}</span></span>
          </label>
        ))}
        {!shown.length && <span className="hint">No match</span>}
      </div></div>
  );
}

function PeopleForm({ accounts, onClose, onToast }: { accounts: Account[]; onClose: () => void; onToast: (m: string) => void }) {
  const [info, setInfo] = useState<{ available: boolean; domain: string; shares: Mine[] } | null>(null);
  const [emails, setEmails] = useState('');
  const [org, setOrg] = useState(false);
  const [perm, setPerm] = useState<'details' | 'busy'>('details');
  const [pick, setPick] = useState<Set<string>>(new Set(accounts.map(a => a.id)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const reload = useCallback(() => api('/team/shares').then(setInfo).catch(e => setErr(e.message)), []);
  useEffect(() => { reload(); }, [reload]);
  if (!info) return <p className="hint">{err || 'Loading…'}</p>;
  if (!info.available) return <><p className="err">Sharing with teammates needs the Supabase database. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server first.</p><div className="actions"><button className="btn" onClick={onClose}>Close</button></div></>;
  return (
    <>
      <h2>Share your calendar</h2>
      <p className="sub">People you add see your calendar in their OneCalendar sidebar automatically, under “Shared with me”.</p>
      <div className="field"><label>Email addresses (their Zoho sign-in emails)</label>
        <textarea rows={2} value={emails} onChange={e => setEmails(e.target.value)} placeholder="divyam@yourcompany.com, shubham@yourcompany.com" style={{ width: '100%', fontFamily: 'inherit', fontSize: 13, border: '1px solid var(--line)', borderRadius: 8, padding: 8 }} /></div>
      <DirectoryPicker emails={emails} setEmails={setEmails} />
      {info.domain && <label className="check"><input type="checkbox" checked={org} onChange={e => setOrg(e.target.checked)} /> Everyone at <b>@{info.domain}</b></label>}
      <div className="field" style={{ marginTop: 10 }}><label>Permission</label>
        <select value={perm} onChange={e => setPerm(e.target.value as 'details' | 'busy')}>{PERMS.map(([v, l, d]) => <option key={v} value={v}>{l} ({d})</option>)}</select></div>
      <div className="field"><label>Accounts to include</label>
        {accounts.length === 0 && <span className="hint">Connect an account under Integration first.</span>}
        {accounts.map(a => (
          <label key={a.id} className="check"><input type="checkbox" checked={pick.has(a.id)} onChange={() => setPick(p => { const n = new Set(p); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })} />
            <i className="cdot" style={{ background: evColor({ provider: a.provider, accountEmail: a.email }) }} />{LABELS[a.provider] || a.provider} · {a.email}</label>
        ))}</div>
      {err && <p className="err">{err}</p>}
      <div className="actions"><button className="btn" onClick={onClose}>Close</button>
        <button className="btn primary" disabled={busy || (!emails.trim() && !org)} onClick={async () => {
          setBusy(true); setErr('');
          try {
            const r = await api('/team/shares', 'POST', { emails, organization: org, permission: perm, accountIds: [...pick] });
            setInfo(i => i && { ...i, shares: r.shares }); setEmails(''); setOrg(false);
            onToast(`Shared with ${r.count} ${r.count === 1 ? 'recipient' : 'recipients'}`);
          } catch (e: any) { setErr(e.message); }
          setBusy(false);
        }}>{busy ? 'Sharing…' : 'Share'}</button></div>
      {info.shares.length > 0 && (
        <div className="perm" style={{ marginTop: 16, marginBottom: 0 }}>
          <b style={{ fontSize: 13 }}>Shared with</b>
          {info.shares.map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.accounts.map(a => a.email).join(', ')}>{s.recipient.startsWith('@') ? `Everyone at ${s.recipient}` : s.recipient}</span>
              <select value={s.permission} onChange={async e => {
                const v = e.target.value as 'details' | 'busy';
                try { await api('/team/shares/' + s.id, 'PATCH', { permission: v }); setInfo(i => i && { ...i, shares: i.shares.map(x => x.id === s.id ? { ...x, permission: v } : x) }); onToast('Permission updated'); }
                catch (er: any) { setErr(er.message); }
              }}>{PERMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <button className="btn danger" onClick={async () => { try { await api('/team/shares/' + s.id, 'DELETE'); reload(); onToast('Stopped sharing with ' + s.recipient); } catch (er: any) { setErr(er.message); } }}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <p className="hint">Recipients can only view. Remove someone to stop sharing; disconnecting an account also stops sharing it.</p>
    </>
  );
}

function LinkForm({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
  const [days, setDays] = useState('7');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <>
      <h2>Share your calendar</h2>
      <p className="sub">Create a read-only link. Anyone who has it can see the full details of every meeting from all your connected accounts, but cannot change anything.</p>
      <div className="field"><label>Link expires after</label>
        <select value={days} onChange={e => { setDays(e.target.value); setUrl(''); }}>
          {[['1', '1 day'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></div>
      {url && <div className="field"><label>Share this link</label><input readOnly value={url} onFocus={e => e.currentTarget.select()} /></div>}
      {err && <p className="err">{err}</p>}
      <p className="hint">Send the link only to people you trust. It cannot be revoked individually before it expires.</p>
      <div className="actions"><button className="btn" onClick={onClose}>Close</button>
        {url
          ? <button className="btn primary" onClick={() => navigator.clipboard.writeText(url).then(() => onToast('Link copied'), () => onToast('Copy failed: select the link and copy it'))}>Copy link</button>
          : <button className="btn primary" disabled={busy} onClick={async () => {
              setBusy(true); setErr('');
              try { setUrl((await api<{ url: string }>('/share', 'POST', { days: Number(days) })).url); } catch (e: any) { setErr(e.message); }
              setBusy(false);
            }}>{busy ? 'Creating…' : 'Create link'}</button>}</div>
    </>
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

function ColorRow({ label, sub, value, custom, onChange, onReset }: { label: string; sub: string; value: string; custom: boolean; onChange: (c: string) => void; onReset: () => void }) {
  return (
    <div className="form-row"><div><b>{label}</b><small>{sub}</small></div>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="color" aria-label={`Colour for ${label}`} value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#2563eb'} onChange={e => onChange(e.target.value)} style={{ width: 36, height: 28, padding: 0, border: 0, background: 'none', cursor: 'pointer' }} />
        {custom && <button className="btn" onClick={onReset}>Reset</button>}
      </span></div>
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
    const s = startOfDay(new Date());
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
        <div className="card stat"><div className="l">Next 7 days</div><div className="n">{evs.length}</div></div>
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
      {yahoo ? (
        <div className="ysteps">
          <p className="sub" style={{ marginBottom: 8 }}>Yahoo doesn’t accept your normal password here. Create a one-time <b>app password</b> first:</p>
          <ol>
            <li>Open <a href="https://login.yahoo.com/account/security" target="_blank" rel="noreferrer">Yahoo Account Security</a> and sign in.</li>
            <li>Turn on <b>Two-step verification</b> if it isn’t on already.</li>
            <li>Choose <b>Generate app password</b>, name it “OneCalendar” and click Generate.</li>
            <li>Copy the 16-character code Yahoo shows.</li>
            <li>Enter your full Yahoo email below and paste that code as the app password.</li>
          </ol>
        </div>
      ) : <p className="sub">Enter your mailbox details. Hostinger, custom domains and any CalDAV server are supported.</p>}
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
