'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { COLORS, LABELS, Acct, Ev, SharedCal, acctKey, evColor, fmtTime, sameDay, startOfDay, useEvents } from './shared';

export type View = 'Day' | 'Week' | 'Month' | 'Agenda';
// Zoom levels: pixels per hour, and the minutes between labelled ticks at that level.
const ZOOMS: { px: number; step: number }[] = [{ px: 48, step: 60 }, { px: 96, step: 30 }, { px: 192, step: 15 }, { px: 384, step: 5 }];
const tickLabel = (min: number) => { const h = Math.floor(min / 60), m = min % 60; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/** Where an event comes from. Shared events never reveal the owner's account addresses. */
const srcLabel = (e: Ev) => e.calendarName ? `Shared by ${e.calendarName}` : `${LABELS[e.provider]} · ${e.accountEmail}`;
const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

function rangeFor(view: View, cursor: Date): [Date, Date, Date[]] {
  if (view === 'Day') { const s = startOfDay(cursor); return [s, addDays(s, 1), [s]]; }
  // Calendar week, Monday to Sunday, containing the selected day.
  if (view === 'Week') { const s = mondayOf(cursor); return [s, addDays(s, 7), [...Array(7)].map((_, i) => addDays(s, i))]; }
  if (view === 'Month') {
    const s = mondayOf(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    return [s, addDays(s, 42), [...Array(42)].map((_, i) => addDays(s, i))];
  }
  const s = startOfDay(cursor); return [s, addDays(s, 30), []];
}

/** Places overlapping events side by side. */
function layout(list: (Ev & { s: Date; e2: Date })[]) {
  const sorted = [...list].sort((a, b) => +a.s - +b.s || +b.e2 - +a.e2);
  const out: { ev: Ev & { s: Date; e2: Date }; col: number; cols: number }[] = [];
  let cluster: typeof out = [], end = 0;
  const flush = () => { const n = Math.max(0, ...cluster.map(c => c.col + 1)); cluster.forEach(c => (c.cols = n)); out.push(...cluster); cluster = []; };
  for (const ev of sorted) {
    if (cluster.length && +ev.s >= end) flush();
    const used = new Set(cluster.filter(c => +c.ev.e2 > +ev.s).map(c => c.col));
    let col = 0; while (used.has(col)) col++;
    cluster.push({ ev, col, cols: 1 }); end = Math.max(end, +ev.e2);
  }
  flush();
  return out;
}

export default function CalendarView({ initialView, enabled, accounts, onToast, onShare, title: pageTitle = 'My Calendar', eventsPath, shared = [], showOwn = true }: { initialView: string; enabled: boolean; accounts: Acct[]; onToast: (m: string) => void; onShare?: () => void; title?: string; eventsPath?: string; shared?: SharedCal[]; showOwn?: boolean }) {
  const [view, setView] = useState<View>((['Day', 'Week', 'Month', 'Agenda'].includes(initialView) ? initialView : 'Week') as View);
  const [cursor, setCursor] = useState(() => new Date());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Ev | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { setView((['Day', 'Week', 'Month', 'Agenda'].includes(initialView) ? initialView : 'Week') as View); }, [initialView]);

  const [from, to, days] = rangeFor(view, cursor);
  const own = useEvents(from, to, enabled, 30000, eventsPath);
  // Calendars ticked in the sidebar ("Shared with me") are fetched only while at least one is ticked.
  const sharedIds = shared.map(x => x.id).sort().join(',');
  const team = useEvents(from, to, enabled && !!sharedIds, 30000, `/team/events?ids=${sharedIds}`);
  const events = useMemo(() => {
    const on = new Set(sharedIds.split(',').filter(Boolean));
    return [...(showOwn ? own.events : []), ...team.events.filter(e => e.calendarId && on.has(e.calendarId))];
  }, [own.events, team.events, sharedIds, showOwn]);
  const errors = [...own.errors, ...(sharedIds ? team.errors : [])];
  const loading = own.loading || (!!sharedIds && team.loading);
  const syncedAt = own.syncedAt;
  const refresh = () => { own.refresh(); if (sharedIds) team.refresh(); };
  const visible = events.filter(e => e.calendarId || !hidden.has(acctKey(e.provider, e.accountEmail)));

  const step = (dir: number) => setCursor(c => view === 'Month' ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : addDays(c, dir * (view === 'Week' ? 7 : view === 'Day' ? 1 : 30)));
  const title = view === 'Month' ? cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })
    : view === 'Day' ? cursor.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${from.toLocaleDateString([], { day: 'numeric', month: 'short' })} – ${addDays(to, -1).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <section>
      <div className="ph">
        <div><h1>{pageTitle}</h1><p>{title}</p></div>
        <div className="cal-tools">
          {onShare && <button className="btn" onClick={onShare}>Share</button>}
          <button className="btn" onClick={() => step(-1)}>‹</button>
          <button className="btn" onClick={() => setCursor(new Date())}>Today</button>
          <button className="btn" onClick={() => step(1)}>›</button>
          <div className="seg">{(['Day', 'Week', 'Month', 'Agenda'] as View[]).map(v => <button key={v} className={v === view ? 'on' : ''} onClick={() => setView(v)}>{v}</button>)}</div>
        </div>
      </div>

      <div className="cal-meta">
        <div className="legend">
          {accounts.length === 0 && shared.length === 0 && <span className="hint">{onShare ? 'No accounts connected. Add one under Integration.' : 'No calendars to show.'}</span>}
          {(accounts.length > 0 || shared.length > 0) && events.length === 0 && !loading && <span className="hint">No meetings in this range.</span>}
          {accounts.map(a => {
            const k = acctKey(a.provider, a.email), n = events.filter(e => acctKey(e.provider, e.accountEmail) === k).length;
            return (
              <button key={a.id} title={a.email} className={'chip' + (hidden.has(k) ? ' off' : '')} onClick={() => setHidden(h => { const s = new Set(h); s.has(k) ? s.delete(k) : s.add(k); return s; })}>
                <i style={{ background: evColor({ provider: a.provider, accountEmail: a.email }) }} />{LABELS[a.provider] || a.provider} · {a.email}<em>{n}</em>
              </button>
            );
          })}
        </div>
        <div className="sync">
          <span className={'dot' + (loading ? ' spin' : '')} />
          {loading ? 'Syncing…' : syncedAt ? 'Synced ' + fmtTime(syncedAt) : ''}
          <button className="btn" onClick={() => { refresh(); onToast('Syncing meetings…'); }}>Refresh</button>
        </div>
      </div>
      {errors.length > 0 && <div className="warn">Some accounts could not sync: {errors.join(' · ')}</div>}

      {(view === 'Week' || view === 'Day') && <TimeGrid days={days} events={visible} now={now} onOpen={setOpen} />}
      {view === 'Month' && <MonthGrid days={days} month={cursor.getMonth()} events={visible} now={now} onOpen={setOpen} onDay={d => { setCursor(d); setView('Day'); }} />}
      {view === 'Agenda' && <Agenda events={visible} onOpen={setOpen} />}

      {open && (
        <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="modal">
            <h2><span className="ilogo" style={{ background: evColor(open), width: 32, height: 32, fontSize: 15 }}>{(open.calendarName || LABELS[open.provider] || '?')[0].toUpperCase()}</span>{open.title}</h2>
            <p className="sub">{open.allDay ? 'All day · ' + new Date(open.start).toLocaleDateString() : `${new Date(open.start).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}, ${fmtTime(new Date(open.start))} – ${fmtTime(new Date(open.end))}`}</p>
            <div className="perm"><div><b>{open.calendarName ? 'Calendar:' : 'Account:'}</b> {open.calendarName ? `${open.calendarName}${open.busy ? ' (busy only, details hidden)' : ''}` : `${LABELS[open.provider]} · ${open.accountEmail}`}</div>{open.location && <div><b>Location:</b> {open.location}</div>}</div>
            <div className="actions"><button className="btn" onClick={() => setOpen(null)}>Close</button></div>
          </div>
        </div>
      )}
    </section>
  );
}

