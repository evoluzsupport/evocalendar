'use client';
import { useEffect, useMemo, useState } from 'react';
import { COLORS, LABELS, Acct, Ev, acctKey, evColor, fmtTime, sameDay, startOfDay, useEvents } from './shared';

export type View = 'Day' | 'Week' | 'Month' | 'Agenda';
const HOUR_PX = 48;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

function rangeFor(view: View, cursor: Date): [Date, Date, Date[]] {
  if (view === 'Day') { const s = startOfDay(cursor); return [s, addDays(s, 1), [s]]; }
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

export default function CalendarView({ initialView, enabled, accounts, onToast }: { initialView: string; enabled: boolean; accounts: Acct[]; onToast: (m: string) => void }) {
  const [view, setView] = useState<View>((['Day', 'Week', 'Month', 'Agenda'].includes(initialView) ? initialView : 'Week') as View);
  const [cursor, setCursor] = useState(() => new Date());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Ev | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { setView((['Day', 'Week', 'Month', 'Agenda'].includes(initialView) ? initialView : 'Week') as View); }, [initialView]);

  const [from, to, days] = rangeFor(view, cursor);
  const { events, syncedAt, errors, loading, refresh } = useEvents(from, to, enabled);
  const visible = events.filter(e => !hidden.has(acctKey(e.provider, e.accountEmail)));

  const step = (dir: number) => setCursor(c => view === 'Month' ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : addDays(c, dir * (view === 'Week' ? 7 : view === 'Day' ? 1 : 30)));
  const title = view === 'Month' ? cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })
    : view === 'Day' ? cursor.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${from.toLocaleDateString([], { day: 'numeric', month: 'short' })} – ${addDays(to, -1).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <section>
      <div className="ph">
        <div><h1>My Calendar</h1><p>{title}</p></div>
        <div className="cal-tools">
          <button className="btn" onClick={() => step(-1)}>‹</button>
          <button className="btn" onClick={() => setCursor(new Date())}>Today</button>
          <button className="btn" onClick={() => step(1)}>›</button>
          <div className="seg">{(['Day', 'Week', 'Month', 'Agenda'] as View[]).map(v => <button key={v} className={v === view ? 'on' : ''} onClick={() => setView(v)}>{v}</button>)}</div>
        </div>
      </div>

      <div className="cal-meta">
        <div className="legend">
          {accounts.length === 0 && <span className="hint">No accounts connected. Add one under Integration.</span>}
          {accounts.length > 0 && events.length === 0 && !loading && <span className="hint">No meetings in this range.</span>}
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
            <h2><span className="ilogo" style={{ background: evColor(open), width: 32, height: 32, fontSize: 15 }}>{(LABELS[open.provider] || '?')[0]}</span>{open.title}</h2>
            <p className="sub">{open.allDay ? 'All day · ' + new Date(open.start).toLocaleDateString() : `${new Date(open.start).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}, ${fmtTime(new Date(open.start))} – ${fmtTime(new Date(open.end))}`}</p>
            <div className="perm"><div><b>Account:</b> {LABELS[open.provider]} · {open.accountEmail}</div>{open.location && <div><b>Location:</b> {open.location}</div>}</div>
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
  const scroller = (el: HTMLDivElement | null) => { if (el && !el.dataset.done) { el.scrollTop = 7.5 * HOUR_PX; el.dataset.done = '1'; } };
  const cols = `56px repeat(${days.length},1fr)`;
  const nowTop = (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_PX;
  return (
    <div className="tg">
      <div className="tg-head" style={{ gridTemplateColumns: cols }}>
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
        <div className="tg-inner" style={{ gridTemplateColumns: cols, height: 24 * HOUR_PX }}>
          <div className="gutter">{[...Array(24)].map((_, h) => <div key={h} style={{ height: HOUR_PX }}><span>{h === 0 ? '' : `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`}</span></div>)}</div>
          {days.map(d => {
            const timed = evs.filter(e => !e.allDay && overlapsDay(e, d)).map(e => ({ ...e, s: new Date(Math.max(+e.s, +d)), e2: new Date(Math.min(+e.e2, +addDays(d, 1))) }));
            return (
              <div key={+d} className="day">
                {layout(timed).map(({ ev, col, cols: n }) => {
                  const top = (ev.s.getHours() * 60 + ev.s.getMinutes()) / 60 * HOUR_PX;
                  const h = Math.max(20, (+ev.e2 - +ev.s) / 3600000 * HOUR_PX - 2);
                  return (
                    <button key={ev.id} className="tev" title={ev.title} onClick={() => onOpen(evs.find(x => x.id === ev.id)!)}
                      style={{ top, height: h, left: `calc(${(col / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)`, background: evColor(ev) }}>
                      <b>{ev.title}</b>{h > 34 && <span>{fmtTime(ev.s)} – {fmtTime(ev.e2)}</span>}
                    </button>
                  );
                })}
                {sameDay(d, now) && <div className="nowline" style={{ top: nowTop }} />}
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
              <span className="src">{LABELS[e.provider]} · {e.accountEmail}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