type E2 = Ev & { s: Date; e2: Date };
const prep = (events: Ev[]): E2[] => events.map(e => ({ ...e, s: new Date(e.start), e2: new Date(e.end) }));
const overlapsDay = (e: E2, d: Date) => +e.s < +addDays(d, 1) && +e.e2 > +d && !(e.allDay === false && +e.e2 === +d);

function TimeGrid({ days, events, now, onOpen }: { days: Date[]; events: Ev[]; now: Date; onOpen: (e: Ev) => void }) {
  const evs = useMemo(() => prep(events), [events]);
  const [zoom, setZoom] = useState(0);
  const [tz, setTz] = useState('');
  const body = useRef<HTMLDivElement | null>(null);
  const [sbw, setSbw] = useState(0); // width of the body's vertical scrollbar, so the header columns line up with the day columns
  const { px: HP, step } = ZOOMS[zoom];
  // Time zone is read on the client only (the server's zone may differ), e.g. "Asia/Calcutta (GMT+5:30)".
  useEffect(() => {
    try {
      const o = new Intl.DateTimeFormat(undefined, { timeZoneName: 'shortOffset' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value;
      setTz(`${Intl.DateTimeFormat().resolvedOptions().timeZone}${o ? ' (' + o + ')' : ''}`);
    } catch { setTz('UTC'); }
  }, []);
  useEffect(() => {
    const el = body.current; if (!el) return;
    const measure = () => setSbw(el.offsetWidth - el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [zoom, days.length]);
  const scroller = (el: HTMLDivElement | null) => { body.current = el; if (el && !el.dataset.done) { el.scrollTop = 7.5 * HP; el.dataset.done = '1'; } };
  const changeZoom = (next: number) => {
    if (next < 0 || next >= ZOOMS.length) return;
    const el = body.current;
    // Keep the same time of day in the middle of the view after zooming.
    const mid = el ? (el.scrollTop + el.clientHeight / 2) / HP : 0;
    setZoom(next);
    requestAnimationFrame(() => { if (el) el.scrollTop = mid * ZOOMS[next].px - el.clientHeight / 2; });
  };
  const cols = `64px repeat(${days.length},1fr)`;
  const nowTop = (now.getHours() * 60 + now.getMinutes()) / 60 * HP;
  const ticks = [...Array(24 * 60 / step)].map((_, i) => i * step).filter(m => m !== 0);
  return (
    <div className="tg">
      <div className="tg-bar">
        <span className="tg-tz" title="Meetings are shown in this time zone">🌐 {tz || '…'}</span>
        <span className="tg-zoom">
          <button className="btn" onClick={() => changeZoom(zoom - 1)} disabled={zoom === 0} aria-label="Zoom out">−</button>
          <span>{step === 60 ? '1 hour' : step + ' min'} slots</span>
          <button className="btn" onClick={() => changeZoom(zoom + 1)} disabled={zoom === ZOOMS.length - 1} aria-label="Zoom in">+</button>
        </span>
      </div>
      <div className="tg-head" style={{ gridTemplateColumns: cols, paddingRight: sbw }}>
        <div className="hd" />
        {days.map(d => <div key={+d} className={'hd' + (sameDay(d, now) ? ' today' : '')}>{d.toLocaleDateString([], { weekday: 'short' })} <b>{d.getDate()}</b></div>)}
        <div className="allday-l">all-day</div>
        {days.map(d => (
          <div key={+d} className="allday">
            {evs.filter(e => e.allDay && overlapsDay(e, d)).map(e => <button key={e.id} className="pill" style={{ background: evColor(e) }} onClick={() => onOpen(e)}>{e.title}</button>)}
          </div>
        ))}
      </div>
      <div className="tg-body" ref={scroller}>
        <div className="tg-inner" style={{ gridTemplateColumns: cols, height: 24 * HP, ['--hp' as any]: HP + 'px', ['--step' as any]: (HP * step / 60) + 'px' }}>
          <div className="gutter" style={{ position: 'relative' }}>
            {[...Array(24)].map((_, h) => <div key={h} style={{ height: HP }}><span>{h === 0 ? '' : hourLabel(h)}</span></div>)}
            {step < 60 && ticks.filter(m => m % 60 !== 0).map(m => <span key={m} className="minor" style={{ top: m / 60 * HP }}>{tickLabel(m)}</span>)}
          </div>
          {days.map(d => {
            const timed = evs.filter(e => !e.allDay && overlapsDay(e, d)).map(e => ({ ...e, s: new Date(Math.max(+e.s, +d)), e2: new Date(Math.min(+e.e2, +addDays(d, 1))) }));
            return (
              <div key={+d} className="day">
                {layout(timed).map(({ ev, col, cols: n }) => {
                  const top = (ev.s.getHours() * 60 + ev.s.getMinutes()) / 60 * HP;
                  const h = Math.max(20, (+ev.e2 - +ev.s) / 3600000 * HP - 2);
                  return (
                    <button key={ev.id} className="tev" title={`${ev.title}
${fmtTime(ev.s)} – ${fmtTime(ev.e2)}`} onClick={() => onOpen(evs.find(x => x.id === ev.id)!)}
                      style={{ top, height: h, left: `calc(${(col / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)`, background: evColor(ev) }}>
                      <b>{ev.title}</b>{h > 34 && <span>{fmtTime(ev.s)} – {fmtTime(ev.e2)}</span>}
                    </button>
                  );
                })}
                {sameDay(d, now) && <div className="nowline" style={{ top: nowTop }}><i>{fmtTime(now)}</i></div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ days, month, events, now, onOpen, onDay }: { days: Date[]; month: number; events: Ev[]; now: Date; onOpen: (e: Ev) => void; onDay: (d: Date) => void }) {
  const evs = useMemo(() => prep(events).sort((a, b) => +a.s - +b.s), [events]);
  return (
    <div className="mg">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="hd">{d}</div>)}
      {days.map(d => {
        const list = evs.filter(e => overlapsDay(e, d));
        return (
          <div key={+d} className={'mc' + (d.getMonth() !== month ? ' dim' : '') + (sameDay(d, now) ? ' today' : '')}>
            <button className="num" onClick={() => onDay(d)}>{d.getDate()}</button>
            {list.slice(0, 3).map(e => <button key={e.id} className="mev" style={{ background: evColor(e) }} onClick={() => onOpen(e)}>{!e.allDay && fmtTime(e.s) + ' '}{e.title}</button>)}
            {list.length > 3 && <button className="more" onClick={() => onDay(d)}>+{list.length - 3} more</button>}
          </div>
        );
      })}
    </div>
  );
}

function Agenda({ events, onOpen }: { events: Ev[]; onOpen: (e: Ev) => void }) {
  const evs = useMemo(() => prep(events).sort((a, b) => +a.s - +b.s), [events]);
  const groups = evs.reduce<Record<string, E2[]>>((g, e) => { (g[startOfDay(e.s).toDateString()] ||= []).push(e); return g; }, {});
  if (!evs.length) return <div className="card"><p className="hint">No meetings in the next 30 days.</p></div>;
  return (
    <div className="card list">
      {Object.entries(groups).map(([day, list]) => (
        <div key={day} style={{ marginBottom: 14 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--muted)' }}>{new Date(day).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          {list.map(e => (
            <div className="row" key={e.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(e)}>
              <span className="bar" style={{ background: evColor(e) }} />
              <span className="time">{e.allDay ? 'All day' : `${fmtTime(e.s)} - ${fmtTime(e.e2)}`}</span><b>{e.title}</b>
              <span className="src">{srcLabel(e)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
